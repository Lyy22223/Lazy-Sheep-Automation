# Lazy Sheep Backend

后端 API 服务，提供题库搜索、AI 答题等功能。

## 📦 项目结构

```
lazy-sheep-backend/
├── api/                      # API 核心代码
│   ├── routes/              # 路由模块
│   ├── services/            # 业务逻辑
│   ├── models/              # 数据模型
│   ├── utils/               # 工具函数
│   ├── database.py          # 数据库连接
│   ├── config.py            # 配置管理
│   └── main.py              # 应用入口
├── deploy-package/          # 部署包
│   ├── api/                 # API代码
│   ├── .env.example         # SQLite 配置模板
│   ├── .env.example.postgresql  # PostgreSQL 配置模板
│   ├── create_api_key.py    # API密钥管理工具
│   ├── gunicorn.conf.py     # Gunicorn 配置
│   ├── requirements.txt     # 依赖列表
│   ├── run.py               # 启动文件
│   ├── start-gunicorn.sh    # Gunicorn 启动脚本
│   └── start-simple.sh      # 简单启动脚本
├── requirements.txt         # 依赖列表
└── run.py                   # 开发启动文件
```

## 🚀 快速开始

### 开发环境

```bash
# 1. 安装依赖
pip install -r requirements.txt

# 2. 配置环境变量
# 创建 .env 文件，参考 deploy-package/.env.example

# 3. 启动服务
python run.py
```

### 生产部署

使用 `deploy-package/` 目录进行部署：

```bash
cd deploy-package

# 1. 配置环境
cp .env.example .env
# 编辑 .env 文件

# 2. 安装依赖
pip install -r requirements.txt

# 3. 创建API密钥（用于用户脚本访问）
python create_api_key.py create user001 "用户1" 365 10000 100000

# 4. 启动服务
bash start-gunicorn.sh  # 多进程模式（推荐）
# 或
bash start-simple.sh    # 简单模式
```

## 🔑 API密钥管理

### 创建密钥

```bash
cd deploy-package
python create_api_key.py create <用户ID> <名称> [天数] [日配额] [月配额]
```

### 查看密钥

```bash
python create_api_key.py list          # 列出所有
python create_api_key.py show user001  # 查看详情
```

### 删除密钥

```bash
python create_api_key.py delete user001
```

## 🛠️ 技术栈

- **框架**: FastAPI
- **数据库**: SQLite / PostgreSQL
- **ORM**: SQLAlchemy
- **AI**: DeepSeek API
- **服务器**: Gunicorn + Uvicorn Workers

## 📝 API 文档

启动服务后访问：

- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## 🔧 配置说明

### 环境变量

在 `.env` 文件中配置：

```env
# 数据库（SQLite）
DATABASE_URL=sqlite+aiosqlite:///./data/questions.db

# 或 PostgreSQL
# DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/dbname

# API密钥
ADMIN_API_KEY=sk-your-admin-key
DEEPSEEK_API_KEY=sk-your-deepseek-key

# 服务配置
HOST=0.0.0.0
PORT=8000
```

## 📄 许可证

MIT License
