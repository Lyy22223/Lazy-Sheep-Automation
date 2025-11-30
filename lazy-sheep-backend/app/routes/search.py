"""
搜索API路由
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.services.search_service import SearchService
from loguru import logger

router = APIRouter(prefix="/api", tags=["search"])


class SearchRequest(BaseModel):
    """搜索请求"""
    questionId: str
    questionContent: str
    type: str
    platform: str = "czbk"


class SearchResponse(BaseModel):
    """搜索响应"""
    data: dict | None


@router.post("/search", response_model=SearchResponse)
async def search(
    request: SearchRequest,
    session: AsyncSession = Depends(get_db)
):
    """搜索单个题目答案"""
    try:
        logger.info(f"搜索题目: {request.questionId}")
        
        result = await SearchService.search_question(
            content=request.questionContent,
            question_type=request.type,
            platform=request.platform,
            session=session
        )
        
        if result:
            return {"data": result}
        else:
            return {"data": None}
            
    except Exception as e:
        logger.error(f"搜索失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class BatchSearchRequest(BaseModel):
    """批量搜索请求"""
    questions: list[dict]
    platform: str = "czbk"


class BatchSearchResponse(BaseModel):
    """批量搜索响应"""
    results: list[dict]
    summary: dict


@router.post("/search/batch", response_model=BatchSearchResponse)
async def batch_search(
    request: BatchSearchRequest,
    session: AsyncSession = Depends(get_db)
):
    """批量搜索题目答案"""
    try:
        logger.info(f"批量搜索: {len(request.questions)}道题")
        
        results = []
        found_count = 0
        
        for q in request.questions:
            result = await SearchService.search_question(
                content=q.get("questionContent", ""),
                question_type=q.get("type", "0"),
                platform=request.platform,
                session=session
            )
            
            if result:
                results.append({
                    "questionId": q.get("questionId"),
                    "status": "success",
                    **result
                })
                found_count += 1
            else:
                results.append({
                    "questionId": q.get("questionId"),
                    "status": "not_found"
                })
        
        return {
            "results": results,
            "summary": {
                "total": len(request.questions),
                "found": found_count,
                "notFound": len(request.questions) - found_count
            }
        }
        
    except Exception as e:
        logger.error(f"批量搜索失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))
