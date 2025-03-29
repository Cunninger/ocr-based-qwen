## Docker 安装

使用以下命令拉取并运行Docker镜像：

```bash
docker pull sexgirls/qwen-ocr-app:latest
docker run -p 3000:3000 sexgirls/qwen-ocr-app:latest
```

然后在浏览器中访问应用：
```
http://localhost:3000
```

## 环境变量

无需设置。服务默认在3000端口运行。

## 使用说明

1. **访问Web界面**：在浏览器中打开 http://localhost:3000
2. **配置API访问**：
   - 点击右上角的"⚙️ Cookie设置"按钮
   - 访问[chat.qwenlm.ai](https://chat.qwenlm.ai/)，登录并获取Cookie
   - 将您的Cookie粘贴到设置面板并保存
3. **上传图像**：
   - 将图像拖放到上传区域
   - 点击上传区域选择文件
   - 从剪贴板粘贴图像
   - 使用Base64或URL输入选项
4. **查看结果**：
   - 识别出的文本将显示在图像下方
   - 数学公式将以LaTeX格式化
   - 短的字母数字结果将被视为验证码
5. **复制或查看历史**：
   - 点击"复制结果"复制结果
   - 点击"📋 识别历史"访问以前的识别结果