"""
工具函数模块
"""
import re
from typing import Optional


def clean_question_content(content: str) -> str:
    """
    清理题目内容，去除特殊标记
    
    去除：
    - 【csrf()】等CSRF相关标记
    - 其他特殊格式标记
    
    Args:
        content: 原始题目内容
        
    Returns:
        清理后的题目内容
    """
    if not content or not isinstance(content, str):
        return content
    
    # 去除【csrf()】标记（包括各种变体）
    content = re.sub(r'【csrf\(\)】', '', content, flags=re.IGNORECASE)
    content = re.sub(r'\[csrf\(\)\]', '', content, flags=re.IGNORECASE)
    content = re.sub(r'\{csrf\(\)\}', '', content, flags=re.IGNORECASE)
    content = re.sub(r'csrf\(\)', '', content, flags=re.IGNORECASE)
    
    # 去除其他可能的特殊标记（但保留正常的括号内容）
    # 只去除明显是标记的【】内容，如【csrf()】、【token】等
    content = re.sub(r'【[^】]*csrf[^】]*】', '', content, flags=re.IGNORECASE)
    
    # 清理多余的空格和换行
    content = re.sub(r'\s+', ' ', content)  # 多个空格合并为一个
    content = re.sub(r'\n\s*\n', '\n', content)  # 多个换行合并为一个
    content = content.strip()
    
    return content

