# Docker 部署指南

## 快速开始

### 1. 使用 Docker Compose（推荐）

#### 步骤1：配置环境变量

创建 `.env` 文件（可选，也可以直接在docker-compose.yml中设置）：

```bash
# 管理员密钥（生产环境必须修改！）
ADMIN_KEY=your_secure_admin_key_here

# DeepSeek API配置
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat

# OpenAI配置（可选）
OPENAI_API_KEY=your_openai_api_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-3.5-turbo
```

#### 步骤2：启动服务

```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down

# 停止并删除数据卷（谨慎使用！）
docker-compose down -v
```

#### 步骤3：验证部署

```bash
# 检查服务状态
docker-compose ps

# 测试健康检查
curl http://localhost:8000/api/health

# 查看日志
docker-compose logs czbk-api
```

### 2. 使用 Docker 命令

#### 步骤1：构建镜像

```bash
cd backend
docker build -t czbk-api:latest .
```

#### 步骤2：运行容器

```bash
docker run -d \
  --name czbk-api \
  -p 8000:8000 \
  -e WORKERS=2 \
  -e DEEPSEEK_API_KEY=your_api_key \
  -e ADMIN_KEY=your_admin_key \
  -v $(pwd)/data:/app/data \
  --restart unless-stopped \
  czbk-api:latest
```

#### 步骤3：查看日志

```bash
docker logs -f czbk-api
```

## 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 | 必填 |
|--------|------|--------|------|
| `WORKERS` | Gunicorn工作进程数 | 2 | 否 |
| `DATABASE_URL` | 数据库连接URL | `sqlite+aiosqlite:///./data/czbk_api.db` | 否 |
| `ADMIN_KEY` | 管理员密钥 | `czbk_admin_2024_secret_key_change_in_production` | 是（生产环境） |
| `DEEPSEEK_API_KEY` | DeepSeek API密钥 | - | 是（如果使用DeepSeek） |
| `DEEPSEEK_BASE_URL` | DeepSeek API地址 | `https://api.deepseek.com/v1` | 否 |
| `DEEPSEEK_MODEL` | DeepSeek模型名称 | `deepseek-chat` | 否 |
| `OPENAI_API_KEY` | OpenAI API密钥 | - | 否 |
| `OPENAI_BASE_URL` | OpenAI API地址 | `https://api.openai.com/v1` | 否 |
| `OPENAI_MODEL` | OpenAI模型名称 | `gpt-3.5-turbo` | 否 |

### 资源限制

在 `docker-compose.yml` 中已配置资源限制（适合1核1GB服务器）：

```yaml
deploy:
  resources:
    limits:
      cpus: '1.0'
      memory: 900M
    reservations:
      cpus: '0.5'
      memory: 500M
```

**调整建议**：
- **1核1GB**: 保持默认配置
- **2核2GB**: 修改为 `cpus: '2.0'`, `memory: '1800M'`, `WORKERS=4`
- **4核4GB**: 修改为 `cpus: '4.0'`, `memory: '3600M'`, `WORKERS=8`

### 数据持久化

数据库文件会持久化到 `./backend/data` 目录：

```yaml
volumes:
  - ./backend/data:/app/data
```

**备份建议**：
```bash
# 备份数据库
docker cp czbk-api:/app/data/czbk_api.db ./backup/czbk_api_$(date +%Y%m%d).db

# 恢复数据库
docker cp ./backup/czbk_api_20240101.db czbk-api:/app/data/czbk_api.db
```

## 性能优化

### 1. 调整工作进程数

根据CPU核心数调整 `WORKERS` 环境变量：

```bash
# 1核CPU：2 workers
WORKERS=2

# 2核CPU：4 workers
WORKERS=4

# 4核CPU：8 workers
WORKERS=8
```

### 2. 使用多阶段构建（可选）

如果需要更小的镜像，可以使用多阶段构建：

```dockerfile
# 构建阶段
FROM python:3.11-slim as builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

# 运行阶段
FROM python:3.11-slim
WORKDIR /app
COPY --from=builder /root/.local /root/.local
COPY . .
ENV PATH=/root/.local/bin:$PATH
CMD ["gunicorn", "main:app", "-w", "2", "-k", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000"]
```

## 常见问题

### 1. 容器无法启动

**检查日志**：
```bash
docker-compose logs czbk-api
```

**常见原因**：
- 端口被占用：修改 `docker-compose.yml` 中的端口映射
- 内存不足：检查系统内存，调整资源限制
- 数据库文件权限问题：检查 `./backend/data` 目录权限

### 2. 健康检查失败

**检查健康检查端点**：
```bash
curl http://localhost:8000/api/health
```

**如果失败，检查**：
- 服务是否正常启动
- 端口是否正确映射
- 防火墙设置

### 3. 数据库文件丢失

**原因**：数据卷未正确挂载

**解决**：
1. 检查 `docker-compose.yml` 中的 volumes 配置
2. 确保 `./backend/data` 目录存在
3. 检查目录权限

### 4. 性能问题

**优化建议**：
1. 增加 `WORKERS` 数量（不超过CPU核心数）
2. 检查资源限制是否合理
3. 使用SSD存储数据库文件
4. 考虑使用PostgreSQL替代SQLite（高并发场景）

## 生产环境部署

### 1. 安全配置

**必须修改**：
- `ADMIN_KEY`：使用强随机密钥
- API密钥：妥善保管，不要提交到代码仓库

**建议**：
- 使用HTTPS（通过Nginx反向代理）
- 配置防火墙规则
- 定期备份数据库

### 2. 使用Nginx反向代理

创建 `nginx.conf`：

```nginx
upstream czbk_api {
    server localhost:8000;
}

server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://czbk_api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 3. 监控和日志

**查看日志**：
```bash
# 实时日志
docker-compose logs -f czbk-api

# 最近100行日志
docker-compose logs --tail=100 czbk-api
```

**日志配置**：
在 `docker-compose.yml` 中已配置日志轮转：
```yaml
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

## 更新和升级

### 更新代码

```bash
# 停止服务
docker-compose down

# 拉取最新代码
git pull

# 重新构建镜像
docker-compose build --no-cache

# 启动服务
docker-compose up -d
```

### 升级数据库

数据库迁移会自动执行，无需手动操作。

## 卸载

```bash
# 停止并删除容器
docker-compose down

# 删除镜像
docker rmi czbk-api:latest

# 删除数据（谨慎！）
rm -rf ./backend/data
```

## 技术支持

如遇问题，请检查：
1. Docker和Docker Compose版本
2. 系统资源（CPU、内存、磁盘）
3. 日志输出
4. 网络连接

