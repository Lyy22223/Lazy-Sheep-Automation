"""
配置文件
"""
import os
from dotenv import load_dotenv

load_dotenv()

# 数据库配置
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./czbk_api.db")

# 管理员密钥（生产环境应从环境变量读取）
ADMIN_KEY = os.getenv("ADMIN_KEY", "czbk_admin_2024_secret_key_change_in_production")

# AI服务配置（支持OpenAI和DeepSeek）
AI_PROVIDER = os.getenv("AI_PROVIDER", "deepseek")  # openai 或 deepseek
AI_API_KEY = os.getenv("AI_API_KEY", "")  # AI服务API密钥
AI_BASE_URL = os.getenv("AI_BASE_URL", "")  # AI服务基础URL（可选，使用默认值）
AI_MODEL = os.getenv("AI_MODEL", "")  # AI模型名称（可选，使用默认值）

# OpenAI配置（兼容旧配置）
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-3.5-turbo")

# DeepSeek配置
# DeepSeek API与OpenAI兼容，base_url可以是 https://api.deepseek.com 或 https://api.deepseek.com/v1
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")  # 默认使用DeepSeek-V3.2-Exp非思考模式

# DeepSeek模型说明（都已升级为DeepSeek-V3.2-Exp）：
# - deepseek-chat: DeepSeek-V3.2-Exp 非思考模式，快速响应，适合快速答题
# - deepseek-reasoner: DeepSeek-V3.2-Exp 思考模式，深度推理，适合复杂逻辑题

# API配置
API_BASE_URL = os.getenv("API_BASE_URL", "http://8.138.237.189:8000")

# 计划配置
PLAN_LIMITS = {
    "free": 50,        # 免费版：每日50次
    "standard": 500,   # 标准版：每日500次
    "premium": 2000,   # 高级版：每日2000次
    "pro": -1          # 专业版：无限
}

# 相似度匹配阈值
SIMILARITY_THRESHOLD = 0.7  # 相似度阈值（0-1）

# 日志配置
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

