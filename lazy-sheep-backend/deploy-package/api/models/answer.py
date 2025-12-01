"""
答案数据模型 - 支持多答案存储
"""
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, Boolean, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from api.database import Base


class Answer(Base):
    """答案表 - 存储多个可能的答案"""
    __tablename__ = "answers"
    
    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(Integer, ForeignKey("questions.id", ondelete="CASCADE"), index=True)
    
    # 答案内容
    answer = Column(Text, nullable=False)  # 答案（单选：A，多选：A,B,C，填空：文本）
    answer_text = Column(Text)  # 答案文本说明
    
    # 来源信息
    source = Column(String(20), index=True, nullable=False)  # auto_answer/platform_verified/correction/user
    contributor = Column(String(64))  # 贡献者ID或标识
    
    # 质量评估
    confidence = Column(Float, default=1.0)  # 置信度 0-1
    vote_count = Column(Integer, default=0)  # 投票数（正票-负票）
    is_accepted = Column(Boolean, default=False, index=True)  # 是否为最佳答案
    
    # 验证信息
    verified = Column(Boolean, default=False)  # 是否人工验证
    verified_at = Column(DateTime(timezone=True))  # 验证时间
    verified_by = Column(String(64))  # 验证人
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # 关联关系
    question = relationship("Question", back_populates="answers")
    
    def to_dict(self):
        """转换为字典"""
        return {
            "id": self.id,
            "questionId": self.question_id,
            "answer": self.answer,
            "answerText": self.answer_text,
            "source": self.source,
            "contributor": self.contributor,
            "confidence": self.confidence,
            "voteCount": self.vote_count,
            "isAccepted": self.is_accepted,
            "verified": self.verified,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None
        }
