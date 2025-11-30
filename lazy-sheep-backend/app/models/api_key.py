"""
API Key数据模型
"""
from sqlalchemy import Column, Integer, String, DateTime, Boolean
from sqlalchemy.sql import func
from app.database import Base


class APIKey(Base):
    """API Key表"""
    __tablename__ = "api_keys"
    
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(64), unique=True, index=True)
    user_id = Column(String(64))
    name = Column(String(100))  # Key名称
    usage_count = Column(Integer, default=0)
    quota_daily = Column(Integer, default=50)
    quota_monthly = Column(Integer, default=1000)
    is_active = Column(Boolean, default=True)
    expire_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_used_at = Column(DateTime(timezone=True))
    
    def to_dict(self):
        """转换为字典"""
        return {
            "key": self.key,
            "name": self.name,
            "usageCount": self.usage_count,
            "quotaDaily": self.quota_daily,
            "quotaMonthly": self.quota_monthly,
            "isActive": self.is_active,
            "expireAt": self.expire_at.isoformat() if self.expire_at else None,
            "createdAt": self.created_at.isoformat() if self.created_at else None
        }
