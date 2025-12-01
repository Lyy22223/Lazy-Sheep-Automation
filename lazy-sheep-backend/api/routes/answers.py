"""
答案管理API路由
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from pydantic import BaseModel
from api.database import get_db
from api.models import Question, Answer
from api.services.answer_service import AnswerService
from loguru import logger


router = APIRouter(prefix="/api/answers", tags=["answers"])


class AnswerCreate(BaseModel):
    """创建答案的请求模型"""
    questionId: str
    answer: str
    answerText: Optional[str] = None
    source: str = "user"
    contributor: Optional[str] = None
    confidence: float = 1.0


class AnswerVote(BaseModel):
    """投票请求模型"""
    vote: int  # 1=赞同，-1=反对


class AnswerResponse(BaseModel):
    """答案响应模型"""
    id: int
    questionId: int
    answer: str
    answerText: Optional[str]
    source: str
    contributor: Optional[str]
    confidence: float
    voteCount: int
    isAccepted: bool
    verified: bool
    createdAt: str
    updatedAt: Optional[str]


@router.post("/create", response_model=dict)
async def create_answer(
    data: AnswerCreate,
    session: AsyncSession = Depends(get_db)
):
    """
    添加新答案
    
    请求体：
    - questionId: 题目ID
    - answer: 答案内容
    - answerText: 答案说明（可选）
    - source: 来源标识
    - contributor: 贡献者（可选）
    - confidence: 置信度（0-1）
    """
    try:
        # 查找题目
        stmt = select(Question).where(Question.question_id == data.questionId)
        result = await session.execute(stmt)
        question = result.scalar_one_or_none()
        
        if not question:
            raise HTTPException(status_code=404, detail="题目不存在")
        
        # 添加答案（使用同步版本，因为AnswerService是同步的）
        # 这里需要将async session转换为sync session使用
        # 暂时直接创建Answer
        
        # 检查是否已存在相同答案
        stmt = select(Answer).where(
            Answer.question_id == question.id,
            Answer.answer == data.answer,
            Answer.source == data.source
        )
        result = await session.execute(stmt)
        existing = result.scalar_one_or_none()
        
        if existing:
            # 更新置信度
            if data.confidence > existing.confidence:
                existing.confidence = data.confidence
                await session.commit()
                await session.refresh(existing)
                return {
                    "success": True,
                    "message": "答案已存在，更新置信度",
                    "answer": existing.to_dict()
                }
            return {
                "success": True,
                "message": "答案已存在",
                "answer": existing.to_dict()
            }
        
        # 创建新答案
        new_answer = Answer(
            question_id=question.id,
            answer=data.answer,
            answer_text=data.answerText,
            source=data.source,
            contributor=data.contributor or data.source,
            confidence=data.confidence
        )
        
        session.add(new_answer)
        await session.commit()
        await session.refresh(new_answer)
        
        # 评估最佳答案
        await _evaluate_best_answer_async(session, question.id)
        
        return {
            "success": True,
            "message": "答案添加成功",
            "answer": new_answer.to_dict()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"添加答案失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{question_id}", response_model=dict)
async def get_answers(
    question_id: str,
    include_all: bool = False,
    session: AsyncSession = Depends(get_db)
):
    """
    获取题目的所有答案
    
    参数：
    - question_id: 题目ID
    - include_all: 是否包含所有答案（否则只返回最佳答案）
    """
    try:
        # 查找题目
        stmt = select(Question).where(Question.question_id == question_id)
        result = await session.execute(stmt)
        question = result.scalar_one_or_none()
        
        if not question:
            raise HTTPException(status_code=404, detail="题目不存在")
        
        # 获取答案
        query = select(Answer).where(Answer.question_id == question.id)
        
        if not include_all:
            query = query.where(Answer.is_accepted == True)
        
        query = query.order_by(Answer.vote_count.desc(), Answer.confidence.desc())
        
        result = await session.execute(query)
        answers = result.scalars().all()
        
        return {
            "success": True,
            "questionId": question_id,
            "count": len(answers),
            "answers": [ans.to_dict() for ans in answers]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取答案失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{answer_id}/vote", response_model=dict)
async def vote_answer(
    answer_id: int,
    data: AnswerVote,
    session: AsyncSession = Depends(get_db)
):
    """
    对答案投票
    
    参数：
    - answer_id: 答案ID
    - vote: 投票值（1=赞同，-1=反对）
    """
    try:
        # 查找答案
        stmt = select(Answer).where(Answer.id == answer_id)
        result = await session.execute(stmt)
        answer = result.scalar_one_or_none()
        
        if not answer:
            raise HTTPException(status_code=404, detail="答案不存在")
        
        # 投票
        answer.vote_count += data.vote
        await session.commit()
        await session.refresh(answer)
        
        # 重新评估最佳答案
        await _evaluate_best_answer_async(session, answer.question_id)
        
        return {
            "success": True,
            "message": "投票成功",
            "answer": answer.to_dict()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"投票失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{question_id}/conflicts", response_model=dict)
async def detect_conflicts(
    question_id: str,
    session: AsyncSession = Depends(get_db)
):
    """
    检测答案冲突
    
    参数：
    - question_id: 题目ID
    """
    try:
        # 查找题目
        stmt = select(Question).where(Question.question_id == question_id)
        result = await session.execute(stmt)
        question = result.scalar_one_or_none()
        
        if not question:
            raise HTTPException(status_code=404, detail="题目不存在")
        
        # 获取所有答案
        stmt = select(Answer).where(Answer.question_id == question.id)
        result = await session.execute(stmt)
        answers = result.scalars().all()
        
        if len(answers) <= 1:
            return {
                "success": True,
                "hasConflict": False,
                "answerCount": len(answers),
                "uniqueAnswers": len(answers)
            }
        
        # 统计不同的答案
        unique_answers = {}
        for ans in answers:
            answer_key = ans.answer
            if answer_key not in unique_answers:
                unique_answers[answer_key] = []
            unique_answers[answer_key].append(ans)
        
        has_conflict = len(unique_answers) > 1
        
        # 计算每个答案的支持度
        answer_stats = []
        for answer_text, ans_list in unique_answers.items():
            total_confidence = sum(a.confidence for a in ans_list)
            total_votes = sum(a.vote_count for a in ans_list)
            sources = list(set(a.source for a in ans_list))
            
            answer_stats.append({
                "answer": answer_text,
                "count": len(ans_list),
                "confidence": total_confidence / len(ans_list),
                "votes": total_votes,
                "sources": sources
            })
        
        # 按投票和置信度排序
        answer_stats.sort(
            key=lambda x: (x["votes"], x["confidence"]), 
            reverse=True
        )
        
        return {
            "success": True,
            "hasConflict": has_conflict,
            "answerCount": len(answers),
            "uniqueAnswers": len(unique_answers),
            "answers": answer_stats,
            "recommendation": answer_stats[0]["answer"] if answer_stats else None
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"检测冲突失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def _evaluate_best_answer_async(session: AsyncSession, question_id: int):
    """异步版本：评估并更新最佳答案"""
    try:
        # 获取所有答案
        stmt = select(Answer).where(Answer.question_id == question_id)
        result = await session.execute(stmt)
        answers = result.scalars().all()
        
        if not answers:
            return
        
        # 先清除所有is_accepted标记
        for ans in answers:
            ans.is_accepted = False
        
        # 按优先级选择最佳答案
        def answer_priority(ans: Answer) -> tuple:
            return (
                ans.verified,
                ans.source == "platform_verified",
                ans.vote_count,
                ans.confidence
            )
        
        best_answer = max(answers, key=answer_priority)
        best_answer.is_accepted = True
        
        # 更新Question表（向后兼容）
        stmt = select(Question).where(Question.id == question_id)
        result = await session.execute(stmt)
        question = result.scalar_one_or_none()
        
        if question:
            question.answer = best_answer.answer
            question.answer_text = best_answer.answer_text
            question.source = best_answer.source
            question.confidence = best_answer.confidence
        
        await session.commit()
        logger.info(f"更新最佳答案: Question {question_id}")
        
    except Exception as e:
        logger.error(f"评估最佳答案失败: {e}")
        await session.rollback()
