"""
配置管理
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
import os


class Settings(BaseSettings):
    """应用配置"""
    
    # 应用信息
    app_name: str = "懒羊羊题库API"
    app_version: str = "1.0.0"
    debug: bool = False
    port: int = 8000
    
    # 数据库
    database_url: str = "sqlite+aiosqlite:///./data/questions.db"
    
    # Redis
    redis_url: str = "redis://localhost:6379/0"
    redis_enabled: bool = False  # 开发时默认关闭
    
    # DeepSeek AI
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"
    
    # API认证
    api_key_required: bool = False  # 开发时默认关闭
    admin_api_key: str = "dev-admin-key"
    
    # 限流
    rate_limit_per_minute: int = 1000  # 开发时放宽
    rate_limit_per_day: int = 100000
    
    # 日志
    log_level: str = "INFO"
    log_file: str = "./data/app.log"
    
    model_config = SettingsConfigDict(
        # 优先读取.env.local（本地开发），不存在则读取.env（生产环境）
        env_file=".env.local" if os.path.exists(".env.local") else ".env",
        env_file_encoding="utf-8",
        case_sensitive=False
    )


@lru_cache()
def get_settings() -> Settings:
    """获取配置单例"""
    return Settings()
