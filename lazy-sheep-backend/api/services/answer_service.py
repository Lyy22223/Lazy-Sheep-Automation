"""
答案聚合服务 - 处理多答案存储、投票和质量评估
"""
from typing import List, Optional, Dict
from sqlalchemy.orm import Session
from sqlalchemy import desc, and_
from api.models.question import Question
from api.models.answer import Answer
import hashlib


class AnswerService:
    """答案服务 - 处理多答案逻辑"""
    
    @staticmethod
    def add_answer(
        session: Session,
        question_id: int,
        answer: str,
        answer_text: Optional[str] = None,
        source: str = "user",
        contributor: Optional[str] = None,
        confidence: float = 1.0
    ) -> Answer:
        """
        添加新答案
        
        Args:
            session: 数据库会话
            question_id: 题目ID
            answer: 答案内容
            answer_text: 答案文本说明
            source: 来源标识
            contributor: 贡献者
            confidence: 置信度
            
        Returns:
            Answer: 创建的答案对象
        """
        # 检查是否已存在相同答案
        existing = session.query(Answer).filter(
            and_(
                Answer.question_id == question_id,
                Answer.answer == answer,
                Answer.source == source
            )
        ).first()
        
        if existing:
            # 如果已存在，更新置信度（取更高值）
            if confidence > existing.confidence:
                existing.confidence = confidence
                session.commit()
                session.refresh(existing)
            return existing
        
        # 创建新答案
        new_answer = Answer(
            question_id=question_id,
            answer=answer,
            answer_text=answer_text,
            source=source,
            contributor=contributor or source,
            confidence=confidence
        )
        
        session.add(new_answer)
        session.commit()
        session.refresh(new_answer)
        
        # 自动评估是否应该设为最佳答案
        AnswerService._evaluate_best_answer(session, question_id)
        
        return new_answer
    
    @staticmethod
    def get_answers(
        session: Session,
        question_id: int,
        include_all: bool = False
    ) -> List[Answer]:
        """
        获取题目的所有答案
        
        Args:
            session: 数据库会话
            question_id: 题目ID
            include_all: 是否包含所有答案（否则只返回最佳答案）
            
        Returns:
            List[Answer]: 答案列表
        """
        query = session.query(Answer).filter(Answer.question_id == question_id)
        
        if not include_all:
            query = query.filter(Answer.is_accepted == True)
        
        return query.order_by(desc(Answer.vote_count), desc(Answer.confidence)).all()
    
    @staticmethod
    def get_best_answer(session: Session, question_id: int) -> Optional[Answer]:
        """
        获取最佳答案
        
        Args:
            session: 数据库会话
            question_id: 题目ID
            
        Returns:
            Optional[Answer]: 最佳答案，如果没有则返回None
        """
        return session.query(Answer).filter(
            and_(
                Answer.question_id == question_id,
                Answer.is_accepted == True
            )
        ).order_by(desc(Answer.vote_count), desc(Answer.confidence)).first()
    
    @staticmethod
    def vote_answer(
        session: Session,
        answer_id: int,
        vote: int
    ) -> Answer:
        """
        对答案投票
        
        Args:
            session: 数据库会话
            answer_id: 答案ID
            vote: 投票值（1=赞同，-1=反对）
            
        Returns:
            Answer: 更新后的答案
        """
        answer = session.query(Answer).get(answer_id)
        if not answer:
            raise ValueError(f"答案 {answer_id} 不存在")
        
        answer.vote_count += vote
        session.commit()
        session.refresh(answer)
        
        # 重新评估最佳答案
        AnswerService._evaluate_best_answer(session, answer.question_id)
        
        return answer
    
    @staticmethod
    def detect_conflicts(
        session: Session,
        question_id: int
    ) -> Dict:
        """
        检测答案冲突
        
        Args:
            session: 数据库会话
            question_id: 题目ID
            
        Returns:
            Dict: 冲突检测结果
        """
        answers = session.query(Answer).filter(
            Answer.question_id == question_id
        ).all()
        
        if len(answers) <= 1:
            return {
                "has_conflict": False,
                "answer_count": len(answers),
                "unique_answers": len(answers)
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
            "has_conflict": has_conflict,
            "answer_count": len(answers),
            "unique_answers": len(unique_answers),
            "answers": answer_stats,
            "recommendation": answer_stats[0]["answer"] if answer_stats else None
        }
    
    @staticmethod
    def _evaluate_best_answer(session: Session, question_id: int):
        """
        自动评估并设置最佳答案
        
        评估规则（优先级从高到低）：
        1. 人工验证的答案
        2. platform_verified来源的答案
        3. 投票数最高的答案
        4. 置信度最高的答案
        
        Args:
            session: 数据库会话
            question_id: 题目ID
        """
        # 获取所有答案
        answers = session.query(Answer).filter(
            Answer.question_id == question_id
        ).all()
        
        if not answers:
            return
        
        # 先清除所有is_accepted标记
        for ans in answers:
            ans.is_accepted = False
        
        # 按优先级排序
        def answer_priority(ans: Answer) -> tuple:
            return (
                ans.verified,  # 人工验证
                ans.source == "platform_verified",  # 平台验证
                ans.vote_count,  # 投票数
                ans.confidence  # 置信度
            )
        
        # 选择最佳答案
        best_answer = max(answers, key=answer_priority)
        best_answer.is_accepted = True
        
        # 更新Question表的answer字段（向后兼容）
        question = session.query(Question).get(question_id)
        if question:
            question.answer = best_answer.answer
            question.answer_text = best_answer.answer_text
            question.source = best_answer.source
            question.confidence = best_answer.confidence
        
        session.commit()
    
    @staticmethod
    def merge_answers(
        session: Session,
        question_id: int,
        target_answer_id: int
    ):
        """
        合并答案（将其他答案的投票合并到目标答案）
        
        Args:
            session: 数据库会话
            question_id: 题目ID
            target_answer_id: 目标答案ID
        """
        target = session.query(Answer).get(target_answer_id)
        if not target or target.question_id != question_id:
            raise ValueError("目标答案无效")
        
        # 获取其他相同内容的答案
        other_answers = session.query(Answer).filter(
            and_(
                Answer.question_id == question_id,
                Answer.answer == target.answer,
                Answer.id != target_answer_id
            )
        ).all()
        
        # 合并投票和置信度
        for ans in other_answers:
            target.vote_count += ans.vote_count
            target.confidence = max(target.confidence, ans.confidence)
            session.delete(ans)
        
        session.commit()
        AnswerService._evaluate_best_answer(session, question_id)
