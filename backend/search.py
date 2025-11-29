"""
答案搜索模块
"""
from typing import Optional, List, Dict
from sqlalchemy import select, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from difflib import SequenceMatcher
import jieba

from models import SearchRequest
from database import AsyncSessionLocal, PublicQuestionTable, APIKeyQuestionTable
from config import SIMILARITY_THRESHOLD
from utils import clean_question_content


async def search_answer(request: SearchRequest, api_key: str) -> Optional[Dict]:
    """
    搜索答案
    
    搜索策略：
    1. 优先搜索API Key贡献库（精确匹配）
    2. 搜索公共答案库（精确匹配）
    3. 模糊匹配（相似度匹配）
    """
    # 清理题目内容，去除特殊标记
    cleaned_content = clean_question_content(request.questionContent)
    
    async with AsyncSessionLocal() as session:
        # 1. 精确匹配：优先搜索API Key贡献库
        if request.questionId:
            result = await search_by_id_in_key_library(session, api_key, request.questionId, request.platform)
            if result:
                # 检查答案是否有效（不为None且不为空字符串）
                if result.answer is not None and str(result.answer).strip():
                    return {
                        "found": True,
                        "answer": result.answer,
                        "solution": result.solution,
                        "questionId": result.question_id,
                        "confidence": 1.0,
                        "matchType": "exact",
                        "source": "api_key"
                    }
                # 如果答案为空，继续搜索其他库
        
        # 2. 精确匹配：搜索公共答案库
        if request.questionId:
            result = await search_by_id_in_public(session, request.questionId, request.platform)
            if result:
                # 检查答案是否有效（不为None且不为空字符串）
                if result.answer is not None and str(result.answer).strip():
                    return {
                        "found": True,
                        "answer": result.answer,
                        "solution": result.solution,
                        "questionId": result.question_id,
                        "confidence": 1.0,
                        "matchType": "exact",
                        "source": "public"
                    }
                # 如果答案为空，继续搜索
        
        # 3. 文本相似度匹配：先搜索API Key贡献库
        result = await search_by_similarity_in_key_library(
            session, api_key, cleaned_content, request.type, request.platform
        )
        if result and result.get("confidence", 0) >= SIMILARITY_THRESHOLD:
            return result
        
        # 4. 文本相似度匹配：搜索公共答案库
        result = await search_by_similarity_in_public(
            session, cleaned_content, request.type, request.platform
        )
        if result and result.get("confidence", 0) >= SIMILARITY_THRESHOLD:
            return result
        
        return {"found": False}


async def search_by_id_in_key_library(
    session: AsyncSession,
    api_key: str,
    question_id: str,
    platform: Optional[str]
) -> Optional[APIKeyQuestionTable]:
    """在API Key贡献库中按ID搜索"""
    query = select(APIKeyQuestionTable).where(
        APIKeyQuestionTable.api_key == api_key,
        APIKeyQuestionTable.question_id == question_id
    )
    if platform:
        query = query.where(APIKeyQuestionTable.platform == platform)
    
    result = await session.execute(query)
    return result.scalar_one_or_none()


async def search_by_id_in_public(
    session: AsyncSession,
    question_id: str,
    platform: Optional[str]
) -> Optional[PublicQuestionTable]:
    """在公共答案库中按ID搜索"""
    query = select(PublicQuestionTable).where(
        PublicQuestionTable.question_id == question_id
    )
    if platform:
        query = query.where(PublicQuestionTable.platform == platform)
    
    result = await session.execute(query)
    return result.scalar_one_or_none()


