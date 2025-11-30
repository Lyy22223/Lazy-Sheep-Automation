"""
工具函数模块
"""
import re
from typing import Optional


def clean_text_content(content: str) -> str:
    """
    清理文本内容，去除特殊标记（通用函数）
    
    去除：
    - 【csrf()】等CSRF相关标记（包括嵌套的【】）
    - 【【标记】】这种嵌套格式
    
    Args:
        content: 原始文本内容
        
    Returns:
        清理后的文本内容
    """
    if not content or not isinstance(content, str):
        return content
    
    # 去除所有包含csrf的标记（包括嵌套情况）
    # 处理【【csrf()】】这种嵌套情况，使用循环确保完全清除
    max_iterations = 10  # 防止无限循环
    iteration = 0
    while iteration < max_iterations:
        original_content = content
        
        # 去除【csrf()】及其所有变体（包括嵌套的【【】】）
        # 匹配一个或多个连续的【，然后是csrf相关的内容，最后是一个或多个连续的】
        content = re.sub(r'【+[^】]*csrf[^】]*】+', '', content, flags=re.IGNORECASE)
        content = re.sub(r'\[+[^\]]*csrf[^\]]*\]+', '', content, flags=re.IGNORECASE)
        content = re.sub(r'\{+[^}]*csrf[^}]*\}+', '', content, flags=re.IGNORECASE)
        
        # 去除单独的csrf()（不在括号内）
        content = re.sub(r'csrf\(\)', '', content, flags=re.IGNORECASE)
        
        # 如果内容没有变化，说明已经清理完成
        if content == original_content:
            break
        
        iteration += 1
    
    # 清理多余的空格和换行
    content = re.sub(r'\s+', ' ', content)  # 多个空格合并为一个
    content = re.sub(r'\n\s*\n', '\n', content)  # 多个换行合并为一个
    content = content.strip()
    
    return content


def clean_question_content(content: str) -> str:
    """
    清理题目内容，去除特殊标记
    
    Args:
        content: 原始题目内容
        
    Returns:
        清理后的题目内容
    """
    return clean_text_content(content)


def clean_answer_content(answer: str) -> str:
    """
    清理答案内容，去除特殊标记
    
    特别处理：
    - 【【csrf()】】这种嵌套格式（应该被完全清除）
    - 【【@Scheduled】】这种标记格式（应该保留内部内容）
    
    Args:
        answer: 原始答案内容
        
    Returns:
        清理后的答案内容
    """
    if not answer or not isinstance(answer, str):
        return answer
    
    # 第一步：先去除所有包含csrf的标记（包括嵌套）
    cleaned = answer
    max_iterations = 10
    iteration = 0
    while iteration < max_iterations:
        original_cleaned = cleaned
        
        # 去除所有包含csrf的标记（包括嵌套的【【】】）
        cleaned = re.sub(r'【+[^】]*csrf[^】]*】+', '', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'\[+[^\]]*csrf[^\]]*\]+', '', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'\{+[^}]*csrf[^}]*\}+', '', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'csrf\(\)', '', cleaned, flags=re.IGNORECASE)
        
        if cleaned == original_cleaned:
            break
        
        iteration += 1
    
    # 第二步：处理非csrf的嵌套标记，保留内部内容
    # 例如：【【@Scheduled】】 -> @Scheduled
    iteration = 0
    while iteration < max_iterations:
        original_cleaned = cleaned
        
        # 去除嵌套的【【】】，保留内部内容（不包含csrf的）
        cleaned = re.sub(r'【+([^】]+)】+', r'\1', cleaned)
        cleaned = re.sub(r'\[+([^\]]+)\]+', r'\1', cleaned)
        
        if cleaned == original_cleaned:
            break
        
        iteration += 1
    
    # 第三步：清理多余的空格
    cleaned = cleaned.strip()
    
    return cleaned

