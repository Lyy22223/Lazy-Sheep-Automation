"""
搜索服务
"""
import hashlib
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Question
from app.utils.text_matcher import fuzzy_match
from loguru import logger


class SearchService:
    """搜索服务"""
    
    @staticmethod
    async def search_question(
        content: str,
        question_type: str,
        platform: str,
        session: AsyncSession
    ) -> dict | None:
        """搜索题目答案"""
        try:
            # 1. 计算content hash
            content_hash = hashlib.md5(content.encode()).hexdigest()
            
            # 2. 精确匹配（通过hash）
            stmt = select(Question).where(
                Question.content_hash == content_hash,
                Question.platform == platform
            )
            result = await session.execute(stmt)
            question = result.scalar_one_or_none()
            
            if question:
                logger.info(f"精确匹配: {question.question_id}")
                return {
                    "answer": question.answer,
                    "answerText": question.answer_text,
                    "confidence": question.confidence,
                    "source": question.source,
                    "questionId": question.question_id
                }
            
            # 3. 模糊匹配
            stmt = select(Question).where(
                Question.type == question_type,
                Question.platform == platform
            ).limit(50)  # 限制候选数量
            result = await session.execute(stmt)
            candidates = result.scalars().all()
            
            if candidates:
                # 使用文本相似度匹配
                best_match = fuzzy_match(content, [q.content for q in candidates])
                if best_match and best_match["score"] > 0.85:
                    matched_q = candidates[best_match["index"]]
                    logger.info(f"模糊匹配: {matched_q.question_id}, 相似度: {best_match['score']}")
                    return {
                        "answer": matched_q.answer,
                        "answerText": matched_q.answer_text,
                        "confidence": matched_q.confidence * best_match["score"],
                        "source": matched_q.source,
                        "questionId": matched_q.question_id
                    }
            
            logger.info("未找到匹配题目")
            return None
            
        except Exception as e:
            logger.error(f"搜索失败: {e}")
            return None
    
    @staticmethod
    async def save_question(
        question_data: dict,
        session: AsyncSession
    ) -> bool:
        """保存题目到数据库"""
        try:
            # 计算hash
            content = question_data.get("questionContent", "")
            content_hash = hashlib.md5(content.encode()).hexdigest()
            
            # 检查是否已存在
            stmt = select(Question).where(Question.content_hash == content_hash)
            result = await session.execute(stmt)
            existing = result.scalar_one_or_none()
            
            if existing:
                # 更新答案（如果置信度更高）
                new_confidence = question_data.get("confidence", 0.8)
                if new_confidence > existing.confidence:
                    existing.answer = question_data.get("answer")
                    existing.answer_text = question_data.get("answerText")
                    existing.confidence = new_confidence
                    await session.commit()
                    logger.info(f"更新题目: {existing.question_id}")
                return True
            
            # 创建新题目
            question = Question(
                question_id=question_data.get("questionId"),
                content=content,
                content_hash=content_hash,
                type=question_data.get("type"),
                answer=question_data.get("answer"),
                answer_text=question_data.get("answerText"),
                options=question_data.get("options"),
                platform=question_data.get("platform", "czbk"),
                source=question_data.get("source", "ai"),
                confidence=question_data.get("confidence", 0.8),
                verified=question_data.get("verified", False)
            )
            
            session.add(question)
            await session.commit()
            logger.info(f"保存新题目: {question.question_id}")
            return True
            
        except Exception as e:
            logger.error(f"保存题目失败: {e}")
            await session.rollback()
            return False
