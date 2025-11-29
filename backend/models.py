"""
数据模型定义
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date


# ==================== API Key模型 ====================
class APIKey(BaseModel):
    """API Key数据模型"""
    id: Optional[int] = None
    api_key: str
    plan: str = "free"  # free, standard, premium, pro
    created_at: datetime
    expires_at: Optional[datetime] = None
    total_queries: int = 0
    daily_queries: int = 0
    daily_limit: int = 50
    last_reset_date: Optional[date] = None
    is_active: bool = True


# ==================== 搜索请求模型 ====================
class SearchRequest(BaseModel):
    """搜索答案请求"""
    questionId: Optional[str] = None
    questionContent: str
    type: str = "0"  # 0=单选, 1=多选, 2=判断, 3=填空, 4=简答
    options: Optional[List[str]] = None
    platform: Optional[str] = "czbk"  # 平台标识


# ==================== 搜索响应模型 ====================
class SearchResponse(BaseModel):
    """搜索答案响应"""
    code: int
    message: str
    data: Optional[dict] = None


# ==================== AI答题请求模型 ====================
class AIAnswerRequest(BaseModel):
    """AI答题请求"""
    questionContent: str
    type: str = "0"
    options: Optional[List[str]] = None
    platform: Optional[str] = "czbk"
    model: Optional[str] = None  # 可选的模型参数，用于指定使用的AI模型


# ==================== AI答题响应模型 ====================
class AIAnswerResponse(BaseModel):
    """AI答题响应"""
    code: int
    message: str
    data: Optional[dict] = None


# ==================== 题目数据模型 ====================
class Question(BaseModel):
    """题目数据模型"""
    id: Optional[int] = None
    question_id: str
    platform: str
    type: str
    question_content: str
    answer: Optional[str] = None
    solution: Optional[str] = None
    options: Optional[str] = None  # JSON字符串
    source: str = "system"  # system, api_key, public
    api_key: Optional[str] = None  # 如果是用户贡献的，记录API Key
    created_at: Optional[datetime] = None


# ==================== AI模型数据模型 ====================
class AIModel(BaseModel):
    """AI模型数据模型"""
    id: str
    name: str
    provider: str
    description: Optional[str] = ""
    baseUrl: Optional[str] = None
    features: Optional[List[str]] = []
    temperature: Optional[float] = 0.3
    maxTokens: Optional[int] = 2000
