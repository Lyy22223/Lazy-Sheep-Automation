"""
配置管理
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


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
    redis_enabled: bool = True
    
    # DeepSeek AI
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"
    
    # API认证
    api_key_required: bool = True
    admin_api_key: str = "sk-admin-change-this-key"
    
    # 限流
    rate_limit_per_minute: int = 60
    rate_limit_per_day: int = 1000
    
    # 日志
    log_level: str = "INFO"
    log_file: str = "./data/app.log"
    
    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """获取配置单例"""
    return Settings()
