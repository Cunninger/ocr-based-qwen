# 使用官方 Node.js 18 Alpine 镜像作为基础镜像 (体积更小)
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json (如果存在)
# 单独复制可以利用 Docker 的层缓存
COPY package*.json ./

# 安装项目依赖
# 使用 npm ci 更适合 CI/CD 和生产环境，如果 package-lock.json 存在
# RUN npm ci --only=production
RUN npm install --omit=dev # 只安装生产依赖

# 复制应用程序源代码到工作目录
COPY . .

# 应用程序监听的端口
EXPOSE 3000

# 容器启动时运行的命令
CMD ["node", "server.js"]