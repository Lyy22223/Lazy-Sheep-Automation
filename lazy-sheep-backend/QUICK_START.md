# ⚡ 快速启动指南

## 🎯 3步启动本地开发环境

### Step 1: 启动Docker数据库（30秒）

```bash
cd lazy-sheep-backend

# 启动PostgreSQL + Redis
docker-dev.bat start
```

**等待输出：**
```
✅ Docker服务已启动

PostgreSQL: localhost:5432
Redis: localhost:6379
PgAdmin: http://localhost:5050
Redis Commander: http://localhost:8081
```

---

### Step 2: 启动API服务（1分钟）

```bash
# 一键启动（会自动安装依赖）
dev.bat
```

**等待输出：**
```
✅ 服务已启动

API地址: http://localhost:8000
API文档: http://localhost:8000/docs
```

---

### Step 3: 测试API（10秒）

打开浏览器访问：http://localhost:8000/docs

尝试API：
1. 点击 `GET /health` - 健康检查
2. 点击 `Try it out` - 执行
3. 看到 `{"status": "healthy"}` ✅

---

## 🎉 完成！现在可以开始开发了

### 常用操作

```bash
# 查看API文档
http://localhost:8000/docs

# 查看数据库（PgAdmin）
http://localhost:5050
登录: admin@lazy-sheep.local / admin

# 查看Redis
http://localhost:8081

# 停止Docker
docker-dev.bat stop

# 查看Docker日志
docker-dev.bat logs
```

---

## 🔧 开发工作流

### 1. 修改代码

编辑 `api/` 目录下的代码，保存后**自动重载**（无需重启）。

### 2. 测试API

访问 http://localhost:8000/docs 在线测试。

### 3. 查看日志

```bash
# API日志
Get-Content data\app.log -Wait

# Docker日志
docker-dev.bat logs
```

### 4. 数据库操作

```bash
# 进入PostgreSQL
docker exec -it lazy-sheep-postgres psql -U lazy_user -d lazy_sheep

# 查看表
\dt

# 查询数据
SELECT * FROM questions LIMIT 10;

# 退出
\q
```

---

## 📝 配置文件

| 文件 | 说明 |
|------|------|
| `.env.local` | 本地开发配置（已配置好Docker） |
| `docker-compose.dev.yml` | Docker服务定义 |
| `docker/postgres/postgresql.conf` | PostgreSQL配置 |
| `docker/redis/redis.conf` | Redis配置 |

---

## ❓ 遇到问题？

### Docker启动失败

```bash
# 检查Docker是否运行
docker --version
docker ps

# 重启Docker Desktop
```

### 端口被占用

```bash
# 检查端口占用
netstat -ano | findstr :5432
netstat -ano | findstr :6379
netstat -ano | findstr :8000

# 杀死进程
taskkill /PID <进程ID> /F
```

### 数据库连接失败

```bash
# 检查Docker服务状态
docker-dev.bat status

# 重启Docker服务
docker-dev.bat restart

# 查看PostgreSQL日志
docker-dev.bat logs
```

### 想从头开始

```bash
# 清理所有数据
docker-dev.bat clean

# 重新启动
docker-dev.bat start
dev.bat
```

---

## 🚀 下一步

- 📖 查看完整文档: [README.dev.md](README.dev.md)
- 🎯 开始开发新功能
- 🧪 运行测试
- 📦 准备部署

Happy Coding! 🎉
