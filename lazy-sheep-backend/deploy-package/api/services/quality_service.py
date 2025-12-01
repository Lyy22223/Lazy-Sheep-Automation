"""
质量审核服务 - 自动检测和标记质量问题
"""
from typing import List, Dict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from api.models import Question, Answer
from loguru import logger


class QualityService:
    """质量审核服务"""
    
    @staticmethod
    async def audit_question(session: AsyncSession, question_id: int) -> Dict:
        """
        审核单个题目的质量
        
        检查项：
        1. 答案冲突
        2. 低置信度答案
        3. 负投票答案
        4. 缺少验证
        
        Args:
            session: 数据库会话
            question_id: 题目ID
            
        Returns:
            Dict: 审核结果
        """
        issues = []
        score = 100  # 初始分数100
        
        # 获取题目和所有答案
        stmt = select(Question).where(Question.id == question_id)
        result = await session.execute(stmt)
        question = result.scalar_one_or_none()
        
        if not question:
            return {"error": "题目不存在"}
        
        stmt = select(Answer).where(Answer.question_id == question_id)
        result = await session.execute(stmt)
        answers = result.scalars().all()
        
        # 1. 检查答案数量
        if len(answers) == 0:
            issues.append({
                "type": "no_answer",
                "severity": "high",
                "message": "题目没有答案"
            })
            score -= 50
        
        # 2. 检查答案冲突
        unique_answers = set(ans.answer for ans in answers)
        if len(unique_answers) > 1:
            issues.append({
                "type": "conflict",
                "severity": "medium",
                "message": f"存在{len(unique_answers)}个不同答案",
                "details": list(unique_answers)
            })
            score -= 20
        
        # 3. 检查置信度
        low_confidence_answers = [
            ans for ans in answers 
            if ans.confidence < 0.7
        ]
        if low_confidence_answers:
            issues.append({
                "type": "low_confidence",
                "severity": "low",
                "message": f"{len(low_confidence_answers)}个答案置信度低于0.7",
                "count": len(low_confidence_answers)
            })
            score -= 10
        
        # 4. 检查负投票
        negative_votes = [
            ans for ans in answers 
            if ans.vote_count < -2
        ]
        if negative_votes:
            issues.append({
                "type": "negative_votes",
                "severity": "medium",
                "message": f"{len(negative_votes)}个答案负投票超过2",
                "count": len(negative_votes)
            })
            score -= 15
        
        # 5. 检查是否有人工验证
        verified_answers = [ans for ans in answers if ans.verified]
        if not verified_answers and len(answers) > 0:
            issues.append({
                "type": "not_verified",
                "severity": "low",
                "message": "没有经过人工验证的答案"
            })
            score -= 5
        
        # 6. 检查最佳答案
        accepted_answers = [ans for ans in answers if ans.is_accepted]
        if len(accepted_answers) == 0 and len(answers) > 0:
            issues.append({
                "type": "no_best_answer",
                "severity": "medium",
                "message": "没有标记最佳答案"
            })
            score -= 15
        elif len(accepted_answers) > 1:
            issues.append({
                "type": "multiple_best_answers",
                "severity": "high",
                "message": f"有{len(accepted_answers)}个最佳答案标记"
            })
            score -= 30
        
        # 计算质量等级
        if score >= 90:
            quality = "excellent"
        elif score >= 75:
            quality = "good"
        elif score >= 60:
            quality = "fair"
        else:
            quality = "poor"
        
        return {
            "questionId": question.question_id,
            "score": max(0, score),
            "quality": quality,
            "answerCount": len(answers),
            "uniqueAnswers": len(unique_answers),
            "issues": issues,
            "needsReview": len(issues) > 0
        }
    
    @staticmethod
    async def batch_audit(
        session: AsyncSession,
        limit: int = 100
    ) -> List[Dict]:
        """
        批量审核题目质量
        
        优先审核：
        1. 有多个答案的题目
        2. 最近更新的题目
        
        Args:
            session: 数据库会话
            limit: 审核数量限制
            
        Returns:
            List[Dict]: 审核结果列表
        """
        # 获取需要审核的题目
        # 优先选择有多个答案的题目
        stmt = select(Question).limit(limit)
        result = await session.execute(stmt)
        questions = result.scalars().all()
        
        results = []
        for question in questions:
            audit_result = await QualityService.audit_question(
                session, 
                question.id
            )
            results.append(audit_result)
        
        # 按分数排序，低分优先
        results.sort(key=lambda x: x["score"])
        
        return results
    
    @staticmethod
    async def auto_fix_issues(
        session: AsyncSession,
        question_id: int
    ) -> Dict:
        """
        自动修复质量问题
        
        修复项：
        1. 自动设置最佳答案（如果缺失）
        2. 删除负投票过多的答案
        
        Args:
            session: 数据库会话
            question_id: 题目ID
            
        Returns:
            Dict: 修复结果
        """
        fixed_issues = []
        
        # 获取审核结果
        audit = await QualityService.audit_question(session, question_id)
        
        if not audit.get("needsReview"):
            return {
                "questionId": audit["questionId"],
                "message": "无需修复",
                "fixed": []
            }
        
        stmt = select(Answer).where(Answer.question_id == question_id)
        result = await session.execute(stmt)
        answers = result.scalars().all()
        
        # 1. 自动设置最佳答案
        no_best_answer = any(
            issue["type"] == "no_best_answer" 
            for issue in audit["issues"]
        )
        
        if no_best_answer and answers:
            # 按优先级选择
            def answer_priority(ans: Answer) -> tuple:
                return (
                    ans.verified,
                    ans.source == "platform_verified",
                    ans.vote_count,
                    ans.confidence
                )
            
            best_answer = max(answers, key=answer_priority)
            best_answer.is_accepted = True
            
            # 更新Question表
            stmt = select(Question).where(Question.id == question_id)
            result = await session.execute(stmt)
            question = result.scalar_one_or_none()
            
            if question:
                question.answer = best_answer.answer
                question.answer_text = best_answer.answer_text
                question.source = best_answer.source
                question.confidence = best_answer.confidence
            
            fixed_issues.append("设置最佳答案")
        
        # 2. 删除负投票过多的答案（-5以下）
        for ans in answers:
            if ans.vote_count <= -5 and not ans.verified:
                await session.delete(ans)
                fixed_issues.append(f"删除负投票答案: {ans.id}")
        
        await session.commit()
        
        return {
            "questionId": audit["questionId"],
            "message": "修复完成",
            "fixed": fixed_issues,
            "count": len(fixed_issues)
        }
    
    @staticmethod
    async def get_quality_stats(session: AsyncSession) -> Dict:
        """
        获取整体质量统计
        
        Returns:
            Dict: 质量统计信息
        """
        # 总题目数
        stmt = select(func.count(Question.id))
        result = await session.execute(stmt)
        total_questions = result.scalar()
        
        # 有答案的题目数
        stmt = select(func.count(Question.id)).where(Question.answer.isnot(None))
        result = await session.execute(stmt)
        answered_questions = result.scalar()
        
        # 验证过的题目数
        stmt = select(func.count(Question.id)).where(Question.verified == True)
        result = await session.execute(stmt)
        verified_questions = result.scalar()
        
        # 各来源答案数
        stmt = select(Answer.source, func.count(Answer.id)).group_by(Answer.source)
        result = await session.execute(stmt)
        source_stats = {row[0]: row[1] for row in result}
        
        # 平均置信度
        stmt = select(func.avg(Answer.confidence))
        result = await session.execute(stmt)
        avg_confidence = result.scalar() or 0
        
        return {
            "totalQuestions": total_questions,
            "answeredQuestions": answered_questions,
            "verifiedQuestions": verified_questions,
            "answerRate": (answered_questions / total_questions * 100) if total_questions > 0 else 0,
            "verifiedRate": (verified_questions / total_questions * 100) if total_questions > 0 else 0,
            "sourceStats": source_stats,
            "avgConfidence": round(float(avg_confidence), 2)
        }
