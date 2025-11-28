#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
答案库搜索脚本
功能：实现答案库的多种搜索方式
1. 按题目内容搜索（模糊匹配）
2. 按题目ID搜索（精确匹配）
3. 按选项内容搜索
4. 按题目类型筛选
"""

import json
import sys
from typing import List, Dict, Optional, Any

# 题目类型名称映射
TYPE_NAMES = {
    '0': '单选题',
    '1': '多选题',
    '2': '判断题',
    '3': '填空题',
    '4': '简答题'
}


def load_answer_bank(filepath: str = 'answer.json') -> List[Dict]:
    """加载答案库"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"错误: 答案库文件 {filepath} 不存在")
        print("请先运行 update_answer_bank.py 生成答案库")
        return []
    except json.JSONDecodeError as e:
        print(f"错误: 解析答案库文件失败: {e}")
        return []


def search_by_content(answer_bank: List[Dict], keyword: str, case_sensitive: bool = False) -> List[Dict]:
    """
    按题目内容搜索（模糊匹配）
    
    Args:
        answer_bank: 答案库列表
        keyword: 搜索关键词
        case_sensitive: 是否区分大小写
    
    Returns:
        匹配的题目列表
    """
    results = []
    keyword_lower = keyword if case_sensitive else keyword.lower()
    
    for entry in answer_bank:
        question_content = entry.get('questionContent', '')
        if not case_sensitive:
            question_content = question_content.lower()
        
        if keyword_lower in question_content:
            results.append(entry)
    
    return results


def search_by_id(answer_bank: List[Dict], question_id: str) -> Optional[Dict]:
    """
    按题目ID搜索（精确匹配）
    
    Args:
        answer_bank: 答案库列表
        question_id: 题目ID
    
    Returns:
        匹配的题目，如果未找到返回None
    """
    for entry in answer_bank:
        if entry.get('id') == question_id or entry.get('questionId') == question_id:
            return entry
    return None


def search_by_options(answer_bank: List[Dict], keyword: str, case_sensitive: bool = False) -> List[Dict]:
    """
    按选项内容搜索
    
    Args:
        answer_bank: 答案库列表
        keyword: 搜索关键词
        case_sensitive: 是否区分大小写
    
    Returns:
        匹配的题目列表
    """
    results = []
    keyword_lower = keyword if case_sensitive else keyword.lower()
    seen_ids = set()  # 避免重复添加
    
    for entry in answer_bank:
        options = entry.get('options', [])
        if not options:
            continue
        
        for option in options:
            option_text = option if case_sensitive else option.lower()
            if keyword_lower in option_text:
                qid = entry.get('id') or entry.get('questionId')
                if qid not in seen_ids:
                    results.append(entry)
                    seen_ids.add(qid)
                break
    
    return results


def filter_by_type(answer_bank: List[Dict], question_type: str) -> List[Dict]:
    """
    按题目类型筛选
    
    Args:
        answer_bank: 答案库列表
        question_type: 题目类型 ('0'=单选, '1'=多选, '2'=判断, '3'=填空, '4'=简答)
    
    Returns:
        匹配的题目列表
    """
    results = []
    for entry in answer_bank:
        if entry.get('type') == question_type:
            results.append(entry)
    return results


def search_combined(answer_bank: List[Dict], 
                    keyword: Optional[str] = None,
                    question_id: Optional[str] = None,
                    question_type: Optional[str] = None,
                    search_options: bool = True) -> List[Dict]:
    """
    组合搜索：支持多种搜索条件组合
    
    Args:
        answer_bank: 答案库列表
        keyword: 搜索关键词（在题目内容和选项中搜索）
        question_id: 题目ID（精确匹配，优先级最高）
        question_type: 题目类型筛选
        search_options: 是否在选项中搜索关键词
    
    Returns:
        匹配的题目列表
    """
    results = []
    
    # 优先级1: 按ID精确搜索
    if question_id:
        entry = search_by_id(answer_bank, question_id)
        if entry:
            return [entry]
        return []
    
    # 优先级2: 按关键词搜索
    if keyword:
        # 在题目内容中搜索
        results = search_by_content(answer_bank, keyword)
        
        # 在选项中搜索（如果启用）
        if search_options:
            option_results = search_by_options(answer_bank, keyword)
            # 合并结果，去重
            seen_ids = {entry.get('id') or entry.get('questionId') for entry in results}
            for entry in option_results:
                qid = entry.get('id') or entry.get('questionId')
                if qid not in seen_ids:
                    results.append(entry)
                    seen_ids.add(qid)
    else:
        # 如果没有关键词，返回所有题目
        results = answer_bank.copy()
    
    # 优先级3: 按类型筛选
    if question_type:
        results = [entry for entry in results if entry.get('type') == question_type]
    
    return results


