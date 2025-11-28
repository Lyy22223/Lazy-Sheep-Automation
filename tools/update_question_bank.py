#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
题库更新脚本
功能：
1. 从res.json（已答题题库）中提取正确答案
2. 根据答题记录验证答案正确性
3. 将正确答案更新到data.json（未答题题库）中
"""

import json
import os
from typing import Dict, List, Any, Optional

# 题目类型映射
QUESTION_TYPE_MAP = {
    '0': 'danxuan',    # 单选题
    '1': 'duoxuan',    # 多选题
    '2': 'panduan',    # 判断题
    '3': 'tiankong',   # 填空题
    '4': 'jianda',     # 简答题
    'jieda': 'jianda'  # 简答题（别名）
}

# 题目类型反向映射
TYPE_TO_NUMBER = {
    'danxuan': '0',
    'duoxuan': '1',
    'panduan': '2',
    'tiankong': '3',
    'jianda': '4',
    'jieda': '4'
}


def load_json_file(filepath: str) -> Any:
    """加载JSON文件"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"错误: 文件 {filepath} 不存在")
        return None
    except json.JSONDecodeError as e:
        print(f"错误: 解析JSON文件 {filepath} 失败: {e}")
        return None


def extract_correct_answer_from_question(question: Dict) -> Optional[str]:
    """
    从题目中提取正确答案
    优先级：
    1. 如果correct为true，使用stuAnswer作为正确答案（最可靠）
    2. 从questionOptionList中查找isTrue为true的选项
    3. 从answer字段获取
    """
    # 方法1: 如果题目答对了，使用学生答案作为正确答案（最可靠的方法）
    if question.get('correct') is True:
        stu_answer = question.get('stuAnswer')
        if stu_answer and str(stu_answer).strip():
            answer_str = str(stu_answer).strip()
            # 处理多选题（可能是逗号分隔的字符串）
            if ',' in answer_str:
                # 转换为排序后的字符串（如 "A,B" -> "AB"）
                parts = [p.strip().upper() for p in answer_str.split(',')]
                return ''.join(sorted(parts))
            return answer_str.upper()
    
    # 方法2: 从选项列表中查找正确答案（通过isTrue标记）
    option_list = question.get('questionOptionList', [])
    if option_list:
        correct_options = []
        option_letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
        
        for idx, option in enumerate(option_list):
            if option.get('isTrue') is True:
                if idx < len(option_letters):
                    correct_options.append(option_letters[idx])
        
        if correct_options:
            # 多选题返回多个选项，单选题返回单个选项
            question_type = question.get('questionType', '0')
            if question_type == '1':  # 多选题
                return ''.join(sorted(correct_options))
            else:  # 单选题
                return correct_options[0] if correct_options else None
    
    # 方法3: 直接从answer字段获取
    answer = question.get('answer')
    if answer and str(answer).strip():
        answer_str = str(answer).strip()
        # 处理多选题格式
        if ',' in answer_str:
            parts = [p.strip().upper() for p in answer_str.split(',')]
            return ''.join(sorted(parts))
        return answer_str.upper()
    
    return None


def get_question_by_id(data: Dict, question_id: str) -> Optional[Dict]:
    """从题库数据中根据ID查找题目"""
    if not data or not data.get('resultObject'):
        return None
    
    result = data['resultObject']
    question_types = ['danxuan', 'duoxuan', 'panduan', 'tiankong', 'jianda', 'jieda']
    
    for qtype in question_types:
        if result.get(qtype) and result[qtype].get('lists'):
            for question in result[qtype]['lists']:
                qid = question.get('id') or question.get('questionId')
                if qid == question_id:
                    return question
    
    return None


def update_question_answer(question: Dict, correct_answer: str):
    """更新题目的答案字段"""
    # 更新answer字段
    question['answer'] = correct_answer
    
    # 如果是单选题或多选题，更新questionOptionList中的isTrue标记
    option_list = question.get('questionOptionList', [])
    if option_list:
        option_letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
        
        # 先清除所有isTrue标记
        for option in option_list:
            option['isTrue'] = False
        
        # 根据答案设置isTrue标记
        if question.get('questionType') in ['0', '1']:  # 单选或多选
            for char in correct_answer.upper():
                if char in option_letters:
                    idx = option_letters.index(char)
                    if idx < len(option_list):
                        option_list[idx]['isTrue'] = True


