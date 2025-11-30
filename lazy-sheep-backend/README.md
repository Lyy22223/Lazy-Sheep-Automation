# 懒羊羊题库API 🐑

多平台自动答题系统后端服务

## 🚀 快速开始

### 本地开发

```bash
# 1. 安装依赖
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入你的 DeepSeek API Key

# 3. 启动服务
uvicorn app.main:app --reload

# 4. 访问文档
# http://localhost:8000/docs
```

### Docker 部署

```bash
# 1. 配置环境变量
export DEEPSEEK_API_KEY=sk-your-key

# 2. 启动服务
docker-compose up -d

# 3. 查看日志
docker-compose logs -f api
```

## 📋 API 接口

### 搜索题目答案

**POST** `/api/search`

```json
{
  "questionId": "uuid",
  "questionContent": "题目内容",
  "type": "0",
  "platform": "czbk"
}
```

### 批量搜索

**POST** `/api/search/batch`

```json
{
  "questions": [
    {
      "questionId": "uuid1",
      "questionContent": "题目1",
      "type": "0"
    }
  ],
  "platform": "czbk"
}
```

### AI 答题

**POST** `/api/ai/answer`

```json
{
  "questionContent": "题目内容",
  "type": "0",
  "options": ["A. 选项1", "B. 选项2"],
  "platform": "czbk",
  "model": "deepseek-chat"
}
```

### 上传题目

**POST** `/api/upload`

```json
{
  "questionContent": "题目内容",
  "type": "0",
  "answer": "A",
  "platform": "czbk"
}
```

## 🔑 认证

所有API请求需要在请求头中携带 API Key：

```
X-API-Key: your-api-key
```

## 📊 题型说明

- `0`: 单选题
- `1`: 多选题
- `2`: 判断题
- `3`: 填空题
- `4`: 简答题

## 🛠️ 技术栈

- **FastAPI** - Web框架
- **SQLAlchemy** - ORM
- **SQLite** - 数据库
- **Redis** - 缓存
- **DeepSeek AI** - AI答题

## 📝 配置说明

### 环境变量

```bash
# DeepSeek AI配置
DEEPSEEK_API_KEY=sk-your-key        # 必填
DEEPSEEK_MODEL=deepseek-chat        # 可选

# API认证
API_KEY_REQUIRED=true                # 是否需要验证
ADMIN_API_KEY=sk-admin-key          # 管理员Key

# 数据库
DATABASE_URL=sqlite+aiosqlite:///./data/questions.db

# Redis
REDIS_URL=redis://localhost:6379/0
REDIS_ENABLED=true
```

## 🔧 开发

### 项目结构

```
lazy-sheep-backend/
├── app/
│   ├── main.py              # 主入口
│   ├── config.py            # 配置
│   ├── database.py          # 数据库
│   ├── models/              # 数据模型
│   ├── routes/              # API路由
│   ├── services/            # 业务逻辑
│   └── utils/               # 工具函数
├── data/                    # 数据目录
├── requirements.txt         # 依赖
├── Dockerfile              # Docker配置
└── docker-compose.yml      # 编排配置
```

### 添加新功能

1. 在 `app/routes/` 创建新路由
2. 在 `app/services/` 添加业务逻辑
3. 在 `app/main.py` 注册路由

## 📈 性能优化

- ✅ Redis 缓存热门题目
- ✅ 异步数据库操作
- ✅ 批量查询优化
- ✅ 文本模糊匹配

## 🐛 故障排查

### 1. 数据库初始化失败

```bash
# 删除旧数据库
rm data/questions.db
# 重启服务
```

### 2. Redis 连接失败

```bash
# 检查Redis状态
redis-cli ping
# 或禁用Redis
export REDIS_ENABLED=false
```

### 3. AI 调用失败

- 检查 API Key 是否正确
- 检查网络连接
- 查看日志: `data/app.log`

## 📄 License

MIT

## 👥 贡献

欢迎提交 Issue 和 Pull Request！
