"""
智能纠错模块
处理批改响应，计算纠错策略
"""
import logging
from typing import Dict, List, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class AnswerAttemptCache:
    """答案尝试缓存管理器（内存版本，可扩展为数据库版本）"""
    
    def __init__(self):
        self._cache: Dict[str, List[str]] = {}  # questionId -> [尝试过的答案列表]
    
    def get_attempted(self, question_id: str) -> List[str]:
        """获取已尝试的答案列表"""
        return self._cache.get(question_id, [])
    
    def add_attempt(self, question_id: str, answer: str):
        """添加尝试过的答案"""
        if question_id not in self._cache:
            self._cache[question_id] = []
        answer_str = self._normalize_answer(answer)
        if answer_str not in self._cache[question_id]:
            self._cache[question_id].append(answer_str)
    
    def has_attempted(self, question_id: str, answer: str) -> bool:
        """检查答案是否已尝试过"""
        attempted = self.get_attempted(question_id)
        answer_str = self._normalize_answer(answer)
        return answer_str in attempted
    
    def clear(self, question_id: str):
        """清除某道题的缓存"""
        if question_id in self._cache:
            del self._cache[question_id]
    
    def clear_all(self):
        """清除所有缓存"""
        self._cache = {}
    
    def _normalize_answer(self, answer: str) -> str:
        """标准化答案格式（排序、去重）"""
        if isinstance(answer, list):
            return ','.join(sorted(answer))
        return str(answer).strip()
    
    def get_next_option(
        self, 
        question_id: str, 
        question_type: str, 
        all_options: Optional[List[str]] = None
    ) -> Optional[str]:
        """
        获取下一个未尝试的选项
        
        Args:
            question_id: 题目ID
            question_type: 题目类型（0=单选, 1=多选, 2=判断, 3=填空, 4=简答）
            all_options: 所有选项列表（如 ['A', 'B', 'C', 'D']）
        
        Returns:
            下一个应尝试的选项，如果所有选项都尝试过则返回None
        """
        attempted = self.get_attempted(question_id)
        option_letters = all_options or ['A', 'B', 'C', 'D', 'E', 'F']
        
        # 判断题（type == "2"）：只需要尝试一次就能排除
        if question_type == "2":
            if len(attempted) == 0:
                return 'A'  # 先尝试第一个选项
            elif len(attempted) == 1:
                return 'B'  # 第二个选项就是正确答案
            else:
                return None  # 已经尝试过两次，应该找到正确答案了
        
        # 单选题（type == "0"）：最多尝试3次（4个选项-1）
        if question_type == "0":
            for option in option_letters:
                if option not in attempted:
                    return option
            return None  # 所有选项都尝试过了
        
        # 多选题和填空题：返回None（暂不支持自动纠错）
        return None


# 全局缓存实例（单例模式）
_global_cache = AnswerAttemptCache()


def get_cache() -> AnswerAttemptCache:
    """获取全局缓存实例"""
    return _global_cache


def extract_correct_answer(item: Dict, question_type: str) -> Optional[str]:
    """
    从题目数据中提取正确答案
    
    Args:
        item: 题目数据字典
        question_type: 题目类型
    
    Returns:
        正确答案字符串（如 "A", "A,B", "对" 等），如果未找到则返回None
    """
    question_option_list = item.get("questionOptionList", [])
    
    # 优先从 questionOptionList 中提取正确答案（isTrue: true 的选项）
    if question_option_list and isinstance(question_option_list, list):
        correct_options = []
        for index, opt in enumerate(question_option_list):
            if opt.get("isTrue") is True:
                # 返回选项字母（A、B、C、D等）
                correct_options.append(chr(65 + index))  # 65是'A'的ASCII码
        
        if correct_options:
            return ",".join(correct_options)
    
    # 如果没有从选项提取到正确答案，尝试其他字段
    answer = item.get("answer") or item.get("correctAnswer") or item.get("rightAnswer")
    if answer:
        if isinstance(answer, list):
            return ",".join(answer)
        return str(answer)
    
    return None


