"""
文本匹配工具
"""
from difflib import SequenceMatcher


def fuzzy_match(query: str, candidates: list[str], threshold: float = 0.85) -> dict | None:
    """
    模糊匹配文本
    
    Args:
        query: 查询文本
        candidates: 候选文本列表
        threshold: 相似度阈值
    
    Returns:
        {"index": int, "score": float, "text": str} 或 None
    """
    if not candidates:
        return None
    
    best_match = None
    best_score = 0.0
    best_index = -1
    
    # 规范化查询文本
    query_normalized = _normalize_text(query)
    
    for i, candidate in enumerate(candidates):
        # 规范化候选文本
        candidate_normalized = _normalize_text(candidate)
        
        # 计算相似度
        ratio = SequenceMatcher(None, query_normalized, candidate_normalized).ratio()
        
        if ratio > best_score:
            best_score = ratio
            best_match = candidate
            best_index = i
    
    if best_score >= threshold:
        return {
            "index": best_index,
            "score": best_score,
            "text": best_match
        }
    
    return None


def _normalize_text(text: str) -> str:
    """规范化文本（去除空格、标点等）"""
    import re
    # 移除HTML标签
    text = re.sub(r'<[^>]+>', '', text)
    # 移除多余空格
    text = re.sub(r'\s+', ' ', text)
    # 转小写
    text = text.lower().strip()
    return text
