const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path'); // 需要 path 模块

const app = express();
const port = process.env.PORT || 3000;

// --- 中间件设置 ---

// CORS 配置 (保持不变)
app.use(cors({
  origin: '*',
  methods: 'GET, POST, OPTIONS',
  allowedHeaders: 'Content-Type, Authorization, x-custom-cookie, x-advanced-mode, x-custom-prompt',
}));

// 处理 JSON 和 URL 编码的请求体 (保持不变)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// **新增**: 配置静态文件服务
// 这会告诉 Express 在 'public' 目录下查找静态文件 (如 index.html, css, js)
app.use(express.static(path.join(__dirname, 'public')));

// Multer 配置 (保持不变)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- 路由处理 ---

// **修改**: 根路径现在发送 index.html 文件
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API 路由 (保持不变)
app.post('/api/recognize/url', async (req, res) => {
  await handleImageUrlRecognition(req, res);
});

app.post('/api/recognize/base64', async (req, res) => {
  await handleBase64Recognition(req, res);
});

app.post('/recognize', async (req, res) => {
    await handleFileRecognition(req, res);
});

app.post('/proxy/upload', upload.single('file'), async (req, res) => {
  await handleProxyUpload(req, res);
});

// --- 核心处理函数 (handleImageUrlRecognition, handleBase64Recognition, handleFileRecognition, handleProxyUpload, recognizeImage) ---
// --- 这些函数保持和你之前版本一致，无需修改 ---
// ... (此处省略未更改的核心处理函数代码，请从你之前的 server.js 复制过来) ...
// 处理图片URL识别
async function handleImageUrlRecognition(req, res) {
  try {
    const { imageUrl } = req.body; // 从 Express 的 req.body 获取
    const cookie = req.get('x-custom-cookie') || ''; // 从 Express 的 req.get 获取 header

    if (!cookie || !imageUrl) {
      return res.status(400).json({ error: 'Missing cookie or imageUrl' });
    }

    const tokenMatch = cookie.match(/token=([^;]+)/);
    if (!tokenMatch) {
        return res.status(400).json({ error: 'Invalid cookie format: missing token' });
    }
    const token = tokenMatch[1];

    // 下载图片
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
        throw new Error(`Failed to download image from URL: ${imageResponse.statusText}`);
    }
    // 注意：Node.js 的 fetch 返回的 blob() 方法是异步的
    const imageBlob = await imageResponse.blob();

    // 上传到QwenLM
    const formData = new FormData();
    // Node.js 的 FormData 可以直接附加 Blob
    formData.append('file', imageBlob, 'image.png'); // 建议给 Blob 一个文件名

    const uploadResponse = await fetch('https://chat.qwenlm.ai/api/v1/files/', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'authorization': `Bearer ${token}`,
        'cookie': cookie
        // 注意：Node.js 的 fetch 会自动设置 Content-Type for FormData
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`File upload failed: ${uploadResponse.statusText} - ${errorText}`);
    }
    const uploadData = await uploadResponse.json();
    if (!uploadData.id) throw new Error('File upload failed: No ID received');

    // 调用通用识别函数 (传入 req 以便访问 headers)
    await recognizeImage(token, uploadData.id, req, res);
  } catch (error) {
    console.error("Error in handleImageUrlRecognition:", error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}

// 处理Base64识别
async function handleBase64Recognition(req, res) {
  try {
    const { base64Image } = req.body;
    const cookie = req.get('x-custom-cookie') || '';

    if (!cookie || !base64Image) {
        return res.status(400).json({ error: 'Missing cookie or base64Image' });
    }

    const tokenMatch = cookie.match(/token=([^;]+)/);
    if (!tokenMatch) {
        return res.status(400).json({ error: 'Invalid cookie format: missing token' });
    }
    const token = tokenMatch[1];

    // 转换Base64为Buffer (Node.js 方式)
    let base64Data = base64Image;
    let mimeType = 'image/png'; // 默认 PNG

    if (base64Image.startsWith('data:')) {
        const parts = base64Image.match(/^data:(image\/.*?);base64,(.*)$/);
        if (parts && parts.length === 3) {
            mimeType = parts[1];
            base64Data = parts[2];
        } else {
            // 如果格式不匹配但以 data: 开头，尝试去掉前缀
             base64Data = base64Image.substring(base64Image.indexOf(',') + 1);
        }
    }

    const buffer = Buffer.from(base64Data, 'base64');
    const blob = new Blob([buffer], { type: mimeType });

    // 上传到QwenLM
    const formData = new FormData();
    formData.append('file', blob, 'image.png'); // 给 Blob 一个文件名

    const uploadResponse = await fetch('https://chat.qwenlm.ai/api/v1/files/', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'authorization': `Bearer ${token}`,
        'cookie': cookie
      },
      body: formData,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`File upload failed: ${uploadResponse.statusText} - ${errorText}`);
    }
    const uploadData = await uploadResponse.json();
    if (!uploadData.id) throw new Error('File upload failed: No ID received');

    // 调用通用识别函数
    await recognizeImage(token, uploadData.id, req, res);
  } catch (error) {
    console.error("Error in handleBase64Recognition:", error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}

// 处理文件识别 (原有功能) - 这个端点接收的是 imageId
async function handleFileRecognition(req, res) {
  try {
    const { imageId } = req.body;
    const cookie = req.get('x-custom-cookie') || '';

    if (!cookie || !imageId) {
      return res.status(400).json({ error: 'Missing cookie or imageId' });
    }

    const tokenMatch = cookie.match(/token=([^;]+)/);
    const token = tokenMatch ? tokenMatch[1] : '';
    if (!token) {
        return res.status(400).json({ error: 'Invalid cookie format: missing token' });
    }

    await recognizeImage(token, imageId, req, res);
  } catch (error) {
    console.error("Error in handleFileRecognition:", error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}

// 添加代理处理函数
async function handleProxyUpload(req, res) {
  try {
    // 文件在 req.file 中 (由 multer 处理)
    const file = req.file;
    if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const cookie = req.get('x-custom-cookie') || '';

    const tokenMatch = cookie.match(/token=([^;]+)/);
    const token = tokenMatch ? tokenMatch[1] : '';
    if (!token) {
        return res.status(400).json({ error: 'Invalid cookie format: missing token' });
    }

    // 使用文件的 buffer 创建 Blob
    const blob = new Blob([file.buffer], { type: file.mimetype });
    const formData = new FormData();
    formData.append('file', blob, file.originalname); // 使用原始文件名

    const response = await fetch('https://chat.qwenlm.ai/api/v1/files/', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'authorization': `Bearer ${token}`,
        'cookie': cookie
      },
      body: formData,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Proxy upload failed: ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();

    // 直接返回 Qwen 的响应
    res.status(response.status).json(data);

  } catch (error) {
    console.error("Error in handleProxyUpload:", error);
    res.status(500).json({ error: error.message || 'Proxy upload failed' });
  }
}

// 通用的识别函数 (接收 res 用于发送响应)
async function recognizeImage(token, imageId, req, res) {
  try {
      const cookie = req.get('x-custom-cookie') || '';

      // 从请求头中获取高级模式状态和自定义prompt
      const advancedMode = req.get('x-advanced-mode') === 'true';

      // 解码自定义prompt
      let customPrompt = '';
      try {
        const encodedPrompt = req.get('x-custom-prompt');
        if (encodedPrompt) {
          // Node.js 的 Buffer 可以直接处理 Base64
          // 需要先 URL 解码 (因为前端是 encodeURIComponent -> btoa)
          // 但前端实际是 btoa(unescape(encodeURIComponent(promptInput.value)))
          // 因此后端直接 Buffer.from(base64, 'base64').toString('utf-8') 应该可以
          customPrompt = Buffer.from(encodedPrompt, 'base64').toString('utf-8');
        }
      } catch (error) {
        console.error('Prompt解码错误:', error);
        // 保持默认 prompt
      }

      const defaultPrompt =
          '不要输出任何额外的解释或说明,禁止输出例如：识别内容、以上内容已严格按照要求进行格式化和转换等相关无意义的文字！' + '请识别图片中的内容，注意以下要求：\n' +
          '对于数学公式和普通文本：\n' +
          '1. 所有数学公式和数学符号都必须使用标准的LaTeX格式\n' +
          '2. 行内公式使用单个$符号包裹，如：$x^2$\n' +
          '3. 独立公式块使用两个$$符号包裹，如：$$\\sum_{i=1}^n i^2$$\n' +
          '4. 普通文本保持原样，不要使用LaTeX格式\n' +
          '5. 保持原文的段落格式和换行\n' +
          '6. 明显的换行使用\\n表示\n' +
          '7. 确保所有数学符号都被正确包裹在$或$$中\n\n' +
          '对于验证码图片：\n' +
          '1. 只输出验证码字符，不要加任何额外解释\n' +
          '2. 忽略干扰线和噪点\n' +
          '3. 注意区分相似字符，如0和O、1和l、2和Z等\n' +
          '4. 验证码通常为4-6位字母数字组合\n\n' +
          '';

      const finalPrompt = advancedMode && customPrompt ? customPrompt : defaultPrompt;

      const response = await fetch('https://chat.qwenlm.ai/api/chat/completions', {
          method: 'POST',
          headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Node-Express-App/1.0', // 更简洁的 User-Agent
          'accept': '*/*',
          'authorization': `Bearer ${token}`,
          'cookie': cookie,
          },
          body: JSON.stringify({
          stream: false,
          chat_type: "t2t",
          model: 'qwen-max-latest',
          messages: [
              {
              role: 'user',
              content: [
                  {
                  type: 'text',
                  text: finalPrompt, // 使用最终确定的 prompt
                  chat_type: "t2t"
                  },
                  {
                  type: 'image',
                  image: imageId,
                  chat_type: "t2t"
                  },
              ],
              },
          ],
          // 这些 ID 可能不需要，或者可以生成随机的
          // session_id: '1',
          // chat_id: '2',
          // id: '3',
          }),
      });

      if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Qwen API request failed: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      // 添加更安全的访问器 ?.
      let result = data?.choices?.[0]?.message?.content || '识别失败';
      let responseType = 'text'; // 默认类型

      // 只在非高级模式下进行格式化处理
      if (!advancedMode) {
          // 如果结果长度小于10且只包含字母数字，很可能是验证码
          if (result !== '识别失败' && result.length <= 10 && /^[A-Za-z0-9]+$/.test(result)) {
              result = result.toUpperCase();
              responseType = 'captcha';
          } else if (result !== '识别失败') {
              // 其他情况（数学公式和普通文本）的处理
              result = result
                  .replace(/\\（/g, '\\(')
                  .replace(/\\）/g, '\\)')
                  .replace(/\n{3,}/g, '\n\n')
                  .replace(/\$\s+/g, '$')
                  .replace(/\s+\$/g, '$')
                  .trim();
          }
      }

      // 使用 res 发送 JSON 响应
      res.json({
          success: true,
          result: result,
          type: responseType
      });

  } catch (error) {
      console.error("Error in recognizeImage:", error);
      // 确保即使在识别函数内部出错也返回标准的错误格式
      res.status(500).json({ success: false, error: error.message || 'Recognition failed' });
  }
}

// --- 服务器启动 ---
app.listen(port, () => {
  console.log(`Qwen OCR server listening at http://localhost:${port}`);
});

// --- 全局错误处理 (保持不变) ---
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.stack || err);
  if (res.headersSent) { // 如果响应头已发送，则委托给 Express 的默认错误处理
    return next(err);
  }
  res.status(500).json({ success: false, error: 'Internal Server Error' });
});