addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const cookie = decodeURIComponent(request.headers.get('x-custom-cookie')) || ''; // 从自定义请求头获取 cookie

  // 处理 CORS 预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-custom-cookie', // 添加自定义请求头
      },
    });
  }

  // API路由处理
  switch (url.pathname) {
    // 1. 通过图片URL识别
    case '/api/recognize/url':
      if (request.method === 'POST') {
        return handleImageUrlRecognition(request);
      }
      break;

    // 2. 通过Base64识别
    case '/api/recognize/base64':
      if (request.method === 'POST') {
        return handleBase64Recognition(request);
      }
      break;

    // 3. 通过图片文件识别 (原有的/recognize端点)
    case '/recognize':
      if (request.method === 'POST') {
        return handleFileRecognition(request);
      }
      break;

    // 添加代理路由
    case '/proxy/upload':
      if (request.method === 'POST') {
        return handleProxyUpload(request);
      }
      break;

    // 返回前端界面
    case '/':
      return new Response(getHTML(), {
        headers: { 'Content-Type': 'text/html' },
      });
  }

  return new Response('Not Found', { status: 404 });
}

// 处理图片URL识别
async function handleImageUrlRecognition(request) {
  try {
    const { imageUrl } = await request.json();
    const cookie = decodeURIComponent(request.headers.get('x-custom-cookie'));

    if (!cookie || !imageUrl) {
      return new Response(JSON.stringify({
        error: 'Missing cookie or imageUrl'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 从cookie中提取token
    const tokenMatch = cookie.match(/token=([^;]+)/);
    if (!tokenMatch) {
      return new Response(JSON.stringify({
        error: 'Invalid cookie format: missing token'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const token = tokenMatch[1];

    // 下载图片
    const imageResponse = await fetch(imageUrl);
    const imageBlob = await imageResponse.blob();

    // 上传到QwenLM
    const formData = new FormData();
    formData.append('file', imageBlob);

    const uploadResponse = await fetch('https://chat.qwenlm.ai/api/v1/files/', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'authorization': `Bearer ${token}`,
        'cookie': cookie
      },
      body: formData,
    });

    const uploadData = await uploadResponse.json();
    if (!uploadData.id) throw new Error('File upload failed');

    // 调用通用识别函数
    return await recognizeImage(token, uploadData.id, request);
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message || 'Internal Server Error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// 处理Base64识别
async function handleBase64Recognition(request) {
  try {
    const { base64Image } = await request.json();
    const cookie = decodeURIComponent(request.headers.get('x-custom-cookie'));

    if (!cookie || !base64Image) {
      return new Response(JSON.stringify({
        error: 'Missing cookie or base64Image'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 从cookie中提取token
    const tokenMatch = cookie.match(/token=([^;]+)/);
    if (!tokenMatch) {
      return new Response(JSON.stringify({
        error: 'Invalid cookie format: missing token'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const token = tokenMatch[1];

    // 转换Base64为Blob
    const imageData = base64Image.startsWith('data:') ? base64Image : 'data:image/png;base64,' + base64Image;
    const response = await fetch(imageData);
    const blob = await response.blob();

    // 上传到QwenLM
    const formData = new FormData();
    formData.append('file', blob);

    const uploadResponse = await fetch('https://chat.qwenlm.ai/api/v1/files/', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'authorization': `Bearer ${token}`,
        'cookie': cookie
      },
      body: formData,
    });

    const uploadData = await uploadResponse.json();
    if (!uploadData.id) throw new Error('File upload failed');

    // 调用通用识别函数
    return await recognizeImage(token, uploadData.id, request);
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message || 'Internal Server Error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// 处理文件识别 (原有功能)
async function handleFileRecognition(request) {
  try {
    const { imageId } = await request.json();
    const cookie = decodeURIComponent(request.headers.get('x-custom-cookie')) || '';

    if (!cookie || !imageId) {
      return new Response(JSON.stringify({
        error: 'Missing cookie or imageId'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 从cookie中提取token
    const tokenMatch = cookie.match(/token=([^;]+)/);
    const token = tokenMatch ? tokenMatch[1] : '';

    return await recognizeImage(token, imageId, request);
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message || 'Internal Server Error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// 添加代理处理函数
async function handleProxyUpload(request) {
  try {
    const formData = await request.formData();
    const cookie = decodeURIComponent(request.headers.get('x-custom-cookie')) || '';
    
    // 从cookie中提取token
    const tokenMatch = cookie.match(/token=([^;]+)/);
    const token = tokenMatch ? tokenMatch[1] : '';
    
    const response = await fetch('https://chat.qwenlm.ai/api/v1/files/', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'authorization': `Bearer ${token}`,
        'cookie': cookie
      },
      body: formData,
    });

    const data = await response.json();
    
    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message || 'Proxy upload failed'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

// 通用的识别函数
async function recognizeImage(token, imageId, request) {
  const cookie = decodeURIComponent(request.headers.get('x-custom-cookie')) || '';
  const response = await fetch('https://chat.qwenlm.ai/api/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'PostmanRuntime/7.43.0', 
      'accept': '*/*',
      'authorization': `Bearer ${token}`,
      'cookie': cookie,
    },
    body: JSON.stringify({
      stream: false,
      chat_type: "t2t",
      model: 'qwen2.5-vl-72b-instruct',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '请识别图片中的内容，注意以下要求：\n' +
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
                    '不要输出任何额外的解释或说明',
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
      session_id: '1',
      chat_id: '2',
      id: '3',
    }),
  });

  const data = await response.json();
  let result = data.choices[0]?.message?.content || '识别失败';

  // 如果结果长度小于10且只包含字母数字，很可能是验证码
  if (result.length <= 10 && /^[A-Za-z0-9]+$/.test(result)) {
    return new Response(JSON.stringify({
      success: true,
      result: result.toUpperCase(), // 验证码统一转大写
      type: 'captcha'
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // 其他情况（数学公式和普通文本）的处理
  result = result
    .replace(/\\（/g, '\\(')
    .replace(/\\）/g, '\\)')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/([^\n])\n([^\n])/g, '$1\n$2')
    .replace(/\$\s+/g, '$')
    .replace(/\s+\$/g, '$')
    .replace(/\$\$/g, '$$')
    .trim();

  return new Response(JSON.stringify({
    success: true,
    result: result,
    type: 'text'
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function getHTML() {
  const html = [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<link rel="icon" type="image/png" href="data:image/png;base64,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">',
    '<title>Qwen VL 智能识别系统</title>',

    // 添加 MathJax 支持
    '<script src="https://polyfill.io/v3/polyfill.min.js?features=es6"></script>',
    '<script>',
    'window.MathJax = {',
    '  tex: {',
    '    inlineMath: [["$", "$"]],',
    '    displayMath: [["$$", "$$"]]',
    '  },',
    '  startup: {',
    '    pageReady: () => {',
    '      return MathJax.startup.defaultPageReady().then(() => {',
    '        // MathJax 加载完成后刷新历史记录',
    '        if (currentToken) {',
    '          historyManager.displayHistory(currentToken);',
    '        }',
    '      });',
    '    }',
    '  },',
    '  options: {',
    '    enableMenu: false',
    '  }',
    '};',
    '</script>',
    '<script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>',
    '<script>',
    'function waitForMathJax(callback, maxTries = 30) {',
    '  let tries = 0;',
    '  const checkMathJax = () => {',
    '    tries++;',
    '    if (window.MathJax && window.MathJax.typesetPromise) {',
    '      callback();',
    '    } else if (tries < maxTries) {',
    '      setTimeout(checkMathJax, 100);',
    '    }',
    '  };',
    '  checkMathJax();',
    '}',
    '</script>',

    '<style>',
    '    * {',
    '      box-sizing: border-box;',
    '      margin: 0;',
    '      padding: 0;',
    '    }',

    '    body {',
    '      font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Oxygen, Ubuntu, sans-serif;',
    '      background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);',
    '      min-height: 100vh;',
    '      display: flex;',
    '      justify-content: center;',
    '      align-items: center;',
    '      padding: 20px;',
    '    }',

    '    .container {',
    '      background: rgba(255, 255, 255, 0.95);',
    '      padding: 2.5rem;',
    '      padding-bottom: 4rem;',
    '      border-radius: 16px;',
    '      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);',
    '      width: 90%;',
    '      max-width: 800px;',
    '      transition: all 0.3s ease;',
    '    }',

    '    h1 {',
    '      color: #2c3e50;',
    '      margin-bottom: 0.5rem;',
    '      font-size: 2.2rem;',
    '      text-align: center;',
    '      font-weight: 700;',
    '      text-transform: uppercase;',
    '      letter-spacing: 2px;',
    '      background: linear-gradient(135deg, #1a5fb4 0%, #3498db 100%);',
    '      -webkit-background-clip: text;',
    '      -webkit-text-fill-color: transparent;',
    '      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.1);',
    '      position: relative;',
    '      padding-bottom: 10px;',
    '      animation: titleFadeIn 1s ease-out;',
    '    }',

    '    @keyframes titleFadeIn {',
    '      from {',
    '        opacity: 0;',
    '        transform: translateY(-20px);',
    '      }',
    '      to {',
    '        opacity: 1;',
    '        transform: translateY(0);',
    '      }',
    '    }',

    '    h1::after {',
    '      content: "";',
    '      position: absolute;',
    '      bottom: 0;',
    '      left: 50%;',
    '      transform: translateX(-50%);',
    '      width: 100px;',
    '      height: 3px;',
    '      background: linear-gradient(90deg, transparent, #3498db, transparent);',
    '    }',

    '    .subtitle {',
    '      color: #7f8c8d;',
    '      text-align: center;',
    '      font-size: 1.1rem;',
    '      margin-bottom: 1.5rem;',
    '      font-weight: 300;',
    '      letter-spacing: 1px;',
    '      opacity: 0.8;',
    '      animation: subtitleFadeIn 1s ease-out 0.3s both;',
    '    }',

    '    @keyframes subtitleFadeIn {',
    '      from {',
    '        opacity: 0;',
    '        transform: translateY(10px);',
    '      }',
    '      to {',
    '        opacity: 0.8;',
    '        transform: translateY(0);',
    '      }',
    '    }',

    '    .upload-area {',
    '      border: 2px dashed #8e9eab;',
    '      border-radius: 12px;',
    '      padding: 2rem;',
    '      text-align: center;',
    '      transition: all 0.3s ease;',
    '      margin-bottom: 1.5rem;',
    '      cursor: pointer;',
    '      position: relative;',
    '      overflow: hidden;',
    '    }',

    '    .upload-area:hover {',
    '      border-color: #3498db;',
    '      background: rgba(52, 152, 219, 0.05);',
    '    }',

    '    .upload-area.dragover {',
    '      border-color: #3498db;',
    '      background: rgba(52, 152, 219, 0.1);',
    '      transform: scale(1.02);',
    '    }',

    '    .upload-area i {',
    '      font-size: 2rem;',
    '      color: #8e9eab;',
    '      margin-bottom: 1rem;',
    '    }',

    '    .upload-text {',
    '      color: #7f8c8d;',
    '      font-size: 0.9rem;',
    '    }',

    '    #tokens {',
    '      width: 100%;',
    '      padding: 0.8rem;',
    '      border: 1px solid #dcdde1;',
    '      border-radius: 8px;',
    '      margin-bottom: 1rem;',
    '      font-size: 0.9rem;',
    '      resize: none;',
    '    }',

    '    .result-container {',
    '      margin-top: 1.5rem;',
    '      opacity: 0;',
    '      transform: translateY(20px);',
    '      transition: all 0.3s ease;',
    '    }',

    '    .result-container.show {',
    '      opacity: 1;',
    '      transform: translateY(0);',
    '    }',

    '    .result {',
    '      background: #f8f9fa;',
    '      padding: 1.2rem;',
    '      border-radius: 8px;',
    '      color: #2c3e50;',
    '      font-size: 1rem;',
    '      line-height: 1.6;',
    '      white-space: pre-wrap;',
    '    }',

    '    .loading {',
    '      display: none;',
    '      text-align: center;',
    '      margin: 1rem 0;',
    '    }',

    '    .loading::after {',
    '      content: \'\';',
    '      display: inline-block;',
    '      width: 20px;',
    '      height: 20px;',
    '      border: 2px solid #3498db;',
    '      border-radius: 50%;',
    '      border-top-color: transparent;',
    '      animation: spin 0.8s linear infinite;',
    '    }',

    '    @keyframes spin {',
    '      to { transform: rotate(360deg); }',
    '    }',

    '    .preview-image {',
    '      max-width: 100%;',
    '      max-height: 200px;',
    '      margin: 1rem 0;',
    '      border-radius: 8px;',
    '      display: none;',
    '    }',

    '    /* 侧边栏样式 */',
    '    .sidebar {',
    '      position: fixed;',
    '      right: -300px;',
    '      top: 0;',
    '      width: 300px;',
    '      height: 100vh;',
    '      background: white;',
    '      box-shadow: -5px 0 15px rgba(0, 0, 0, 0.1);',
    '      transition: right 0.3s ease;',
    '      padding: 20px;',
    '      z-index: 1000;',
    '    }',

    '    .sidebar.open {',
    '      right: 0;',
    '    }',

    '    .sidebar-toggle {',
    '      position: fixed;',
    '      right: 20px;',
    '      top: 20px;',
    '      background: #3498db;',
    '      color: white;',
    '      border: none;',
    '      padding: 10px 15px;',
    '      border-radius: 5px;',
    '      cursor: pointer;',
    '      z-index: 1001;',
    '    }',

    '    .token-list {',
    '      margin-top: 20px;',
    '    }',

    '    .token-item {',
    '      background: #f8f9fa;',
    '      padding: 10px;',
    '      margin-bottom: 10px;',
    '      border-radius: 5px;',
    '      cursor: pointer;',
    '      word-break: break-all;',
    '    }',

    '    .token-item:hover {',
    '      background: #e9ecef;',
    '    }',

    '    #tokenInput {',
    '      width: 100%;',
    '      padding: 10px;',
    '      margin-bottom: 10px;',
    '      border: 1px solid #dcdde1;',
    '      border-radius: 5px;',
    '    }',

    '    .save-btn {',
    '      background: #3498db;',
    '      color: white;',
    '      border: none;',
    '      padding: 10px 15px;',
    '      border-radius: 5px;',
    '      cursor: pointer;',
    '      width: 100%;',
    '    }',

    '    /* 历史记录样式 */',
    '    .history-container {',
    '      margin-top: 2rem;',
    '      border-top: 1px solid #eee;',
    '      padding-top: 1rem;',
    '    }',

    '    .history-title {',
    '      color: #2c3e50;',
    '      font-size: 1.2rem;',
    '      margin-bottom: 1rem;',
    '    }',

    '    .history-item {',
    '      display: flex;',
    '      align-items: flex-start;',
    '      padding: 1rem;',
    '      background: #f8f9fa;',
    '      border-radius: 8px;',
    '      margin-bottom: 1rem;',
    '    }',

    '    .history-image {',
    '      width: 100px;',
    '      height: 100px;',
    '      object-fit: cover;',
    '      border-radius: 4px;',
    '      margin-right: 1rem;',
    '    }',

    '    .history-content {',
    '      flex: 1;',
    '    }',

    '    .history-text {',
    '      color: #2c3e50;',
    '      font-size: 0.9rem;',
    '      line-height: 1.4;',
    '    }',

    '    .history-time {',
    '      color: #7f8c8d;',
    '      font-size: 0.8rem;',
    '      margin-top: 0.5rem;',
    '    }',

    '    .no-history {',
    '      text-align: center;',
    '      color: #7f8c8d;',
    '      padding: 1rem;',
    '    }',

    '    .modal {',
    '      display: none;',
    '      position: fixed;',
    '      top: 0;',
    '      left: 0;',
    '      width: 100%;',
    '      height: 100%;',
    '      background-color: rgba(0, 0, 0, 0.9);',
    '      z-index: 2000;',
    '      cursor: pointer;',
    '    }',

    '    .modal-content {',
    '      max-width: 90%;',
    '      max-height: 90vh;',
    '      margin: auto;',
    '      display: block;',
    '      position: relative;',
    '      top: 50%;',
    '      transform: translateY(-50%);',
    '    }',

    '    /* 修改侧边栏样式 */',
    '    .sidebar {',
    '      position: fixed;',
    '      right: -400px;',
    '      top: 0;',
    '      width: 400px;',
    '      height: 100vh;',
    '      background: rgba(255, 255, 255, 0.95);',
    '      backdrop-filter: blur(10px);',
    '      box-shadow: -5px 0 15px rgba(0, 0, 0, 0.1);',
    '      transition: right 0.3s ease;',
    '      padding: 30px;',
    '      z-index: 1000;',
    '    }',

    '    .sidebar-header {',
    '      display: flex;',
    '      justify-content: space-between;',
    '      align-items: center;',
    '      margin-bottom: 20px;',
    '      padding-bottom: 15px;',
    '      border-bottom: 2px solid #eee;',
    '    }',

    '    .sidebar-header h2 {',
    '      margin: 0;',
    '      color: #2c3e50;',
    '      font-size: 1.5rem;',
    '    }',

    '    .close-sidebar {',
    '      background: none;',
    '      border: none;',
    '      font-size: 1.5rem;',
    '      cursor: pointer;',
    '      color: #7f8c8d;',
    '    }',

    '    .token-section {',
    '      margin-bottom: 25px;',
    '    }',

    '    .token-section label {',
    '      display: block;',
    '      margin-bottom: 10px;',
    '      color: #34495e;',
    '      font-weight: 500;',
    '    }',

    '    #tokenInput {',
    '      width: 100%;',
    '      padding: 12px;',
    '      border: 2px solid #e9ecef;',
    '      border-radius: 8px;',
    '      font-size: 0.95rem;',
    '      transition: border-color 0.3s ease;',
    '      margin-bottom: 15px;',
    '    }',

    '    #tokenInput:focus {',
    '      outline: none;',
    '      border-color: #3498db;',
    '    }',

    '    .save-btn {',
    '      background: #3498db;',
    '      color: white;',
    '      border: none;',
    '      padding: 12px 20px;',
    '      border-radius: 8px;',
    '      cursor: pointer;',
    '      width: 100%;',
    '      font-size: 1rem;',
    '      transition: background 0.3s ease;',
    '    }',

    '    .save-btn:hover {',
    '      background: #2980b9;',
    '    }',

    '    .token-list {',
    '      margin-top: 25px;',
    '      max-height: calc(100vh - 250px);',
    '      overflow-y: auto;',
    '    }',

    '    .token-item {',
    '      background: #f8f9fa;',
    '      padding: 15px;',
    '      margin-bottom: 12px;',
    '      border-radius: 8px;',
    '      cursor: pointer;',
    '      transition: all 0.3s ease;',
    '      border: 2px solid transparent;',
    '    }',

    '    .token-item:hover {',
    '      background: #e9ecef;',
    '      transform: translateX(-5px);',
    '    }',

    '    .token-item.active {',
    '      border-color: #3498db;',
    '      background: #f1f9ff;',
    '    }',

    '    /* 添加左侧边栏样式 */',
    '    .history-sidebar {',
    '      position: fixed;',
    '      left: -400px;',
    '      top: 0;',
    '      width: 400px;',
    '      height: 100vh;',
    '      background: rgba(255, 255, 255, 0.98);',
    '      backdrop-filter: blur(10px);',
    '      box-shadow: 5px 0 15px rgba(0, 0, 0, 0.1);',
    '      transition: left 0.3s ease;',
    '      padding: 20px;',
    '      z-index: 1000;',
    '      overflow-y: auto;',
    '    }',

    '    .history-sidebar.open {',
    '      left: 0;',
    '    }',

    '    .history-toggle {',
    '      position: fixed;',
    '      left: 20px;',
    '      top: 20px;',
    '      background: #3498db;',
    '      color: white;',
    '      border: none;',
    '      padding: 10px 15px;',
    '      border-radius: 5px;',
    '      cursor: pointer;',
    '      z-index: 1001;',
    '    }',

    '    /* 添加复制按钮样式 */',
    '    .result-header {',
    '      display: flex;',
    '      justify-content: space-between;',
    '      align-items: center;',
    '      margin-bottom: 10px;',
    '    }',

    '    .copy-btn {',
    '      background: #3498db;',
    '      color: white;',
    '      border: none;',
    '      padding: 5px 10px;',
    '      border-radius: 4px;',
    '      cursor: pointer;',
    '      font-size: 0.9rem;',
    '      transition: background 0.3s ease;',
    '    }',

    '    .copy-btn:hover {',
    '      background: #2980b9;',
    '    }',

    '    .copy-btn.copied {',
    '      background: #27ae60;',
    '    }',

    '    /* Base64输入相关样式 */',
    '    #base64Input {',
    '      width: 100%;',
    '      height: 100px;',
    '      padding: 10px;',
    '      margin-top: 10px;',
    '      border: 1px solid #dcdde1;',
    '      border-radius: 8px;',
    '      resize: vertical;',
    '    }',
    '    .toggle-btn {',
    '      background: #3498db;',
    '      color: white;',
    '      border: none;',
    '      padding: 8px 15px;',
    '      border-radius: 5px;',
    '      cursor: pointer;',
    '      margin-top: 10px;',
    '      transition: background 0.3s ease;',
    '    }',
    '    .toggle-btn:hover {',
    '      background: #2980b9;',
    '    }',

    '    /* 修改历史记录侧边栏样式 */',
    '    .history-item {',
    '      background: #ffffff;',
    '      border-radius: 12px;',
    '      margin-bottom: 20px;',
    '      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);',
    '      overflow: hidden;',
    '      transition: transform 0.2s ease, box-shadow 0.2s ease;',
    '    }',

    '    .history-item:hover {',
    '      transform: translateY(-2px);',
    '      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);',
    '    }',

    '    .history-image-container {',
    '      position: relative;',
    '      width: 100%;',
    '      height: 200px;',
    '      overflow: hidden;',
    '    }',

    '    .history-image {',
    '      width: 100%;',
    '      height: 100%;',
    '      object-fit: cover;',
    '      transition: transform 0.3s ease;',
    '    }',

    '    .image-overlay {',
    '      position: absolute;',
    '      top: 0;',
    '      left: 0;',
    '      width: 100%;',
    '      height: 100%;',
    '      background: rgba(0, 0, 0, 0.4);',
    '      display: flex;',
    '      justify-content: center;',
    '      align-items: center;',
    '      opacity: 0;',
    '      transition: opacity 0.3s ease;',
    '    }',

    '    .history-image-container:hover .image-overlay {',
    '      opacity: 1;',
    '    }',

    '    .history-image-container:hover .history-image {',
    '      transform: scale(1.05);',
    '    }',

    '    .overlay-btn {',
    '      background: rgba(255, 255, 255, 0.9);',
    '      color: #2c3e50;',
    '      border: none;',
    '      padding: 8px 16px;',
    '      border-radius: 20px;',
    '      cursor: pointer;',
    '      font-size: 0.9rem;',
    '      transition: all 0.2s ease;',
    '    }',

    '    .overlay-btn:hover {',
    '      background: #ffffff;',
    '      transform: scale(1.05);',
    '    }',

    '    .history-content {',
    '      padding: 16px;',
    '    }',

    '    .history-header {',
    '      display: flex;',
    '      justify-content: space-between;',
    '      align-items: center;',
    '      margin-bottom: 12px;',
    '      padding-bottom: 12px;',
    '      border-bottom: 1px solid #eee;',
    '    }',

    '    .history-time {',
    '      color: #7f8c8d;',
    '      font-size: 0.9rem;',
    '    }',

    '    .history-actions {',
    '      display: flex;',
    '      gap: 8px;',
    '    }',

    '    .action-btn {',
    '      background: none;',
    '      border: 1px solid #e0e0e0;',
    '      padding: 4px 8px;',
    '      border-radius: 4px;',
    '      cursor: pointer;',
    '      font-size: 0.8rem;',
    '      transition: all 0.2s ease;',
    '    }',

    '    .action-btn.copy-btn {',
    '      color: #3498db;',
    '    }',

    '    .action-btn.delete-btn {',
    '      color: #e74c3c;',
    '    }',

    '    .action-btn:hover {',
    '      background: #f8f9fa;',
    '      transform: translateY(-1px);',
    '    }',

    '    .history-text {',
    '      color: #2c3e50;',
    '      font-size: 0.95rem;',
    '      line-height: 1.6;',
    '      max-height: 200px;',
    '      overflow-y: auto;',
    '      padding-right: 8px;',
    '    }',

    '    .history-text::-webkit-scrollbar {',
    '      width: 4px;',
    '    }',

    '    .history-text::-webkit-scrollbar-track {',
    '      background: #f1f1f1;',
    '    }',

    '    .history-text::-webkit-scrollbar-thumb {',
    '      background: #c0c0c0;',
    '      border-radius: 2px;',
    '    }',

    '    .footer {',
    '      position: fixed;',
    '      bottom: 0;',
    '      left: 0;',
    '      width: 100%;',
    '      padding: 15px;',
    '      text-align: center;',
    '      background: rgba(255, 255, 255, 0.9);',
    '      backdrop-filter: blur(5px);',
    '      z-index: 900;',
    ' display: flex;',           
    '      justify-content: center;', 
    '      align-items: center;',     
    '    }',
'    .footer-content {',
'      text-align: center;',      
'      width: 100%;',
'    }',
    '    .powered-by {',
'      color: #7f8c8d;',
'      font-size: 0.9rem;',
'    }',

'    .powered-by a {',
'      color: #3498db;',
'      text-decoration: none;',
'      transition: color 0.3s ease;',
'      font-weight: 500;',
'    }',

'    .powered-by a:hover {',
'      color: #2980b9;',
'    }',

'    .powered-by {',
'      color: #7f8c8d;',
'      font-size: 0.9rem;',
'    }',

'    .powered-by a {',
'      color: #3498db;',
'      text-decoration: none;',
'      transition: color 0.3s ease;',
'      font-weight: 500;',
'    }',

'    .powered-by a:hover {',
'      color: #2980b9;',
'    }',

'    /* 输入控件组样式 */',
'    .input-controls {',
'      margin-top: 15px;',
'      width: 100%;',
'    }',

'    .button-group {',
'      display: flex;',
'      gap: 10px;',
'      margin-top: 10px;',
'      justify-content: center;',
'    }',

'    #urlInput {',
'      width: 100%;',
'      padding: 10px;',
'      border: 1px solid #dcdde1;',
'      border-radius: 8px;',
'      resize: none;',
'      font-size: 14px;',
'    }',

'    .github-link {',
'      position: fixed;',
'      right: 150px;', // 放在 token 设置按钮左边',
'      top: 20px;',
'      background: #333;', // GitHub 的深色背景',
'      color: white;',
'      border: none;',
'      padding: 10px;',
'      border-radius: 50%;', // 圆形按钮',
'      cursor: pointer;',
'      z-index: 1001;',
'      width: 40px;',
'      height: 40px;',
'      display: flex;',
'      align-items: center;',
'      justify-content: center;',
'      transition: background 0.3s ease;',
'    }',

'    .github-link:hover {',
'      background: #24292e;', // GitHub hover 颜色',
'    }',

'    .github-icon {',
'      width: 24px;',
'      height: 24px;',
'    }',

'    .cookie-input-container {',
'      margin-bottom: 15px;',
'    }',

'    #cookieInput {',
'      width: 100%;',
'      padding: 12px;',
'      border: 2px solid #e9ecef;',
'      border-radius: 8px;',
'      font-size: 0.95rem;',
'      resize: vertical;',
'      min-height: 120px;',
'      font-family: monospace;',
'      line-height: 1.4;',
'    }',

'    #cookieInput:focus {',
'      outline: none;',
'      border-color: #3498db;',
'    }',

'    .cookie-info {',
'      background: #f8f9fa;',
'      padding: 12px;',
'      border-radius: 8px;',
'      margin-bottom: 15px;',
'    }',

'    .cookie-info p {',
'      margin: 0;',
'      color: #2c3e50;',
'      font-size: 0.9rem;',
'    }',

'    #currentTokenDisplay {',
'      color: #3498db;',
'      font-family: monospace;',
'      word-break: break-all;',
'    }',
    '</style>',
    '</head>',
    '<body>',
    '<a href="https://github.com/Cunninger/ocr-based-qwen" target="_blank" rel="noopener noreferrer" class="github-link" title="View on GitHub">',
    '  <svg class="github-icon" viewBox="0 0 16 16" fill="currentColor">',
    '    <path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>',
    '  </svg>',
    '</a>',
    '<button class="sidebar-toggle" id="sidebarToggle">⚙️ Cookie设置</button>',
    '<div class="sidebar" id="sidebar">',
    '<div class="sidebar-header">',
    '<h2>Cookie管理</h2>',
    '<button class="close-sidebar" id="closeSidebar">×</button>',
    '</div>',
    '<div class="token-section">',
    '<label for="cookieInput">输入Cookie</label>',
    '<div class="cookie-input-container">',
    '<textarea id="cookieInput" placeholder="请输入完整的cookie字符串..." rows="8"></textarea>',
    '</div>',
    '<div class="cookie-info">',
    '<p>当前Token: <span id="currentTokenDisplay">未设置</span></p>',
    '</div>',
    '<button class="save-btn" id="saveTokens">保存设置</button>',
    '</div>',
    // 添加 tokenList 容器
    '<div class="token-list" id="tokenList"></div>', // 添加这一行
    '</div>',

    '<div class="container">',
    '<h1>Qwen VL 智能识别系统</h1>',
    '<div class="subtitle">基于通义千问大模型的多模态智能识别引擎</div>',
    '<div class="upload-area" id="uploadArea">',
    '<i>📸</i>',
    '<div class="upload-text">',
    '拖拽图片到这里，点击上传，或粘贴图片/Base64/URL<br>',
    '支持多种输入方式',
    '</div>',
    '<div class="input-controls">',
    '<textarea id="base64Input" placeholder="在此输入Base64格式的图片内容..." style="display: none; width: 100%; height: 100px; margin-top: 10px;"></textarea>',
    '<textarea id="urlInput" placeholder="在此输入图片URL..." style="display: none; width: 100%; height: 40px; margin-top: 10px;"></textarea>',
    '<div class="button-group">',
    '<button id="toggleBase64" class="toggle-btn">Base64输入</button>',
    '<button id="toggleUrl" class="toggle-btn">URL输入</button>',
    '</div>',
    '</div>',
    '<img id="previewImage" class="preview-image">',
    '</div>',
    '<div class="loading" id="loading"></div>',
    '<div class="result-container" id="resultContainer">',
    '<div class="result-header">',
    '<span>识别结果</span>',
    '<button class="copy-btn" id="copyBtn">复制结果</button>',
    '</div>',
    '<div class="result" id="result"></div>',
    '</div>',
    '<button class="history-toggle" id="historyToggle">📋 识别历史</button>',
    '<div class="history-sidebar" id="historySidebar">',
    '<h2>识别历史</h2>',
    '<div id="historyList"></div>',
    '</div>',
    '<div class="footer-content">',
    '<div class="powered-by">',
    '由 <a href="https://chat.qwenlm.ai/" target="_blank" rel="noopener noreferrer">Qwen VL</a> 提供支持，一切仅用于学习使用！',
    '</div>',
    '</div>',
    '</div>',

    '<div id="imageModal" class="modal">',
    '<img class="modal-content" id="modalImage">',
    '</div>',

    '<script>',
    '    // 首先定义类',
    '    function HistoryManager() {',
    '      this.maxHistory = 10;',
    '    }',

    '    // 添加原型方法',
    '    HistoryManager.prototype.getHistoryKey = function(token) {',
    '      return \'imageRecognition_history_\' + token;',
    '    };',

    '    HistoryManager.prototype.loadHistory = function(token) {',
    '      const history = localStorage.getItem(this.getHistoryKey(token));',
    '      return history ? JSON.parse(history) : [];',
    '    };',

    '    HistoryManager.prototype.saveHistory = function(token, history) {',
    '      localStorage.setItem(this.getHistoryKey(token), JSON.stringify(history));',
    '    };',

    '    HistoryManager.prototype.addHistory = function(token, imageData, result) {',
    '      const history = this.loadHistory(token);',
    '      const newRecord = {',
    '        image: imageData,',
    '        result: result,',
    '        timestamp: new Date().toISOString()',
    '      };',

    '      history.unshift(newRecord);',
    '      if (history.length > this.maxHistory) {',
    '        history.pop();',
    '      }',

    '      this.saveHistory(token, history);',
    '      this.displayHistory(token);',
    '    };',

    '    HistoryManager.prototype.displayHistory = function(token) {',
    '      const history = this.loadHistory(token);',

    '      if (history.length === 0) {',
    '        historyList.innerHTML = \'<div class="no-history">暂无识别历史</div>\';',
    '        return;',
    '      }',

    '      var html = \'\';',
    '      history.forEach((record, i) => {',
    '        // 确保 image 数据存在且格式正确',
    '        const imageUrl = record.image && (',
    '          record.image.startsWith(\'data:\') ? ',
    '          record.image : ',
    '          `data:image/png;base64,${record.image}`',
    '        );',

    '        const timestamp = new Date(record.timestamp);',
    '        const timeStr = timestamp.toLocaleString(\'zh-CN\', {',
    '          year: \'numeric\',',
    '          month: \'2-digit\',',
    '          day: \'2-digit\',',  // Add comma here
    '          hour: \'2-digit\',',
    '          minute: \'2-digit\'',
    '        });',

    '        html += `',
    '          <div class="history-item" data-index="${i}">',
    '            <div class="history-image-container">',
    '              <img src="${imageUrl}" ',
    '                   class="history-image" ',
    '                   alt="历史图片" ',
    '                   onerror="this.src=\'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=\'"',
    '                   onclick="event.stopPropagation(); showFullImage(\'${imageUrl}\')">',
    '              <div class="image-overlay">',
    '                <button class="overlay-btn" onclick="event.stopPropagation(); showFullImage(\'${imageUrl}\')">查看大图</button>',
    '              </div>',
    '            </div>',
    '            <div class="history-content">',
    '              <div class="history-header">',
    '                <span class="history-time">${timeStr}</span>',
    '                <div class="history-actions">',
    '                  <button class="action-btn copy-btn" onclick="event.stopPropagation(); copyHistoryResult(${i}, this)">复制结果</button>',
    '                  <button class="action-btn delete-btn" onclick="event.stopPropagation(); deleteHistoryItem(${i})">删除</button>',
    '                </div>',
    '              </div>',
    '              <div class="history-text" data-original-text="${record.result || \'无识别结果\'}">${record.result || \'无识别结果\'}</div>',
    '            </div>',
    '          </div>',
    '        `;',
    '      });',

    '      historyList.innerHTML = html;',

    '      // 使用 waitForMathJax 函数处理公式渲染',
    '      waitForMathJax(() => {',
    '        try {',
    '          MathJax.typesetPromise([historyList])',
    '            .catch(err => console.error("MathJax渲染错误:", err));',
    '        } catch (err) {',
    '          console.error("MathJax处理错误:", err);',
    '        }',
    '      });',
    '    };',

    '    // 初始化变量',
    '    const uploadArea = document.getElementById(\'uploadArea\');',
    '    const tokensInput = document.getElementById(\'tokenInput\');',
    '    const resultDiv = document.getElementById(\'result\');',
    '    const resultContainer = document.getElementById(\'resultContainer\');',
    '    const loading = document.getElementById(\'loading\');',
    '    const previewImage = document.getElementById(\'previewImage\');',
    '    const historyList = document.getElementById(\'historyList\');',
    '    const sidebar = document.getElementById(\'sidebar\');',
    '    const sidebarToggle = document.getElementById(\'sidebarToggle\');',
    '    const tokenInput = document.getElementById(\'tokenInput\');',
    '    const saveTokensBtn = document.getElementById(\'saveTokens\');',
    '    const tokenList = document.getElementById(\'tokenList\');',
    '    const historySidebar = document.getElementById(\'historySidebar\');',
    '    const historyToggle = document.getElementById(\'historyToggle\');',

    '    let currentToken = \'\';',
    '    let tokens = [];',
    '    const historyManager = new HistoryManager();',

    '    // 从localStorage加载保存的tokens',
    '    function loadTokens() {',
    '      const savedTokens = localStorage.getItem(\'imageRecognitionTokens\');',
    '      if (savedTokens) {',
    '        tokens = savedTokens.split(\',\');',
    '        updateTokenList();',
    '        if (tokens.length > 0) {',
    '          currentToken = tokens[0];',
    '        }',
    '      }',
    '    }',

    '    // 修改 updateTokenList 函数',
    '    function updateTokenList() {',
    '      const tokenList = document.getElementById(\'tokenList\');',
    '      if (!tokenList) {',
    '        console.error(\'找不到tokenList元素\');',
    '        return;',
    '      }',
    '      tokenList.innerHTML = "";',
    '      tokens.forEach(function(token, index) {',
    '        var truncatedToken = token.slice(0, 10) + "..." + token.slice(-10);',
    '        var div = document.createElement("div");',
    '        div.className = "token-item" + (token === currentToken ? " active" : "");',
    '        div.textContent = "Token " + (index + 1) + ": " + truncatedToken;',
    '        div.addEventListener("click", function() {',
    '          document.querySelectorAll(".token-item").forEach(item => item.classList.remove("active"));',
    '          div.classList.add("active");',
    '          currentToken = token;',
    '          historyManager.displayHistory(currentToken);',
    '        });',
    '        tokenList.appendChild(div);',
    '      });',  
    '      const tokenInput = document.getElementById(\'tokenInput\');',
    '      if (tokenInput) {',
    '        tokenInput.value = tokens.join(",");',
    '      }',
    '    }',

    '    // 保存tokens',
    '    saveTokensBtn.addEventListener(\'click\', () => {',
    '      const cookieValue = document.getElementById(\'cookieInput\').value.trim();',
    '      if (!cookieValue) {',
    '        alert(\'请输入Cookie\');',
    '        return;',
    '      }',
    '      ',
    '      // 从cookie中提取token',
    '      const tokenMatch = cookieValue.match(/token=([^;]+)/);',
    '      if (!tokenMatch) {',
    '        alert(\'无法从Cookie中提取token，请确保Cookie中包含token字段\');',
    '        return;',
    '      }',
    '      ',
    '      const token = tokenMatch[1];',
    '      tokens = [token];',
    '      currentToken = token;',
    '      ',
    '      // 保存cookie和token',
    '      localStorage.setItem(\'imageRecognitionCookie\', cookieValue);',
    '      localStorage.setItem(\'imageRecognitionTokens\', token);',
    '      ',
    '      // 更新显示',
    '      document.getElementById(\'currentTokenDisplay\').textContent = ',
    '        token.slice(0, 10) + "..." + token.slice(-10);',
    '      ',
    '      alert(\'设置已保存\');',
    '    });',

    '    // 侧边栏开关',
    '    sidebarToggle.addEventListener(\'click\', () => {',
    '      sidebar.classList.toggle(\'open\');',
    '    });',

    '    // 处理文件上传和识别',
    '    async function processImage(file) {',
    '      if (!currentToken) {',
    '        alert(\'请先设置并选择一个Token\');',
    '        sidebar.classList.add(\'open\');',
    '        return;',
    '      }',

    '      const savedCookie = localStorage.getItem(\'imageRecognitionCookie\');',
    '      if (!savedCookie) {',
    '        alert(\'请先设置Cookie\');',
    '        sidebar.classList.add(\'open\');',
    '        return;',
    '      }',

    '      // 显示图片预览',
    '      const reader = new FileReader();',
    '      let imageData;',
    '      reader.onload = (e) => {',
    '        imageData = e.target.result;',
    '        previewImage.src = imageData;',
    '        previewImage.style.display = \'block\';',
    '      };',
    '      reader.readAsDataURL(file);',

    '      // 显示加载动画',
    '      loading.style.display = \'block\';',
    '      resultContainer.classList.remove(\'show\');',

    '      try {',
    '        // 上传文件',
    '        const formData = new FormData();',
    '        formData.append(\'file\', file);',

    '        const uploadResponse = await fetch(\'/proxy/upload\', {',
    '          method: \'POST\',',
    '          headers: {',
    '            \'x-custom-cookie\': savedCookie,',
    '          },',
    '          body: formData,',
    '        });',

    '        const uploadData = await uploadResponse.json();',
    '        if (!uploadData.id) throw new Error(\'文件上传失败\');',

    '        // 识别图片',
    '        const recognizeResponse = await fetch(\'/recognize\', {',
    '          method: \'POST\',',
    '          headers: { ',
    '            \'Content-Type\': \'application/json\',',
    '            \'x-custom-cookie\': savedCookie,',
    '          },',
    '          body: JSON.stringify({ imageId: uploadData.id }),',
    '        });',

    '        const recognizeData = await recognizeResponse.json();',
    '        if (!recognizeData.success) {',
    '          throw new Error(recognizeData.error || \'识别失败\');',
    '        }',

    '        const result = recognizeData.result || \'识别失败\';',
    '        resultDiv.setAttribute(\'data-original-text\', result);',
    '        resultDiv.innerHTML = result;',
    '        waitForMathJax(() => {',
    '          try {',
    '            MathJax.typesetPromise([resultDiv])',
    '              .then(() => {',
    '                resultContainer.classList.add(\'show\');',
    '              })',
    '              .catch(err => {',
    '                console.error("MathJax渲染错误:", err);',
    '                resultContainer.classList.add(\'show\');',
    '              });',
    '          } catch (err) {',
    '            console.error("MathJax处理错误:", err);',
    '            resultContainer.classList.add(\'show\');',
    '          }',
    '        });',

    '        // 添加到历史记录',
    '        historyManager.addHistory(currentToken, imageData, result);',
    '      } catch (error) {',
    '        resultDiv.textContent = \'处理失败: \' + error.message;',
    '        resultContainer.classList.add(\'show\');',
    '        copyBtn.textContent = \'复制结果\';',
    '        copyBtn.classList.remove(\'copied\');',
    '      } finally {',
    '        loading.style.display = \'none\';',
    '      }',
    '    }',

    '    // 文件拖放处理',
    '    uploadArea.addEventListener(\'dragover\', (e) => {',
    '      e.preventDefault();',
    '      uploadArea.classList.add(\'dragover\');',
    '    });',

    '    uploadArea.addEventListener(\'dragleave\', () => {',
    '      uploadArea.classList.remove(\'dragover\');',
    '    });',

    '    uploadArea.addEventListener(\'drop\', (e) => {',
    '      e.preventDefault();',
    '      uploadArea.classList.remove(\'dragover\');',
    '      const file = e.dataTransfer.files[0];',
    '      if (file && file.type.startsWith(\'image/\')) {',
    '        processImage(file);',
    '      }',
    '    });',

    '    // 点击上传',
    '    uploadArea.addEventListener(\'click\', (e) => {',
    '      // 如果点击的是 base64Input 或 toggleBase64 按钮，不触发文件上传',
    '      if (e.target.id === \'base64Input\' || ',
    '          e.target.id === \'toggleBase64\' || ',
    '          e.target.closest(\'#base64Input\') || ',
    '          e.target.closest(\'#toggleBase64\')) {',
    '        return;',
    '      }',

    '      const input = document.createElement(\'input\');',
    '      input.type = \'file\';',
    '      input.accept = \'image/*\';',
    '      input.onchange = (e) => {',
    '        const file = e.target.files[0];',
    '        if (file) processImage(file);',
    '      };',
    '      input.click();',
    '    });',

    '    // 粘贴处理',
    '    document.addEventListener(\'paste\', (e) => {',
    '      const file = e.clipboardData.files[0];',
    '      if (file && file.type.startsWith(\'image/\')) {',
    '        processImage(file);',
    '      }',
    '    });',

    '    // 初始化',
    '    loadTokens();',
    '    if (currentToken) {',
    '      historyManager.displayHistory(currentToken);',
    '    }',

    '    const modal = document.getElementById(\'imageModal\');',
    '    const modalImg = document.getElementById(\'modalImage\');',

    '    function showFullImage(src) {',
    '      const modal = document.getElementById(\'imageModal\');',
    '      const modalImg = document.getElementById(\'modalImage\');',

    '      if (!src) {',
    '        console.error(\'图片源为空\');',
    '        return;',
    '      }',

    '      modal.style.display = \'block\';',
    '      modalImg.src = src;',

    '      // 添加加载错误处理',
    '      modalImg.onerror = function() {',
    '        alert(\'图片加载失败\');',
    '        modal.style.display = \'none\';',
    '      };',

    '      modalImg.style.opacity = \'0\';',
    '      setTimeout(() => {',
    '        modalImg.style.transition = \'opacity 0.3s ease\';',
    '        modalImg.style.opacity = \'1\';',
    '      }, 50);',
    '    }',

    '    // 点击模态框关闭',
    '    modal.onclick = function() {',
    '      modal.style.display = "none";',
    '    }',

    '    // ESC 键关闭模态框',
    '    document.addEventListener(\'keydown\', function(e) {',
    '      if (e.key === \'Escape\' && modal.style.display === \'block\') {',
    '        modal.style.display = \'none\';',
    '      }',
    '    });',

    '    // 左侧历史记录边栏开关',
    '    historyToggle.addEventListener(\'click\', () => {',
    '      historySidebar.classList.toggle(\'open\');',
    '    });',

    '    const copyBtn = document.getElementById(\'copyBtn\');',

    '    // 修改复制结果功能，保持完整的 LaTeX 格式',
    '    copyBtn.addEventListener(\'click\', async () => {',
    '      // 获取原始文本（包含完整的 LaTeX 格式）',
    '      const result = resultDiv.getAttribute(\'data-original-text\');',
    '      if (!result) return;',

    '      try {',
    '        // 直接复制包含 LaTeX 标记的文本',
    '        await navigator.clipboard.writeText(result);',
    '        copyBtn.textContent = \'已复制\';',
    '        copyBtn.classList.add(\'copied\');',
    '        setTimeout(() => {',
    '          copyBtn.textContent = \'复制结果\';',
    '          copyBtn.classList.remove(\'copied\');',
    '        }, 2000);',
    '      } catch (err) {',
    '        console.error(\'复制失败:\', err);',
    '      }',
    '    });',

    '    // 添加关闭侧边栏的功能',
    '    document.getElementById("closeSidebar").addEventListener("click", () => {',
    '      sidebar.classList.remove("open");',
    '    });',

    '    // Base64 输入相关功能',
    '    const base64Input = document.getElementById(\'base64Input\');',
    '    const toggleBase64 = document.getElementById(\'toggleBase64\');',

    '    // 切换 Base64 输入框显示',
    '    toggleBase64.addEventListener(\'click\', (e) => {',
    '      e.stopPropagation(); // 阻止事件冒泡到 uploadArea',
    '      if (base64Input.style.display === \'none\') {',
    '        base64Input.style.display = \'block\';',
    '        toggleBase64.textContent = \'隐藏Base64输入\';',
    '      } else {',
    '        base64Input.style.display = \'none\';',
    '        toggleBase64.textContent = \'切换Base64输入\';',
    '      }',
    '    });',

    '    // 为 base64Input 添加阻止事件冒泡',
    '    document.getElementById(\'base64Input\').addEventListener(\'click\', (e) => {',
    '      e.stopPropagation(); // 阻止事件冒泡到 uploadArea',
    '    });',

    '    // base64Input 的 input 事件处理也需要阻止冒泡',
    '    base64Input.addEventListener(\'input\', async (e) => {',
    '      e.stopPropagation();',
    '      const base64Content = base64Input.value.trim();',
    '      if (base64Content) {',
    '        try {',
    '          // 尝试转换Base64为Blob',
    '          let imageData;',
    '          if (base64Content.startsWith(\'data:image\')) {',
    '            imageData = base64Content;',
    '          } else {',
    '            imageData = \'data:image/png;base64,\' + base64Content;',
    '          }',

    '          // 验证Base64是否为有效图片',
    '          const img = new Image();',
    '          img.src = imageData;',
    '          await new Promise((resolve, reject) => {',
    '            img.onload = resolve;',
    '            img.onerror = reject;',
    '          });',

    '          // 转换Base64为Blob',
    '          const response = await fetch(imageData);',
    '          const blob = await response.blob();',
    '          const file = new File([blob], "image.png", { type: "image/png" });',

    '          // 显示预览',
    '          previewImage.src = imageData;',
    '          previewImage.style.display = \'block\';',

    '          // 处理图片',
    '          await processImage(file);',
    '        } catch (error) {',
    '          resultDiv.textContent = \'处理失败: \' + error.message;',
    '          resultContainer.classList.add(\'show\');',
    '          console.error(\'Base64处理错误:\', error);',
    '        }',
    '      }',
    '    });',

    '    // 复制历史记录结果，保持完整的 LaTeX 格式',
    '    async function copyHistoryResult(index, btn) {',
    '      try {',
    '        const history = historyManager.loadHistory(currentToken);',
    '        const historyItem = document.querySelector(`.history-item[data-index="${index}"] .history-text`);',
    '        const result = historyItem?.getAttribute(\'data-original-text\') || history[index]?.result;',

    '        if (!result) {',
    '          throw new Error(\'无法复制：结果为空\');',
    '        }',

    '        await navigator.clipboard.writeText(result);',
    '        btn.textContent = \'已复制\';',
    '        btn.classList.add(\'copied\');',
        
    '        setTimeout(() => {',
    '          btn.textContent = \'复制结果\';',
    '          btn.classList.remove(\'copied\');',
    '        }, 2000);',
        
    '        return true;',
    '      } catch (err) {',
    '        console.error(\'复制失败:\', err);',
    '        alert(\'复制失败: \' + err.message);',
    '        return false;',
    '      }',
    '    }',

    '    // 删除历史记录项',
    '    function deleteHistoryItem(index) {',
    '      const history = historyManager.loadHistory(currentToken);',
    '      if (!history[index]) {',
    '        alert(\'该记录不存在\');',
    '        return;',
    '      }',

    '      if (confirm(\'确定要删除这条历史记录吗？\')) {',
    '        history.splice(index, 1);',
    '        historyManager.saveHistory(currentToken, history);',
    '        historyManager.displayHistory(currentToken);',
    '      }',
    '    }',

    '    // URL输入相关功能',
    '    const urlInput = document.getElementById(\'urlInput\');',
    '    const toggleUrl = document.getElementById(\'toggleUrl\');',

    '    // 切换URL输入框显示',
    '    toggleUrl.addEventListener(\'click\', (e) => {',
    '      e.stopPropagation();',
    '      if (urlInput.style.display === \'none\') {',
    '        urlInput.style.display = \'block\';',
    '        base64Input.style.display = \'none\';',
    '        toggleUrl.textContent = \'隐藏URL输入\';',
    '        toggleBase64.textContent = \'Base64输入\';',
    '      } else {',
    '        urlInput.style.display = \'none\';',
    '        toggleUrl.textContent = \'URL输入\';',
    '      }',
    '    });',

    '    // 为urlInput添加阻止事件冒泡',
    '    urlInput.addEventListener(\'click\', (e) => {',
    '      e.stopPropagation();',
    '    });',

    '    // URL输入处理',
    '    urlInput.addEventListener(\'input\', debounce(async (e) => {',
    '      e.stopPropagation();',
    '      const imageUrl = urlInput.value.trim();',
    '      if (imageUrl) {',
    '        try {',
    '          if (!currentToken) {',
    '            throw new Error(\'请先设置Token\');',
    '          }',

    '          // 显示加载动画',
    '          loading.style.display = \'block\';',
    '          resultContainer.classList.remove(\'show\');',

    '          // 先获取图片并转换为base64',
    '          let imageData;',
    '          try {',
    '            const imgResponse = await fetch(imageUrl);',
    '            const blob = await imgResponse.blob();',
    '            imageData = await new Promise((resolve) => {',
    '              const reader = new FileReader();',
    '              reader.onloadend = () => resolve(reader.result);',
    '              reader.readAsDataURL(blob);',
    '            });',
    '          } catch (error) {',
    '            throw new Error(\'图片URL无法访问或格式不正确\');',
    '          }',

    '          // 调用URL识别API',
    '          const response = await fetch(\'/api/recognize/url\', {',
    '            method: \'POST\',',
    '            headers: { \'Content-Type\': \'application/json\' },',
    '            body: JSON.stringify({',
    '              token: currentToken,',
    '              imageUrl: imageUrl',
    '            })',
    '          });',

    '          const data = await response.json();',
    '          if (!data.success) {',
    '            throw new Error(data.error || \'识别失败\');',
    '          }',

    '          // 显示预览图',
    '          previewImage.src = imageData; // 使用base64数据',
    '          previewImage.style.display = \'block\';',

    '          // 显示结果',
    '          const result = data.result;',
    '          resultDiv.setAttribute(\'data-original-text\', result);',
    '          resultDiv.innerHTML = result;',
    '          waitForMathJax(() => {',
    '            try {',
    '              MathJax.typesetPromise([resultDiv])',
    '                .then(() => {',
    '                  resultContainer.classList.add(\'show\');',
    '                })',
    '                .catch(err => {',
    '                  console.error("MathJax渲染错误:", err);',
    '                  resultContainer.classList.add(\'show\');',
    '                });',
    '            } catch (err) {',
    '              console.error("MathJax处理错误:", err);',
    '              resultContainer.classList.add(\'show\');',
    '            }',
    '          });',

    '          // 添加到历史记录 - 使用base64图片数据而不是URL',
    '          historyManager.addHistory(currentToken, imageData, result);',

    '        } catch (error) {',
    '          resultDiv.textContent = \'处理失败: \' + error.message;',
    '          resultContainer.classList.add(\'show\');',
    '          console.error(\'URL处理错误:\', error);',
    '        } finally {',
    '          loading.style.display = \'none\';',
    '        }',
    '      }',
    '    }, 1000)); // 1秒防抖',

    '    // 防抖函数',
    '    function debounce(func, wait) {',
    '      let timeout;',
    '      return function executedFunction(...args) {',
    '        const later = () => {',
    '          clearTimeout(timeout);',
    '          func(...args);',
    '        };',
    '        clearTimeout(timeout);',
    '        timeout = setTimeout(later, wait);',
    '      };',
    '    }',

    '    // 加载保存的cookie',
    '    function loadSettings() {',
    '      const savedCookie = localStorage.getItem(\'imageRecognitionCookie\');',
    '      if (savedCookie) {',
    '        document.getElementById(\'cookieInput\').value = savedCookie;',
    '        const tokenMatch = savedCookie.match(/token=([^;]+)/);',
    '        if (tokenMatch) {',
    '          const token = tokenMatch[1];',
    '          tokens = [token];',
    '          currentToken = token;',
    '          document.getElementById(\'currentTokenDisplay\').textContent = ',
    '            token.slice(0, 10) + "..." + token.slice(-10);',
    '        }',
    '      }',
    '    }',

    '    // 初始化时调用loadSettings',
    '    loadSettings();',
    '</script>',
    '</body>',
    '</html>'
  ].join('\n');

  return html;
}