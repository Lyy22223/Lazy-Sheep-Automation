"""
质量审核API路由
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from pydantic import BaseModel
from api.database import get_db
from api.models import Question
from api.services.quality_service import QualityService
from loguru import logger


router = APIRouter(prefix="/api/quality", tags=["quality"])


class AuditResponse(BaseModel):
    """审核响应模型"""
    questionId: str
    score: int
    quality: str
    answerCount: int
    uniqueAnswers: int
    issues: List[dict]
    needsReview: bool


@router.get("/audit/{question_id}", response_model=dict)
async def audit_question(
    question_id: str,
    session: AsyncSession = Depends(get_db)
):
    """
    审核单个题目的质量
    
    参数：
    - question_id: 题目ID
    
    返回：
    - score: 质量分数（0-100）
    - quality: 质量等级（excellent/good/fair/poor）
    - issues: 发现的问题列表
    """
    try:
        # 查找题目
        stmt = select(Question).where(Question.question_id == question_id)
        result = await session.execute(stmt)
        question = result.scalar_one_or_none()
        
        if not question:
            raise HTTPException(status_code=404, detail="题目不存在")
        
        # 执行审核
        audit_result = await QualityService.audit_question(session, question.id)
        
        return {
            "success": True,
            **audit_result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"审核失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/batch-audit", response_model=dict)
async def batch_audit(
    limit: int = Query(100, ge=1, le=500),
    session: AsyncSession = Depends(get_db)
):
    """
    批量审核题目质量
    
    参数：
    - limit: 审核数量限制（1-500）
    
    返回：
    - results: 审核结果列表（按分数从低到高排序）
    """
    try:
        results = await QualityService.batch_audit(session, limit)
        
        # 统计
        total = len(results)
        needs_review = sum(1 for r in results if r["needsReview"])
        avg_score = sum(r["score"] for r in results) / total if total > 0 else 0
        
        return {
            "success": True,
            "total": total,
            "needsReview": needs_review,
            "avgScore": round(avg_score, 2),
            "results": results
        }
        
    except Exception as e:
        logger.error(f"批量审核失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fix/{question_id}", response_model=dict)
async def auto_fix(
    question_id: str,
    session: AsyncSession = Depends(get_db)
):
    """
    自动修复题目的质量问题
    
    参数：
    - question_id: 题目ID
    
    修复项：
    - 自动设置最佳答案
    - 删除负投票过多的答案
    """
    try:
        # 查找题目
        stmt = select(Question).where(Question.question_id == question_id)
        result = await session.execute(stmt)
        question = result.scalar_one_or_none()
        
        if not question:
            raise HTTPException(status_code=404, detail="题目不存在")
        
        # 执行修复
        fix_result = await QualityService.auto_fix_issues(session, question.id)
        
        return {
            "success": True,
            **fix_result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"修复失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats", response_model=dict)
async def quality_stats(
    session: AsyncSession = Depends(get_db)
):
    """
    获取整体质量统计
    
    返回：
    - totalQuestions: 总题目数
    - answeredQuestions: 有答案的题目数
    - verifiedQuestions: 验证过的题目数
    - answerRate: 答题率
    - verifiedRate: 验证率
    - sourceStats: 各来源答案统计
    - avgConfidence: 平均置信度
    """
    try:
        stats = await QualityService.get_quality_stats(session)
        
        return {
            "success": True,
            **stats
        }
        
    except Exception as e:
        logger.error(f"获取统计失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/issues", response_model=dict)
async def get_issues(
    min_score: Optional[int] = Query(None, ge=0, le=100),
    issue_type: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_db)
):
    """
    获取存在质量问题的题目列表
    
    参数：
    - min_score: 最低分数过滤
    - issue_type: 问题类型过滤（conflict/low_confidence/negative_votes等）
    - limit: 返回数量限制
    
    返回：
    - 问题题目列表
    """
    try:
        # 批量审核
        all_results = await QualityService.batch_audit(session, limit * 2)
        
        # 过滤
        filtered = [
            r for r in all_results 
            if r["needsReview"]
        ]
        
        # 按分数过滤
        if min_score is not None:
            filtered = [r for r in filtered if r["score"] <= min_score]
        
        # 按问题类型过滤
        if issue_type:
            filtered = [
                r for r in filtered 
                if any(issue["type"] == issue_type for issue in r["issues"])
            ]
        
        # 限制数量
        filtered = filtered[:limit]
        
        return {
            "success": True,
            "count": len(filtered),
            "issues": filtered
        }
        
    except Exception as e:
        logger.error(f"获取问题列表失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))
