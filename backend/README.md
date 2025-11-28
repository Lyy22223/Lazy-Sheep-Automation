# 传智播客答题API后端服务

基于FastAPI实现的答题API服务，提供题目答案查询和AI答题功能。

## 功能特性

- ✅ API Key认证（无需注册登录）
- ✅ 答案库搜索（本地数据库 + 相似度匹配）
- ✅ AI答题（集成OpenAI）
- ✅ 批量搜索
- ✅ 题库上传
- ✅ 查询次数限制和统计
- ✅ 管理员接口（生成Key、重置查询次数）

## 快速开始

### 1. 安装依赖

```bash
cd backend
pip install -r requirements.txt
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并修改配置：

```bash
cp .env.example .env
```

主要配置项：
- `AI_PROVIDER`: AI服务提供商（`openai` 或 `deepseek`，默认：`deepseek`）
- `AI_API_KEY` 或 `DEEPSEEK_API_KEY`: DeepSeek API密钥（AI答题功能需要）
- `OPENAI_API_KEY`: OpenAI API密钥（如果使用OpenAI）
- `ADMIN_KEY`: 管理员密钥（用于生成API Key）

**DeepSeek配置示例：**
```env
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-your-deepseek-api-key-here
```

**OpenAI配置示例：**
```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-your-openai-api-key-here
```

### 3. 启动服务

```bash
python main.py
```

或使用uvicorn：

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

服务启动后访问：
- API文档：http://localhost:8000/docs
- 健康检查：http://localhost:8000/health

## API接口

### 1. 查询API Key信息

```http
GET /api/key/info
Headers: X-API-Key: czbk_xxxxxxxxxxxx
```

### 2. 搜索答案

```http
POST /api/search
Headers: 
  X-API-Key: czbk_xxxxxxxxxxxx
  Content-Type: application/json

Body:
{
  "questionContent": "题目内容",
  "type": "0",
  "options": ["选项A", "选项B", ...]
}
```

### 3. AI答题

```http
POST /api/ai/answer
Headers: 
  X-API-Key: czbk_xxxxxxxxxxxx
  Content-Type: application/json

Body:
{
  "questionContent": "题目内容",
  "type": "0",
  "options": ["选项A", "选项B", ...]
}
```

### 4. 批量搜索

```http
POST /api/search/batch
Headers: 
  X-API-Key: czbk_xxxxxxxxxxxx
  Content-Type: application/json

Body:
{
  "questions": [
    {
      "questionContent": "题目1",
      "type": "0"
    },
    {
      "questionContent": "题目2",
      "type": "1"
    }
  ]
}
```

### 5. 上传题库

```http
POST /api/upload
Headers: 
  X-API-Key: czbk_xxxxxxxxxxxx
  Content-Type: application/json

Body:
{
  "data": { ... },      // data.json格式
  "res": { ... },        // res.json格式
  "answerRecords": [ ... ]  // 答题记录
}
```

## 管理员接口

### 生成API Key

```http
POST /api/admin/generate-key?plan=standard&expires_days=30
Headers: X-Admin-Key: your_admin_key
```

计划类型：
- `free`: 免费版（每日50次）
- `standard`: 标准版（每日500次）
- `premium`: 高级版（每日2000次）
- `pro`: 专业版（无限）

### 重置查询次数

```http
POST /api/admin/reset-daily-queries?api_key=czbk_xxxxx
Headers: X-Admin-Key: your_admin_key
```

## 数据库结构

- `api_keys`: API Key表
- `public_questions`: 公共答案库
- `api_key_questions`: API Key贡献库（用户上传的题目）
- `search_logs`: 搜索记录

## 开发说明

### 项目结构

```
backend/
├── main.py           # 主应用入口
├── config.py         # 配置文件
├── models.py         # 数据模型
├── database.py       # 数据库操作
├── auth.py           # 认证中间件
├── search.py         # 搜索功能
├── ai_service.py     # AI答题服务
├── admin.py          # 管理员功能
├── upload.py         # 上传处理
├── requirements.txt  # 依赖列表
└── README.md         # 说明文档
```

### 添加新功能

1. 在对应的模块文件中添加功能函数
2. 在 `main.py` 中添加路由
3. 更新API文档

## 部署

### 使用Gunicorn + Uvicorn

```bash
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

### 使用Docker

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## 注意事项

1. 生产环境必须修改 `ADMIN_KEY`
2. 建议使用HTTPS
3. 定期备份数据库
4. 监控API使用情况，防止滥用

