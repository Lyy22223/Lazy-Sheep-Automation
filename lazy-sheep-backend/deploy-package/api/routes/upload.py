"""
题目上传API路由
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from api.database import get_db
from api.services.search_service import SearchService
from loguru import logger
import uuid

router = APIRouter(prefix="/api", tags=["upload"])


class UploadRequest(BaseModel):
    """上传请求"""
    questionContent: str
    type: str
    answer: str
    answerText: str | None = None
    options: list[dict] | None = None
    platform: str = "czbk"
    source: str = "user"


class UploadResponse(BaseModel):
    """上传响应"""
    success: bool
    questionId: str | None = None
    message: str


@router.post("/upload", response_model=UploadResponse)
async def upload(
    request: UploadRequest,
    session: AsyncSession = Depends(get_db)
):
    """上传题目和答案"""
    try:
        logger.info(f"上传题目: type={request.type}")
        
        # 生成questionId
        question_id = str(uuid.uuid4())
        
        # 保存到数据库
        success = await SearchService.save_question(
            question_data={
                "questionId": question_id,
                "questionContent": request.questionContent,
                "type": request.type,
                "answer": request.answer,
                "answerText": request.answerText,
                "options": request.options,
                "platform": request.platform,
                "source": request.source,
                "confidence": 0.90,  # 用户上传默认90%
                "verified": False
            },
            session=session
        )
        
        if success:
            return {
                "success": True,
                "questionId": question_id,
                "message": "上传成功"
            }
        else:
            return {
                "success": False,
                "message": "上传失败"
            }
            
    except Exception as e:
        logger.error(f"上传失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))
