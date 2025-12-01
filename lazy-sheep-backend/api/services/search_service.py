"""
搜索服务
"""
import hashlib
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from api.models import Question, Answer
from api.utils.text_matcher import fuzzy_match
from loguru import logger


class SearchService:
    """搜索服务"""
    
    @staticmethod
    async def search_question(
        content: str,
        question_type: str,
        platform: str,
        session: AsyncSession,
        question_id: str | None = None
    ) -> dict | None:
        """搜索题目答案"""
        try:
            # 1. 优先通过questionId精确查询（最快）
            if question_id:
                stmt = select(Question).where(
                    Question.question_id == question_id,
                    Question.platform == platform
                )
                result = await session.execute(stmt)
                question = result.scalar_one_or_none()
                
                if question:
                    logger.info(f"ID精确匹配: {question.question_id}")
                    return {
                        "answer": question.answer,
                        "answerText": question.answer_text,
                        "confidence": question.confidence,
                        "source": question.source,
                        "questionId": question.question_id
                    }
            
            # 2. 计算content hash
            content_hash = hashlib.md5(content.encode()).hexdigest()
            
            # 3. 精确匹配（通过hash）
            stmt = select(Question).where(
                Question.content_hash == content_hash,
                Question.platform == platform
            )
            result = await session.execute(stmt)
            question = result.scalar_one_or_none()
            
            if question:
                logger.info(f"Hash精确匹配: {question.question_id}")
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
        """保存题目到数据库（支持多答案存储）"""
        try:
            # 计算hash
            content = question_data.get("questionContent", "")
            content_hash = hashlib.md5(content.encode()).hexdigest()
            
            # 检查是否已存在
            stmt = select(Question).where(Question.content_hash == content_hash)
            result = await session.execute(stmt)
            existing = result.scalar_one_or_none()
            
            answer_text = question_data.get("answer")
            answer_desc = question_data.get("answerText")
            source = question_data.get("source", "ai")
            confidence = question_data.get("confidence", 0.8)
            
            if existing:
                # 题目已存在，添加新答案到answers表
                logger.info(f"题目已存在: {existing.question_id}，添加新答案")
                
                # 检查是否已有相同来源的答案
                stmt = select(Answer).where(
                    Answer.question_id == existing.id,
                    Answer.answer == answer_text,
                    Answer.source == source
                )
                result = await session.execute(stmt)
                existing_answer = result.scalar_one_or_none()
                
                if existing_answer:
                    # 答案已存在，更新置信度
                    if confidence > existing_answer.confidence:
                        existing_answer.confidence = confidence
                        await session.commit()
                        logger.info(f"更新答案置信度: {existing.question_id}")
                else:
                    # 添加新答案
                    new_answer = Answer(
                        question_id=existing.id,
                        answer=answer_text,
                        answer_text=answer_desc,
                        source=source,
                        contributor=source,
                        confidence=confidence
                    )
                    session.add(new_answer)
                    await session.commit()
                    logger.info(f"添加新答案: {existing.question_id} from {source}")
                    
                    # 自动评估最佳答案
                    await SearchService._evaluate_best_answer(session, existing.id)
                
                return True
            
            # 创建新题目
            question = Question(
                question_id=question_data.get("questionId"),
                content=content,
                content_hash=content_hash,
                type=question_data.get("type"),
                answer=answer_text,  # 保留用于向后兼容
                answer_text=answer_desc,
                options=question_data.get("options"),
                platform=question_data.get("platform", "czbk"),
                source=source,
                confidence=confidence,
                verified=question_data.get("verified", False)
            )
            
            session.add(question)
            await session.flush()  # 获取question.id
            
            # 同时添加到answers表
            answer = Answer(
                question_id=question.id,
                answer=answer_text,
                answer_text=answer_desc,
                source=source,
                contributor=source,
                confidence=confidence,
                is_accepted=True  # 第一个答案默认为最佳答案
            )
            session.add(answer)
            
            await session.commit()
            logger.info(f"保存新题目和答案: {question.question_id}")
            return True
            
        except Exception as e:
            logger.error(f"保存题目失败: {e}")
            await session.rollback()
            return False
    
    @staticmethod
    async def _evaluate_best_answer(session: AsyncSession, question_id: int):
        """评估并更新最佳答案"""
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