def process_grading_response(
    res_json: Dict,
    attempted_answers: Optional[Dict[str, List[str]]] = None
) -> Dict:
    """
    处理批改响应，计算纠错策略
    
    Args:
        res_json: 完整的res.json数据
        attempted_answers: 前端已尝试的答案缓存（可选）
           格式: { "questionId": ["A", "B"], ... }
    
    Returns:
        纠错指令字典
        {
            "corrections": [
                {
                    "questionId": "xxx",
                    "questionType": "0",
                    "correctAnswer": "B",
                    "attemptedAnswers": ["A"],
                    "nextAnswer": "B",
                    "shouldCorrect": True
                }
            ],
            "cache": { /* 更新后的答案尝试缓存 */ }
        }
    """
    cache = get_cache()
    
    # 如果提供了前端缓存，先同步到后端缓存
    if attempted_answers:
        for question_id, answers in attempted_answers.items():
            for answer in answers:
                cache.add_attempt(question_id, answer)
    
    corrections = []
    result_object = res_json.get("resultObject", {})
    
    # 题目类型映射
    type_map = {
        "danxuan": "0",   # 单选题
        "duoxuan": "1",   # 多选题
        "panduan": "2",   # 判断题
        "tiankong": "3",  # 填空题
        "jianda": "4"     # 简答题
    }
    
    # 遍历所有题目类型
    for type_key, question_type in type_map.items():
        type_data = result_object.get(type_key, {})
        if not isinstance(type_data, dict):
            continue
        
        question_list = type_data.get("lists", [])
        if not isinstance(question_list, list):
            continue
        
        for item in question_list:
            question_id = item.get("id") or item.get("questionId")
            if not question_id:
                continue
            
            # 只处理答错的题目（correct: false）
            correct = item.get("correct")
            if correct is not False:
                continue  # 答对了，不需要纠错
            
            # 提取正确答案
            correct_answer = extract_correct_answer(item, question_type)
            if not correct_answer:
                logger.warning(f"题目 {question_id} 未找到正确答案，跳过纠错")
                continue
            
            # 获取已尝试的答案
            attempted = cache.get_attempted(question_id)
            
            # 检查正确答案是否已尝试过
            if cache.has_attempted(question_id, correct_answer):
                logger.info(f"题目 {question_id} 的正确答案 {correct_answer} 已尝试过，但答错了，可能是数据异常")
                continue
            
            # 计算下一个应尝试的答案
            # 对于单选题和判断题，使用智能策略
            if question_type in ["0", "2"]:  # 单选题或判断题
                # 获取所有选项
                question_option_list = item.get("questionOptionList", [])
                all_options = [chr(65 + i) for i in range(len(question_option_list))] if question_option_list else None
                
                # 如果正确答案不在已尝试列表中，直接使用正确答案
                next_answer = correct_answer.split(',')[0]  # 取第一个正确答案（单选题只有一个）
            else:
                # 多选题、填空题、简答题：直接使用正确答案
                next_answer = correct_answer
            
            # 记录到缓存
            if attempted:
                for ans in attempted:
                    cache.add_attempt(question_id, ans)
            
            corrections.append({
                "questionId": question_id,
                "questionType": question_type,
                "correctAnswer": correct_answer,
                "attemptedAnswers": attempted.copy(),
                "nextAnswer": next_answer,
                "shouldCorrect": True
            })
            
            logger.info(f"题目 {question_id} 需要纠错：正确答案={correct_answer}, 已尝试={attempted}, 下一步={next_answer}")
    
    # 构建更新后的缓存（返回给前端）
    updated_cache = {}
    for question_id in cache._cache:
        updated_cache[question_id] = cache.get_attempted(question_id)
    
    return {
        "corrections": corrections,
        "cache": updated_cache
    }


def get_correction_strategy(
    question_id: str,
    question_type: str,
    all_options: Optional[List[str]] = None,
    attempted_answers: Optional[List[str]] = None
) -> Dict:
    """
    根据题目和已尝试答案，返回下一个应该尝试的答案
    
    Args:
        question_id: 题目ID
        question_type: 题目类型
        all_options: 所有选项列表
        attempted_answers: 已尝试的答案列表
    
    Returns:
        {
            "nextAnswer": "B",
            "remainingAttempts": 2
        }
    """
    cache = get_cache()
    
    # 同步已尝试的答案到缓存
    if attempted_answers:
        for answer in attempted_answers:
            cache.add_attempt(question_id, answer)
    
    # 获取下一个选项
    next_answer = cache.get_next_option(question_id, question_type, all_options)
    
    # 计算剩余尝试次数
    attempted = cache.get_attempted(question_id)
    if question_type == "2":  # 判断题
        remaining = 2 - len(attempted)
    elif question_type == "0":  # 单选题
        option_count = len(all_options) if all_options else 4
        remaining = max(0, option_count - 1 - len(attempted))
    else:
        remaining = 0
    
    return {
        "nextAnswer": next_answer,
        "remainingAttempts": remaining
    }