def format_answer_display(entry: Dict) -> str:
    """格式化题目显示"""
    qid = entry.get('id') or entry.get('questionId', 'N/A')
    qtype = entry.get('type', '0')
    type_name = TYPE_NAMES.get(qtype, f'类型{qtype}')
    question = entry.get('questionContent', '')
    answer = entry.get('answer', '')
    options = entry.get('options', [])
    solution = entry.get('solution', '')
    
    output = []
    output.append(f"【{type_name}】ID: {qid}")
    output.append(f"题目: {question}")
    
    if options:
        output.append("选项:")
        for opt in options:
            output.append(f"  {opt}")
    
    output.append(f"答案: {answer}")
    
    if solution and solution.strip() and solution != "无":
        output.append(f"解析: {solution}")
    
    return "\n".join(output)


def print_results(results: List[Dict], limit: int = 10):
    """打印搜索结果"""
    if not results:
        print("未找到匹配的题目")
        return
    
    total = len(results)
    print(f"\n找到 {total} 道题目" + (f"（显示前 {min(limit, total)} 道）" if total > limit else ""))
    print("=" * 80)
    
    for i, entry in enumerate(results[:limit], 1):
        print(f"\n[{i}/{total}]")
        print(format_answer_display(entry))
        print("-" * 80)
    
    if total > limit:
        print(f"\n... 还有 {total - limit} 道题目未显示")


def interactive_search(answer_bank: List[Dict]):
    """交互式搜索"""
    print("=" * 80)
    print("答案库搜索工具")
    print("=" * 80)
    print(f"答案库共 {len(answer_bank)} 道题目")
    print("\n搜索方式:")
    print("  1. 输入关键词 - 在题目内容和选项中搜索")
    print("  2. 输入 #ID - 按题目ID精确搜索")
    print("  3. 输入 type:类型 - 按题目类型筛选 (0=单选, 1=多选, 2=判断, 3=填空, 4=简答)")
    print("  4. 输入 q - 退出")
    print("=" * 80)
    
    while True:
        try:
            user_input = input("\n请输入搜索条件: ").strip()
            
            if not user_input or user_input.lower() == 'q':
                print("退出搜索")
                break
            
            # 解析输入
            question_id = None
            keyword = None
            question_type = None
            
            if user_input.startswith('#'):
                # ID搜索
                question_id = user_input[1:].strip()
            elif user_input.startswith('type:'):
                # 类型筛选
                question_type = user_input[5:].strip()
            else:
                # 关键词搜索
                keyword = user_input
            
            # 执行搜索
            results = search_combined(
                answer_bank,
                keyword=keyword,
                question_id=question_id,
                question_type=question_type
            )
            
            # 显示结果
            print_results(results, limit=20)
            
        except KeyboardInterrupt:
            print("\n\n退出搜索")
            break
        except Exception as e:
            print(f"错误: {e}")


def main():
    """主函数"""
    # 加载答案库
    answer_bank = load_answer_bank()
    
    if not answer_bank:
        return
    
    # 检查命令行参数
    if len(sys.argv) > 1:
        # 命令行模式
        keyword = sys.argv[1] if len(sys.argv) > 1 else None
        question_type = sys.argv[2] if len(sys.argv) > 2 else None
        
        results = search_combined(
            answer_bank,
            keyword=keyword,
            question_type=question_type
        )
        
        print_results(results, limit=50)
    else:
        # 交互式模式
        interactive_search(answer_bank)


if __name__ == '__main__':
    main()

