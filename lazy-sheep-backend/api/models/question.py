"""
题目数据模型
"""
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, Boolean, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from api.database import Base


class Question(Base):
    """题目表"""
    __tablename__ = "questions"
    
    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(String(64), unique=True, index=True)
    content = Column(Text, nullable=False)
    content_hash = Column(String(32), index=True)  # MD5用于快速查重
    type = Column(String(10), index=True)  # 0=单选 1=多选 2=判断 3=填空 4=简答
    
    # 保留answer字段用于兼容旧逻辑（存储最佳答案）
    answer = Column(Text)  # 当前最佳答案
    answer_text = Column(Text)  # 答案文本说明
    
    options = Column(JSON)  # 选项列表 [{"key": "A", "text": "..."}]
    platform = Column(String(20), index=True, default="czbk")
    
    # 保留source和confidence用于向后兼容
    source = Column(String(20), default="ai")  # 最佳答案来源
    confidence = Column(Float, default=1.0)  # 最佳答案置信度
    
    verified = Column(Boolean, default=False)  # 是否人工验证
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # 关联多个答案
    answers = relationship("Answer", back_populates="question", cascade="all, delete-orphan")
    
    def to_dict(self):
        """转换为字典"""
        return {
            "questionId": self.question_id,
            "content": self.content,
            "type": self.type,
            "answer": self.answer,
            "answerText": self.answer_text,
            "options": self.options,
            "platform": self.platform,
            "source": self.source,
            "confidence": self.confidence,
            "verified": self.verified,
            "createdAt": self.created_at.isoformat() if self.created_at else None
        }
