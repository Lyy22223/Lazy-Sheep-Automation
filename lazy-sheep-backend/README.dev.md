# 懒羊羊题库 - 本地开发指南

## 🚀 快速开始

### 方式A：完全使用Docker（推荐）⭐

**一键启动所有服务（PostgreSQL + 后端API）：**

```bash
docker-dev.bat start
```

服务地址：
- 后端API: http://localhost:8000
- API文档: http://localhost:8000/docs
- PostgreSQL: localhost:5432
- Redis: localhost:6379 (本地)

```bash
# 查看日志
docker-dev.bat logs

# 停止服务
docker-dev.bat stop

# 重启服务
docker-dev.bat restart
```

---

### 方式B：本地运行后端

### 1. 启动Docker服务（仅数据库）

```bash
# 启动PostgreSQL + Redis
docker-dev.bat start

# 等待5秒让服务启动完成
```

**Docker服务：**
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- PgAdmin: http://localhost:5050 (admin@lazy-sheep.local / admin)
- Redis Commander: http://localhost:8081

### 2. 安装Python依赖

```bash
# 创建虚拟环境
python -m venv venv

# 激活虚拟环境（Windows）
venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt
```

### 3. 启动开发服务器

**方式1：使用启动脚本（推荐）**
```bash
# Windows
dev.bat
```

**方式2：手动启动**
```bash
python run.py
```

### 4. 访问服务

- API地址: http://localhost:8000
- 交互式文档: http://localhost:8000/docs
- 健康检查: http://localhost:8000/health

---

## 📁 项目结构

```
lazy-sheep-backend/
├── api/                    # API代码
│   ├── models/            # 数据模型
│   ├── routes/            # 路由处理
│   ├── services/          # 业务逻辑
│   ├── utils/             # 工具函数
│   ├── config.py          # 配置管理
│   ├── database.py        # 数据库连接
│   └── main.py            # FastAPI主应用
├── data/                  # 数据目录
│   ├── questions.db       # SQLite数据库
│   └── app.log            # 日志文件
├── .env.local             # 本地开发配置
├── dev.bat                # 开发启动脚本
├── run.py                 # 启动入口
└── requirements.txt       # 依赖列表
```

---

## 🐳 Docker管理

### 常用命令

```bash
# 启动服务
docker-dev.bat start

# 停止服务
docker-dev.bat stop

# 重启服务
docker-dev.bat restart

# 查看日志
docker-dev.bat logs

# 查看状态
docker-dev.bat status

# 清理数据（危险！会删除所有数据）
docker-dev.bat clean
```

### 直接使用docker-compose

```bash
# 启动
docker-compose -f docker-compose.dev.yml up -d

# 停止
docker-compose -f docker-compose.dev.yml down

# 查看日志
docker-compose -f docker-compose.dev.yml logs -f postgres

# 进入容器
docker exec -it lazy-sheep-postgres psql -U lazy_user -d lazy_sheep
```

---

## ⚙️ 配置说明

### 数据库配置

**.env.local 默认使用Docker PostgreSQL**
```ini
DATABASE_URL=postgresql+asyncpg://lazy_user:lazy_password@localhost:5432/lazy_sheep
REDIS_ENABLED=true
REDIS_URL=redis://localhost:6379/0
```

**如果不想用Docker，可以切换回SQLite：**
```ini
DATABASE_URL=sqlite+aiosqlite:///./data/questions.db
REDIS_ENABLED=false
```

---

## 🔧 开发工作流

### 修改代码后自动重载

运行时修改代码会自动重载，无需手动重启。

### 查看日志

```bash
# 实时查看日志
Get-Content data\app.log -Wait
```

### 数据库管理

```bash
# SQLite浏览器
# 下载: https://sqlitebrowser.org/
# 打开: data\questions.db
```

---

## 📝 API测试

### 使用交互式文档

访问 http://localhost:8000/docs 可以直接测试所有API。

### 使用curl

```bash
# 健康检查
curl http://localhost:8000/health

# 搜索题目
curl -X POST http://localhost:8000/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "questionContent": "测试题目",
    "type": "0",
    "platform": "czbk"
  }'

# 上传题目
curl -X POST http://localhost:8000/api/upload \
  -H "Content-Type: application/json" \
  -d '{
    "questionContent": "测试题目",
    "type": "0",
    "answer": "A",
    "answerText": "答案A"
  }'
```

---

## 🐛 常见问题

### 1. 端口被占用

```bash
# Windows查找占用8000端口的进程
netstat -ano | findstr :8000

# 杀死进程
taskkill /PID <进程ID> /F

# 或者修改端口
# .env.local中改为: PORT=8001
```

### 2. 依赖安装失败

```bash
# 使用国内镜像
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

### 3. 数据库文件锁定

```bash
# 停止所有Python进程
taskkill /F /IM python.exe

# 重新启动
dev.bat
```

---

## 📦 打包部署

开发完成后，准备部署：

```bash
# 1. 更新依赖
pip freeze > requirements.txt

# 2. 创建生产配置
cp .env.local .env
# 修改.env为生产配置

# 3. 测试生产模式
# 修改.env: DEBUG=false
python run.py

# 4. 部署到服务器
# 参考部署文档
```

---

## 🎯 开发计划

- [x] 基础API框架
- [x] SQLite数据库
- [ ] PostgreSQL迁移
- [ ] 多答案存储
- [ ] 答案聚合算法
- [ ] 冲突检测
- [ ] 质量审核
- [ ] 前端上传管理器
- [ ] 完整测试

---

## 📞 需要帮助？

遇到问题可以：
1. 查看日志文件: `data\app.log`
2. 检查配置: `.env.local`
3. 查看API文档: http://localhost:8000/docs
