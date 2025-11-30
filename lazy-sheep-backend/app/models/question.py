"""
题目数据模型
"""
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, Boolean, JSON
from sqlalchemy.sql import func
from app.database import Base


class Question(Base):
    """题目表"""
    __tablename__ = "questions"
    
    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(String(64), unique=True, index=True)
    content = Column(Text, nullable=False)
    content_hash = Column(String(32), index=True)  # MD5用于快速查重
    type = Column(String(10), index=True)  # 0=单选 1=多选 2=判断 3=填空 4=简答
    answer = Column(Text)  # 答案（单选/判断：A，多选：A,B,C，填空：文本）
    answer_text = Column(Text)  # 答案文本说明
    options = Column(JSON)  # 选项列表 [{"key": "A", "text": "..."}]
    platform = Column(String(20), index=True, default="czbk")
    source = Column(String(20), default="ai")  # database/ai/user
    confidence = Column(Float, default=1.0)  # 置信度 0-1
    verified = Column(Boolean, default=False)  # 是否人工验证
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
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
