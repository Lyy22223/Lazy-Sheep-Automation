#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
答案库更新脚本
功能：
1. 从res.json（已答题题库）中提取正确答案
2. 根据答题记录验证答案正确性
3. 将正确答案保存到answer.json文件中（增强版答题记录格式）
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


def get_opposite_judgment_answer(answer: str) -> str:
    """
    获取判断题的相反答案
    对 -> 错, 错 -> 对
    """
    answer = str(answer).strip()
    if answer == "对" or answer == "正确":
        return "错"
    elif answer == "错" or answer == "错误":
        return "对"
    return answer


def extract_correct_answer_from_question(question: Dict) -> Optional[str]:
    """
    从题目中提取正确答案
    优先级：
    1. 如果correct为true，使用stuAnswer作为正确答案（最可靠）
    2. 如果correct为false且是判断题，返回相反答案
    3. 从questionOptionList中查找isTrue为true的选项
    4. 从answer字段获取
    """
    question_type = question.get('questionType', '0')
    is_correct = question.get('correct') is True
    stu_answer = question.get('stuAnswer')
    
    # 方法1: 如果题目答对了，使用学生答案作为正确答案（最可靠的方法）
    if is_correct:
        if stu_answer and str(stu_answer).strip():
            answer_str = str(stu_answer).strip()
            # 处理多选题（可能是逗号分隔的字符串）
            if ',' in answer_str:
                # 转换为排序后的字符串（如 "A,B" -> "AB"）
                parts = [p.strip().upper() for p in answer_str.split(',')]
                return ''.join(sorted(parts))
            # 判断题保持原样（"对"或"错"）
            if question_type == '2':
                return answer_str
            return answer_str.upper()
    
    # 方法2: 如果题目答错了且是判断题，返回相反答案
    if not is_correct and question_type == '2' and stu_answer:
        opposite_answer = get_opposite_judgment_answer(stu_answer)
        print(f"  ⚠ 判断题答错，自动获取正确答案: {stu_answer} -> {opposite_answer}")
        return opposite_answer
    
    # 方法3: 从选项列表中查找正确答案（通过isTrue标记）
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
            if question_type == '1':  # 多选题
                return ''.join(sorted(correct_options))
            else:  # 单选题
                return correct_options[0] if correct_options else None
    
    # 方法4: 直接从answer字段获取
    answer = question.get('answer')
    if answer and str(answer).strip():
        answer_str = str(answer).strip()
        # 处理多选题格式
        if ',' in answer_str:
            parts = [p.strip().upper() for p in answer_str.split(',')]
            return ''.join(sorted(parts))
        # 判断题保持原样
        if question_type == '2':
            return answer_str
        return answer_str.upper()
    
    return None


def format_answer_for_output(answer: str, question_type: str) -> str:
    """
    格式化答案输出
    多选题：将"AB"转换为"A,B"格式
    """
    if not answer:
        return ""
    
    answer = str(answer).strip().upper()
    
    # 如果是多选题（type="1"），将连续字母转换为逗号分隔
    if question_type == '1' and len(answer) > 1:
        # 如果已经是逗号分隔格式，直接返回
        if ',' in answer:
            return answer
        # 否则转换为逗号分隔格式
        return ','.join(sorted(answer))
    
    return answer


def extract_options_from_question(question: Dict) -> Optional[List[str]]:
    """从题目中提取选项列表（仅文本）"""
    option_list = question.get('questionOptionList', [])
    if option_list:
        options = []
        for option in option_list:
            text = option.get('text', '').strip()
            if text:
                options.append(text)
        return options if options else None
    
    # 尝试从options字段解析（JSON字符串格式）
    options_str = question.get('options')
    if options_str:
        try:
            if isinstance(options_str, str):
                import ast
                options = ast.literal_eval(options_str)
            else:
                options = options_str
            if isinstance(options, list):
                return [str(opt).strip() for opt in options if opt]
        except:
            pass
    
    return None


def create_answer_entry(question: Dict, correct_answer: str, answer_record: Optional[Dict] = None) -> Dict:
    """
    创建答案库条目（增强版答题记录格式）
    """
    question_id = question.get('id') or question.get('questionId')
    question_type = question.get('questionType', '0')
    question_content = question.get('questionContent') or question.get('questionContentText', '')
    solution = question.get('solution', '') or ''
    
    # 格式化答案
    formatted_answer = format_answer_for_output(correct_answer, question_type)
    
    # 提取选项（仅对选择题）
    options = None
    if question_type in ['0', '1']:  # 单选或多选
        options = extract_options_from_question(question)
    
    # 构建答案条目
    entry = {
        "id": question_id,
        "questionId": question_id,
        "type": question_type,
        "questionContent": question_content,
        "answer": formatted_answer,
        "solution": solution,
        "status": "已答"
    }
    
    # 如果有选项，添加到条目中
    if options:
        entry["options"] = options
    
    # 如果有答题记录，保留时间戳
    if answer_record and answer_record.get('timestamp'):
        entry["timestamp"] = answer_record['timestamp']
    
    return entry