def process_answered_questions(res_data: Dict, answer_records: List[Dict]) -> Dict[str, str]:
    """
    处理已答题的题目，提取正确答案
    返回: {question_id: correct_answer}
    """
    correct_answers = {}
    
    if not res_data or not res_data.get('resultObject'):
        print("警告: res.json 数据格式不正确")
        return correct_answers
    
    result = res_data['resultObject']
    question_types = ['danxuan', 'duoxuan', 'panduan', 'tiankong', 'jianda', 'jieda']
    
    # 创建答题记录索引，方便查找
    answer_record_map = {}
    for record in answer_records:
        qid = record.get('id') or record.get('questionId')
        if qid:
            answer_record_map[qid] = record
    
    # 统计信息
    correct_count = 0
    wrong_count = 0
    
    # 遍历所有题目类型
    for qtype in question_types:
        if result.get(qtype) and result[qtype].get('lists'):
            for question in result[qtype]['lists']:
                question_id = question.get('id') or question.get('questionId')
                if not question_id:
                    continue
                
                is_correct = question.get('correct') is True
                if is_correct:
                    correct_count += 1
                else:
                    wrong_count += 1
                
                # 只处理答对的题目（correct === true）
                if is_correct:
                    correct_answer = extract_correct_answer_from_question(question)
                    if correct_answer:
                        correct_answers[question_id] = correct_answer
                    else:
                        # 如果无法从题目中提取，尝试从答题记录中获取
                        record = answer_record_map.get(question_id)
                        if record and record.get('answer'):
                            # 标准化答案格式
                            answer = str(record['answer']).strip().upper()
                            if ',' in answer:
                                parts = [p.strip() for p in answer.split(',')]
                                answer = ''.join(sorted(parts))
                            correct_answers[question_id] = answer
    
    print(f"  统计: 答对 {correct_count} 题, 答错 {wrong_count} 题")
    return correct_answers


def update_data_question_bank(data_data: Dict, correct_answers: Dict[str, str]) -> tuple[int, int]:
    """
    更新data.json中的题目答案
    返回: (更新数量, 总题目数)
    """
    if not data_data or not data_data.get('resultObject'):
        print("警告: data.json 数据格式不正确")
        return 0, 0
    
    result = data_data['resultObject']
    question_types = ['danxuan', 'duoxuan', 'panduan', 'tiankong', 'jianda', 'jieda']
    
    updated_count = 0
    total_count = 0
    
    # 遍历所有题目类型
    for qtype in question_types:
        if result.get(qtype) and result[qtype].get('lists'):
            for question in result[qtype]['lists']:
                total_count += 1
                question_id = question.get('id') or question.get('questionId')
                
                if question_id and question_id in correct_answers:
                    correct_answer = correct_answers[question_id]
                    # 检查是否已经有答案且相同
                    current_answer = question.get('answer', '').strip()
                    if current_answer != correct_answer:
                        update_question_answer(question, correct_answer)
                        updated_count += 1
                        print(f"✓ 更新题目答案: {question_id} -> {correct_answer}")
                    else:
                        print(f"- 题目已有相同答案: {question_id} -> {correct_answer}")
    
    return updated_count, total_count


def main():
    """主函数"""
    print("=" * 60)
    print("题库更新脚本")
    print("=" * 60)
    
    # 文件路径配置
    config = {
        'data_file': 'data.json',              # 未答题题库
        'res_file': 'res.json',                 # 已答题题库
        'answer_record_file': '答题记录_2025-11-28.json',  # 答题记录
        'output_file': 'data.json'              # 输出文件（覆盖原文件）
    }
    
    # 加载数据文件
    print("\n[1/4] 加载数据文件...")
    data_data = load_json_file(config['data_file'])
    res_data = load_json_file(config['res_file'])
    answer_records = load_json_file(config['answer_record_file'])
    
    if not data_data or not res_data or not answer_records:
        print("错误: 无法加载必要的文件，程序退出")
        return
    
    print(f"✓ 成功加载 {config['data_file']}")
    print(f"✓ 成功加载 {config['res_file']}")
    print(f"✓ 成功加载 {config['answer_record_file']} (共 {len(answer_records)} 条记录)")
    
    # 处理已答题的题目，提取正确答案
    print("\n[2/4] 从已答题题库中提取正确答案...")
    correct_answers = process_answered_questions(res_data, answer_records)
    print(f"✓ 共提取 {len(correct_answers)} 个正确答案")
    
    # 更新data.json中的题目答案
    print("\n[3/4] 更新未答题题库...")
    updated_count, total_count = update_data_question_bank(data_data, correct_answers)
    print(f"✓ 共更新 {updated_count} 个题目答案 (总计 {total_count} 个题目)")
    
    # 保存更新后的数据
    print("\n[4/4] 保存更新后的数据...")
    try:
        # 备份原文件
        backup_file = config['output_file'] + '.backup'
        if os.path.exists(config['output_file']):
            import shutil
            shutil.copy2(config['output_file'], backup_file)
            print(f"✓ 已备份原文件到 {backup_file}")
        
        # 保存更新后的文件
        with open(config['output_file'], 'w', encoding='utf-8') as f:
            json.dump(data_data, f, ensure_ascii=False, indent=4)
        print(f"✓ 成功保存到 {config['output_file']}")
        
    except Exception as e:
        print(f"错误: 保存文件失败: {e}")
        return
    
    # 输出统计信息
    print("\n" + "=" * 60)
    print("更新完成！")
    print("=" * 60)
    print(f"提取正确答案数量: {len(correct_answers)}")
    print(f"更新题目数量: {updated_count}")
    print(f"总题目数量: {total_count}")
    print(f"更新率: {updated_count/total_count*100:.2f}%" if total_count > 0 else "N/A")
    print("=" * 60)


if __name__ == '__main__':
    main()

