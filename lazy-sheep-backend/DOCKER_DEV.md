# Docker开发环境使用指南

## 🚀 快速开始

### 启动开发环境

```bash
docker-dev.bat start
```

等待约10秒，服务启动完成后访问：
- 后端API: http://localhost:8000
- API文档: http://localhost:8000/docs

## 📝 开发流程

### 1. 修改代码

直接在本地编辑器修改代码，**无需重启容器**！

```
lazy-sheep-backend/
├── api/
│   ├── main.py         # 修改这些文件
│   ├── routes/         # 后端会自动重载
│   └── services/
```

### 2. 查看日志

```bash
docker-dev.bat logs
```

日志会实时显示：
```
backend  | INFO:     Will watch for changes in these directories: ['/app']
backend  | INFO:     Application startup complete.
backend  | INFO:     Uvicorn running on http://0.0.0.0:8000
```

修改代码后会看到：
```
backend  | INFO:     Detected file change in '/app/api/main.py'
backend  | INFO:     Reloading...
backend  | INFO:     Application startup complete.
```

### 3. 测试API

访问 http://localhost:8000/docs 测试接口

## 🔧 常用命令

| 命令 | 说明 | 使用场景 |
|------|------|---------|
| `docker-dev.bat start` | 启动服务 | 第一次启动或停止后重启 |
| `docker-dev.bat logs` | 查看日志 | 调试代码、查看错误 |
| `docker-dev.bat restart` | 重启容器 | 容器出问题时 |
| `docker-dev.bat rebuild` | 重建容器 | 修改`requirements.txt`后 |
| `docker-dev.bat shell` | 进入容器 | 需要在容器内调试 |
| `docker-dev.bat stop` | 停止服务 | 不用了停止 |
| `docker-dev.bat status` | 查看状态 | 检查服务是否运行 |

## 💡 热重载说明

### 什么会触发热重载？

✅ 修改Python代码（`.py`文件）
✅ 修改配置文件（`.env.local`）
✅ 添加/删除文件

❌ 修改`requirements.txt`（需要`rebuild`）
❌ 修改`Dockerfile`（需要`rebuild`）

### 热重载速度

- **小改动**: ~1秒
- **大改动**: ~3秒

比本地运行还快！因为不需要：
- ❌ 关闭Python进程
- ❌ 重新激活虚拟环境
- ❌ 重新启动服务

## 🐛 调试技巧

### 1. 查看实时日志

```bash
docker-dev.bat logs
```

按`Ctrl+C`退出日志查看

### 2. 进入容器调试

```bash
docker-dev.bat shell
```

进入后可以：
```bash
# 查看文件
ls -la

# 查看Python版本
python --version

# 手动运行
python run.py

# 安装调试工具
pip install ipdb

# 退出
exit
```

### 3. 查看容器状态

```bash
docker-dev.bat status
```

### 4. 重启后端（不重启数据库）

```bash
docker-compose -f docker-compose.dev.yml restart backend
```

## 📦 依赖管理

### 添加新依赖

1. 编辑`requirements.txt`
2. 重建容器：
   ```bash
   docker-dev.bat rebuild
   ```

### 为什么需要rebuild？

Docker镜像在构建时安装依赖，修改`requirements.txt`后需要重新构建镜像。

## 🔄 工作流程对比

### 传统方式（本地运行）

```
1. 修改代码
2. Ctrl+C 停止服务
3. 重新运行 python run.py
4. 等待启动
5. 测试
```

### Docker开发方式

```
1. 修改代码
2. 等待1秒（自动重载）
3. 测试
```

**节省时间：每次修改省2-3秒！**

## ⚙️ 环境变量

容器会自动使用以下环境变量：

```yaml
DATABASE_URL=postgresql+asyncpg://lazy_user:lazy_password@postgres:5432/lazy_sheep
REDIS_URL=redis://host.docker.internal:6379/0
ENVIRONMENT=development
LOG_LEVEL=INFO
RELOAD=true
```

## 🎯 最佳实践

### 开发流程

```
1. docker-dev.bat start     # 早上启动一次
2. 修改代码 → 自动重载      # 整天开发
3. docker-dev.bat logs      # 需要时查看日志
4. docker-dev.bat stop      # 晚上下班关闭
```

### 性能优化

- ✅ 代码挂载到容器（支持热重载）
- ✅ 排除`__pycache__`等目录（提升性能）
- ✅ 使用`watchfiles`监控（uvicorn自带）

## ❓ 常见问题

### Q: 修改代码后没有重载？

**检查日志：**
```bash
docker-dev.bat logs
```

应该看到`Detected file change`

### Q: 端口被占用？

**停止本地运行的服务：**
```bash
# 检查8000端口
netstat -ano | findstr :8000

# 或修改端口
# 编辑docker-compose.dev.yml:
# ports: - "8001:8000"
```

### Q: 数据库连接失败？

**检查postgres容器：**
```bash
docker-dev.bat status
```

确保postgres是`healthy`

### Q: 想看详细错误？

**进入容器：**
```bash
docker-dev.bat shell
python run.py
```

## 🎉 总结

Docker开发环境的优势：

✅ **一键启动** - 不用配置Python、PostgreSQL、Redis
✅ **热重载** - 修改代码自动生效
✅ **隔离环境** - 不污染本地系统
✅ **团队协作** - 所有人环境一致
✅ **快速切换** - 可以同时运行多个项目

开始愉快地开发吧！🚀
