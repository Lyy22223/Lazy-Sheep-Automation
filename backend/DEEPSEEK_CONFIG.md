# DeepSeek AI 配置指南

## 快速配置

### 1. 创建配置文件

```bash
# 复制示例文件
Copy-Item env.example .env
```

### 2. 编辑 .env 文件

打开 `.env` 文件，设置你的 DeepSeek API Key：

```env
# 选择AI服务提供商
AI_PROVIDER=deepseek

# DeepSeek API Key（必需）
DEEPSEEK_API_KEY=sk-your-deepseek-api-key-here

# DeepSeek配置（可选，使用默认值）
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
```

### 3. 获取 DeepSeek API Key

1. 访问 [DeepSeek 官网](https://www.deepseek.com/)
2. 注册/登录账号
3. 进入控制台，创建 API Key
4. 复制 API Key 到 `.env` 文件

### 4. 重启服务

配置完成后，重启服务使配置生效：

```bash
# 停止当前服务（Ctrl+C）
# 重新启动
python main.py
```

## 配置说明

### 配置优先级

1. **统一配置**（最高优先级）：
   - `AI_PROVIDER`: 指定使用哪个AI服务
   - `AI_API_KEY`: 统一的API Key
   - `AI_BASE_URL`: 统一的Base URL
   - `AI_MODEL`: 统一的模型名称

2. **DeepSeek专用配置**：
   - `DEEPSEEK_API_KEY`: DeepSeek API Key
   - `DEEPSEEK_BASE_URL`: DeepSeek API地址（默认：https://api.deepseek.com/v1）
   - `DEEPSEEK_MODEL`: DeepSeek模型（默认：deepseek-chat）

3. **OpenAI配置**（兼容）：
   - `OPENAI_API_KEY`: OpenAI API Key
   - `OPENAI_BASE_URL`: OpenAI API地址
   - `OPENAI_MODEL`: OpenAI模型

### 配置示例

#### 方式1：使用统一配置（推荐）

```env
AI_PROVIDER=deepseek
AI_API_KEY=sk-your-deepseek-key
```

#### 方式2：使用DeepSeek专用配置

```env
DEEPSEEK_API_KEY=sk-your-deepseek-key
```

#### 方式3：自动检测（如果同时配置了DeepSeek和OpenAI，优先使用DeepSeek）

```env
DEEPSEEK_API_KEY=sk-deepseek-key
OPENAI_API_KEY=sk-openai-key
# 会自动使用DeepSeek
```

## 测试配置

运行测试脚本验证配置：

```bash
python test_ai.py
```

如果配置正确，会看到：
- AI服务已初始化
- 能够成功调用AI答题接口

## 常见问题

### 1. 提示"AI服务未配置"

**原因**：未设置API Key或配置错误

**解决**：
- 检查 `.env` 文件是否存在
- 确认 `DEEPSEEK_API_KEY` 已正确设置
- 确认API Key格式正确（通常以 `sk-` 开头）

### 2. API调用失败

**原因**：API Key无效或网络问题

**解决**：
- 验证API Key是否有效
- 检查网络连接
- 确认DeepSeek服务是否正常

### 3. 想切换回OpenAI

**解决**：
```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-your-openai-key
```

## DeepSeek优势

- ✅ **性价比高**：价格比OpenAI更便宜
- ✅ **中文支持好**：对中文理解能力强
- ✅ **API兼容**：完全兼容OpenAI API格式
- ✅ **响应速度快**：延迟低

## 相关文档

- [DeepSeek API文档](https://platform.deepseek.com/api-docs/)
- [DeepSeek官网](https://www.deepseek.com/)

