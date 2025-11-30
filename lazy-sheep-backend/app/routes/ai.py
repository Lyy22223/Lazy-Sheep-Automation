"""
AI答题API路由
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.ai_service import AIService
from app.services.search_service import SearchService
from loguru import logger

router = APIRouter(prefix="/api/ai", tags=["ai"])


class AIAnswerRequest(BaseModel):
    """AI答题请求"""
    questionContent: str
    type: str
    options: list[str] = []
    platform: str = "czbk"
    model: str | None = None
    attemptedAnswers: list[str] | None = None


class AIAnswerResponse(BaseModel):
    """AI答题响应"""
    data: dict


@router.post("/answer", response_model=AIAnswerResponse)
async def ai_answer(
    request: AIAnswerRequest,
    session: AsyncSession = Depends(get_db)
):
    """使用AI生成答案"""
    try:
        logger.info(f"AI答题: type={request.type}")
        
        # 调用AI服务
        result = await AIService.answer_question(
            content=request.questionContent,
            question_type=request.type,
            options=request.options,
            model=request.model,
            attempted_answers=request.attemptedAnswers
        )
        
        # 自动保存到题库（可选）
        try:
            await SearchService.save_question(
                question_data={
                    "questionId": None,  # 自动生成
                    "questionContent": request.questionContent,
                    "type": request.type,
                    "answer": result["answer"],
                    "answerText": None,
                    "options": [{"text": opt} for opt in request.options] if request.options else None,
                    "platform": request.platform,
                    "source": "ai",
                    "confidence": result.get("confidence", 0.85),
                    "verified": False
                },
                session=session
            )
        except Exception as e:
            logger.warning(f"保存AI答案失败: {e}")
        
        return {"data": result}
        
    except Exception as e:
        logger.error(f"AI答题失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))