async def search_by_similarity_in_key_library(
    session: AsyncSession,
    api_key: str,
    question_content: str,
    question_type: str,
    platform: Optional[str]
) -> Optional[Dict]:
    """在API Key贡献库中按相似度搜索"""
    query = select(APIKeyQuestionTable).where(
        APIKeyQuestionTable.api_key == api_key,
        APIKeyQuestionTable.type == question_type
    )
    if platform:
        query = query.where(APIKeyQuestionTable.platform == platform)
    
    result = await session.execute(query)
    questions = result.scalars().all()
    
    best_match = None
    best_score = 0
    
    for q in questions:
        score = calculate_similarity(question_content, q.question_content)
        if score > best_score:
            best_score = score
            best_match = q
    
    if best_match and best_score >= SIMILARITY_THRESHOLD:
        # 检查答案是否有效（不为None且不为空字符串）
        if best_match.answer is not None and str(best_match.answer).strip():
            return {
                "found": True,
                "answer": best_match.answer,
                "solution": best_match.solution,
                "questionId": best_match.question_id,
                "confidence": best_score,
                "matchType": "similar",
                "source": "api_key"
            }
        # 如果答案为空，返回None继续搜索
    
    return None


async def search_by_similarity_in_public(
    session: AsyncSession,
    question_content: str,
    question_type: str,
    platform: Optional[str]
) -> Optional[Dict]:
    """在公共答案库中按相似度搜索"""
    query = select(PublicQuestionTable).where(
        PublicQuestionTable.type == question_type
    )
    if platform:
        query = query.where(PublicQuestionTable.platform == platform)
    
    result = await session.execute(query)
    questions = result.scalars().all()
    
    best_match = None
    best_score = 0
    
    for q in questions:
        score = calculate_similarity(question_content, q.question_content)
        if score > best_score:
            best_score = score
            best_match = q
    
    if best_match and best_score >= SIMILARITY_THRESHOLD:
        # 检查答案是否有效（不为None且不为空字符串）
        if best_match.answer is not None and str(best_match.answer).strip():
            return {
                "found": True,
                "answer": best_match.answer,
                "solution": best_match.solution,
                "questionId": best_match.question_id,
                "confidence": best_score,
                "matchType": "similar",
                "source": "public"
            }
        # 如果答案为空，返回None继续搜索
    
    return None


def calculate_similarity(text1: str, text2: str) -> float:
    """
    计算两个文本的相似度
    
    使用多种方法：
    1. 编辑距离（SequenceMatcher）
    2. Jieba分词 + 词频匹配
    """
    # 方法1：编辑距离相似度
    similarity1 = SequenceMatcher(None, text1, text2).ratio()
    
    # 方法2：Jieba分词相似度
    words1 = set(jieba.cut(text1))
    words2 = set(jieba.cut(text2))
    
    if not words1 or not words2:
        return similarity1
    
    intersection = words1 & words2
    union = words1 | words2
    similarity2 = len(intersection) / len(union) if union else 0
    
    # 综合相似度（加权平均）
    return (similarity1 * 0.6 + similarity2 * 0.4)


async def batch_search_answer(requests: List[SearchRequest], api_key: str) -> List[Dict]:
    """批量搜索答案"""
    results = []
    for request in requests:
        result = await search_answer(request, api_key)
        results.append(result)
    return results


async def get_answer_stats(api_key: str) -> Dict:
    """获取答案库统计信息"""
    async with AsyncSessionLocal() as session:
        # 统计API Key贡献库
        key_count = await session.execute(
            select(func.count(APIKeyQuestionTable.id)).where(
                APIKeyQuestionTable.api_key == api_key
            )
        )
        key_total = key_count.scalar() or 0
        
        # 统计公共答案库
        public_count = await session.execute(
            select(func.count(PublicQuestionTable.id))
        )
        public_total = public_count.scalar() or 0
        
        # 按类型统计
        stats = {
            "total": key_total + public_total,
            "api_key_total": key_total,
            "public_total": public_total,
            "by_type": {}
        }
        
        # 统计各类型数量
        for q_type in ['0', '1', '2', '3', '4']:
            key_type_count = await session.execute(
                select(func.count(APIKeyQuestionTable.id)).where(
                    APIKeyQuestionTable.api_key == api_key,
                    APIKeyQuestionTable.type == q_type
                )
            )
            public_type_count = await session.execute(
                select(func.count(PublicQuestionTable.id)).where(
                    PublicQuestionTable.type == q_type
                )
            )
            stats["by_type"][q_type] = (key_type_count.scalar() or 0) + (public_type_count.scalar() or 0)
        
        return stats