def process_answered_questions(res_data: Dict, answer_records: List[Dict], data_data: Dict) -> List[Dict]:
    """
    处理已答题的题目，提取正确答案并创建答案库条目
    返回: 答案库条目列表
    """
    answer_bank = []
    
    if not res_data or not res_data.get('resultObject'):
        print("警告: res.json 数据格式不正确")
        return answer_bank
    
    result = res_data['resultObject']
    question_types = ['danxuan', 'duoxuan', 'panduan', 'tiankong', 'jianda', 'jieda']
    
    # 创建答题记录索引，方便查找
    answer_record_map = {}
    for record in answer_records:
        qid = record.get('id') or record.get('questionId')
        if qid:
            answer_record_map[qid] = record
    
    # 创建data.json题目索引，用于获取完整题目信息
    data_question_map = {}
    if data_data and data_data.get('resultObject'):
        data_result = data_data['resultObject']
        for qtype in question_types:
            if data_result.get(qtype) and data_result[qtype].get('lists'):
                for question in data_result[qtype]['lists']:
                    qid = question.get('id') or question.get('questionId')
                    if qid:
                        data_question_map[qid] = question
    
    # 统计信息
    correct_count = 0
    wrong_count = 0
    judgment_wrong_count = 0  # 判断题答错数量
    
    # 遍历所有题目类型
    for qtype in question_types:
        if result.get(qtype) and result[qtype].get('lists'):
            for question in result[qtype]['lists']:
                question_id = question.get('id') or question.get('questionId')
                if not question_id:
                    continue
                
                is_correct = question.get('correct') is True
                question_type = question.get('questionType', '0')
                
                if is_correct:
                    correct_count += 1
                else:
                    wrong_count += 1
                    # 判断题答错时，也可以提取正确答案（相反答案）
                    if question_type == '2':
                        judgment_wrong_count += 1
                
                # 处理答对的题目，或者判断题答错的情况（可以提取正确答案）
                if is_correct or (not is_correct and question_type == '2'):
                    correct_answer = extract_correct_answer_from_question(question)
                    if not correct_answer:
                        # 如果无法从题目中提取，尝试从答题记录中获取
                        record = answer_record_map.get(question_id)
                        if record and record.get('answer'):
                            correct_answer = record['answer']
                            # 如果是判断题且答错了，获取相反答案
                            if question_type == '2' and not is_correct:
                                correct_answer = get_opposite_judgment_answer(correct_answer)
                    
                    if correct_answer:
                        # 优先使用data.json中的完整题目信息（包含选项）
                        full_question = data_question_map.get(question_id, question)
                        answer_record = answer_record_map.get(question_id)
                        
                        entry = create_answer_entry(full_question, correct_answer, answer_record)
                        answer_bank.append(entry)
    
    print(f"  统计: 答对 {correct_count} 题, 答错 {wrong_count} 题")
    if judgment_wrong_count > 0:
        print(f"  其中判断题答错 {judgment_wrong_count} 题（已自动提取正确答案）")
    return answer_bank


def main():
    """主函数"""
    print("=" * 60)
    print("答案库更新脚本")
    print("=" * 60)
    
    # 文件路径配置
    config = {
        'data_file': 'data.json',              # 未答题题库（用于获取完整题目信息）
        'res_file': 'res.json',                 # 已答题题库
        'answer_record_file': '答题记录_2025-11-28.json',  # 答题记录
        'output_file': 'answer.json'            # 输出文件
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
    answer_bank = process_answered_questions(res_data, answer_records, data_data)
    print(f"✓ 共提取 {len(answer_bank)} 个正确答案")
    
    # 按题目ID去重（保留最新的）
    print("\n[3/4] 处理答案库数据...")
    answer_dict = {}
    for entry in answer_bank:
        qid = entry.get('id') or entry.get('questionId')
        if qid:
            # 如果已存在，比较时间戳保留最新的
            if qid in answer_dict:
                old_timestamp = answer_dict[qid].get('timestamp', 0)
                new_timestamp = entry.get('timestamp', 0)
                if new_timestamp > old_timestamp:
                    answer_dict[qid] = entry
            else:
                answer_dict[qid] = entry
    
    final_answer_bank = list(answer_dict.values())
    # 按时间戳排序（可选）
    final_answer_bank.sort(key=lambda x: x.get('timestamp', 0))
    
    print(f"✓ 去重后共 {len(final_answer_bank)} 条答案")
    
    # 统计各类型题目数量
    type_count = {}
    for entry in final_answer_bank:
        qtype = entry.get('type', '0')
        type_count[qtype] = type_count.get(qtype, 0) + 1
    
    print("  题目类型统计:")
    type_names = {'0': '单选题', '1': '多选题', '2': '判断题', '3': '填空题', '4': '简答题'}
    for qtype, count in sorted(type_count.items()):
        type_name = type_names.get(qtype, f'类型{qtype}')
        print(f"    {type_name}: {count} 题")
    
    # 保存答案库
    print("\n[4/4] 保存答案库...")
    try:
        # 备份原文件（如果存在）
        if os.path.exists(config['output_file']):
            backup_file = config['output_file'] + '.backup'
            import shutil
            shutil.copy2(config['output_file'], backup_file)
            print(f"✓ 已备份原文件到 {backup_file}")
        
        # 保存答案库
        with open(config['output_file'], 'w', encoding='utf-8') as f:
            json.dump(final_answer_bank, f, ensure_ascii=False, indent=2)
        print(f"✓ 成功保存到 {config['output_file']}")
        
    except Exception as e:
        print(f"错误: 保存文件失败: {e}")
        return
    
    # 输出统计信息
    print("\n" + "=" * 60)
    print("更新完成！")
    print("=" * 60)
    print(f"答案库总题目数: {len(final_answer_bank)}")
    print(f"文件保存位置: {config['output_file']}")
    print("\n答案库结构说明:")
    print("  - id/questionId: 题目唯一标识")
    print("  - type: 题目类型 (0=单选, 1=多选, 2=判断, 3=填空, 4=简答)")
    print("  - questionContent: 题目内容（可用于文本搜索）")
    print("  - answer: 正确答案")
    print("  - options: 选项列表（仅选择题有）")
    print("  - solution: 解析说明（如有）")
    print("  - timestamp: 答题时间戳（如有）")
    print("=" * 60)


if __name__ == '__main__':
    main()

