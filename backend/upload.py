"""
上传题库数据处理模块
"""
import json
from typing import Dict, List, Optional
from datetime import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal, PublicQuestionTable, APIKeyQuestionTable


async def process_upload_data(data: Dict, api_key: str, only_correct: bool = None) -> Dict:
    """
    处理上传的题库数据
    
    支持格式：
    1. data.json格式（题目数据）
    2. res.json格式（已答题数据，包含答案）
    3. answerRecords（答题记录数组）
    
    Args:
        data: 题目数据字典
        api_key: API Key
        only_correct: 是否只处理答对的题目（correct: true），默认 False
    
    Returns:
        处理结果统计
    """
    updated_count = 0
    new_count = 0
    statistics = {
        "0": 0,  # 单选
        "1": 0,  # 多选
        "2": 0,  # 判断
        "3": 0,  # 填空
        "4": 0   # 简答
    }
    
    async with AsyncSessionLocal() as session:
        # 处理完整的 res.json 格式（直接包含 code, errorMessage, resultObject）
        # 格式: { code, errorMessage, resultObject: { danxuan: {...}, duoxuan: {...}, ... } }
        if "resultObject" in data and isinstance(data["resultObject"], dict):
            # 检查是否是 res.json 格式（包含 code 或 errorMessage）
            is_res_json = "code" in data or "errorMessage" in data
            # res.json 格式默认只保存正确答案（correct: true）
            # 如果 only_correct 为 None，res.json 格式默认为 True，其他格式默认为 False
            should_filter_correct = only_correct if only_correct is not None else (True if is_res_json else False)
            result = data["resultObject"]
            
            for type_key, type_data in result.items():
                if isinstance(type_data, dict) and "lists" in type_data:
                    type_map = {
                        "danxuan": "0",
                        "duoxuan": "1",
                        "panduan": "2",
                        "tiankong": "3",
                        "jianda": "4"
                    }
                    question_type = type_map.get(type_key, "0")
                    
                    for item in type_data["lists"]:
                        # res.json 格式：只保存正确答案（correct: true）
                        # 但判断题即使答错了也要处理（提取反向答案）
                        if should_filter_correct:
                            correct = item.get("correct")
                            # 判断题（type == "2"）即使答错了也要处理（提取反向答案）
                            if correct is not True and question_type != "2":
                                continue  # 跳过答错的题目（判断题除外）
                        
                        result_data = await save_question(
                            session,
                            item,
                            question_type,
                            api_key,
                            "czbk",
                            has_answer=is_res_json  # res.json包含答案
                        )
                        if result_data["is_new"]:
                            new_count += 1
                        else:
                            updated_count += 1
                        statistics[question_type] += 1
        
        # 处理data.json格式
        if "data" in data and isinstance(data["data"], dict):
            result = data["data"].get("resultObject", {})
            for type_key, type_data in result.items():
                if isinstance(type_data, dict) and "lists" in type_data:
                    type_map = {
                        "danxuan": "0",
                        "duoxuan": "1",
                        "panduan": "2",
                        "tiankong": "3",
                        "jianda": "4"
                    }
                    question_type = type_map.get(type_key, "0")
                    
                    for item in type_data["lists"]:
                        # 如果只处理答对的题目，检查 correct 字段
                        # 但判断题即使答错了也要处理（提取反向答案）
                        if only_correct:
                            correct = item.get("correct")
                            # 判断题（type == "2"）即使答错了也要处理
                            if correct is not True and question_type != "2":
                                continue  # 跳过答错的题目（判断题除外）
                        
                        result_data = await save_question(
                            session,
                            item,
                            question_type,
                            api_key,
                            "czbk"  # 默认平台
                        )
                        if result_data["is_new"]:
                            new_count += 1
                        else:
                            updated_count += 1
                        statistics[question_type] += 1
        
        # 处理res格式（嵌套的res.json格式）
        if "res" in data and isinstance(data["res"], dict):
            # res.json 格式默认只保存正确答案（correct: true）
            should_filter_correct = only_correct if only_correct is not None else True
            result = data["res"].get("resultObject", {})
            for type_key, type_data in result.items():
                if isinstance(type_data, dict) and "lists" in type_data:
                    type_map = {
                        "danxuan": "0",
                        "duoxuan": "1",
                        "panduan": "2",
                        "tiankong": "3",
                        "jianda": "4"
                    }
                    question_type = type_map.get(type_key, "0")
                    
                    for item in type_data["lists"]:
                        # res.json 格式：只保存正确答案（correct: true）
                        # 但判断题即使答错了也要处理（提取反向答案）
                        if should_filter_correct:
                            correct = item.get("correct")
                            # 判断题（type == "2"）即使答错了也要处理（提取反向答案）
                            if correct is not True and question_type != "2":
                                continue  # 跳过答错的题目（判断题除外）
                        
                        result_data = await save_question(
                            session,
                            item,
                            question_type,
                            api_key,
                            "czbk",
                            has_answer=True  # res.json包含答案
                        )
                        if result_data["is_new"]:
                            new_count += 1
                        else:
                            updated_count += 1
                        statistics[question_type] += 1
        
        # 处理answerRecords格式
        if "answerRecords" in data and isinstance(data["answerRecords"], list):
            for record in data["answerRecords"]:
                # 如果只处理答对的题目，检查 correct 字段
                # 但判断题即使答错了也要处理（提取反向答案）
                if only_correct:
                    correct = record.get("correct")
                    question_type = record.get("type") or record.get("questionType", "0")
                    # 判断题（type == "2"）即使答错了也要处理
                    if correct is not True and question_type != "2":
                        continue  # 跳过答错的题目（判断题除外）
                
                result = await save_answer_record(
                    session,
                    record,
                    api_key
                )
                if result["is_new"]:
                    new_count += 1
                else:
                    updated_count += 1
                
                question_type = record.get("type", record.get("questionType", "0"))
                if question_type in statistics:
                    statistics[question_type] += 1
        
        await session.commit()
    
    # 获取总题目数
    total = await get_total_question_count(api_key)
    
    return {
        "updated": updated_count,
        "new": new_count,
        "total": total,
        "statistics": statistics
    }


async def save_question(
    session: AsyncSession,
    item: Dict,
    question_type: str,
    api_key: str,
    platform: str,
    has_answer: bool = False
) -> Dict:
    """
    保存题目到数据库
    
    Returns:
        {"is_new": bool, "question_id": str}
    """
    question_id = item.get("id") or item.get("questionId") or item.get("question_id")
    question_content = item.get("questionContent") or item.get("question_content") or item.get("content", "")
    
    if not question_id or not question_content:
        return {"is_new": False, "question_id": None}
    
    # 提取答案
    answer = None
    if has_answer:
        correct = item.get("correct")
        question_option_list = item.get("questionOptionList", [])
        option_count = len(question_option_list) if isinstance(question_option_list, list) else 0
        is_two_choice = option_count == 2  # 二选一题目
        
        # 优先从 questionOptionList 中提取正确答案（isTrue: true 的选项）
        if question_option_list and option_count > 0:
            correct_options = []
            for index, opt in enumerate(question_option_list):
                if opt.get("isTrue") is True:
                    # 返回选项字母（A、B、C、D等）
                    correct_options.append(chr(65 + index))  # 65是'A'的ASCII码
            if correct_options:
                answer = ",".join(correct_options)
        
        # 如果没有从选项提取到正确答案，尝试其他方式
        if not answer:
            stu_answer = item.get("stuAnswer") or item.get("stu_answer")
            
            # 对于判断题（type == "2"）或二选一题目，如果答错了，需要反向提取
            if question_type == "2" or is_two_choice:
                if correct is False and stu_answer:
                    # 学生答错了，需要提取反向答案
                    if question_type == "2":
                        # 判断题：取反向答案（"对" ↔ "错"）
                        if stu_answer == "对" or stu_answer == "正确" or stu_answer == "True" or stu_answer == "true":
                            answer = "错"
                        elif stu_answer == "错" or stu_answer == "错误" or stu_answer == "False" or stu_answer == "false":
                            answer = "对"
                        else:
                            # 如果格式不标准，尝试反转
                            answer = "对" if stu_answer == "错" else "错"
                    elif is_two_choice:
                        # 二选一题目：提取另一个选项
                        # stuAnswer 是选项字母（A 或 B）
                        if stu_answer and len(stu_answer) == 1:
                            current_index = ord(stu_answer.upper()) - 65  # A=0, B=1
                            if 0 <= current_index < option_count:
                                # 取另一个选项（0->1, 1->0）
                                other_index = 1 - current_index
                                answer = chr(65 + other_index)  # 返回另一个选项字母
                elif correct is True and stu_answer:
                    # 学生答对了，直接使用 stuAnswer
                    answer = stu_answer
                elif stu_answer:
                    # correct 字段不存在或为 None，默认使用 stuAnswer（假设是正确的）
                    answer = stu_answer
                else:
                    # 如果没有 stuAnswer，尝试其他字段
                    answer = item.get("answer") or item.get("correctAnswer") or item.get("rightAnswer")
            else:
                # 非判断题且非二选一题目，直接使用其他字段
                if correct is True and stu_answer:
                    # 答对了，使用 stuAnswer
                    answer = stu_answer
                else:
                    # 使用其他字段
                    answer = item.get("answer") or item.get("stuAnswer") or item.get("stu_answer") or item.get("correctAnswer") or item.get("rightAnswer")
            
            if isinstance(answer, list):
                answer = ",".join(answer)
    
    # 提取解析
    solution = item.get("solution") or item.get("analysis") or item.get("解析")
    
    # 提取选项（JSON格式）
    options = None
    if "options" in item and item["options"]:
        # 如果 options 是字符串，尝试解析
        if isinstance(item["options"], str):
            try:
                options_data = json.loads(item["options"])
                options = json.dumps(options_data, ensure_ascii=False)
            except:
                options = item["options"]  # 如果解析失败，直接使用字符串
        else:
            options = json.dumps(item["options"], ensure_ascii=False)
    elif "questionOptionList" in item and isinstance(item["questionOptionList"], list):
        # 从 questionOptionList 提取选项文本
        import re
        options_list = []
        for opt in item["questionOptionList"]:
            text = opt.get("text", "")
            if text:
                # 移除选项字母前缀（A、B、C、D等）
                text = re.sub(r"^[A-Z][、\.]\s*", "", text).strip()
                if text:
                    options_list.append(text)
        if options_list:
            options = json.dumps(options_list, ensure_ascii=False)
    
    # 检查是否已存在（在API Key贡献库中）
    existing = await session.execute(
        select(APIKeyQuestionTable).where(
            APIKeyQuestionTable.api_key == api_key,
            APIKeyQuestionTable.question_id == question_id,
            APIKeyQuestionTable.platform == platform
        )
    )
    existing_record = existing.scalar_one_or_none()
    
    if existing_record:
        # 更新现有记录
        existing_record.question_content = question_content
        existing_record.type = question_type
        if answer:
            existing_record.answer = answer
        if solution:
            existing_record.solution = solution
        if options:
            existing_record.options = options
        return {"is_new": False, "question_id": question_id}
    else:
        # 创建新记录
        new_record = APIKeyQuestionTable(
            api_key=api_key,
            question_id=question_id,
            platform=platform,
            type=question_type,
            question_content=question_content,
            answer=answer,
            solution=solution,
            options=options,
            created_at=datetime.now()
        )
        session.add(new_record)
        return {"is_new": True, "question_id": question_id}


async def save_answer_record(
    session: AsyncSession,
    record: Dict,
    api_key: str
) -> Dict:
    """保存答题记录"""
    question_id = record.get("questionId") or record.get("id")
    question_type = record.get("type") or record.get("questionType", "0")
    question_content = record.get("questionContent") or record.get("content", "")
    answer = record.get("answer")
    platform = record.get("platform", "czbk")
    
    if not question_id:
        return {"is_new": False}
    
    if isinstance(answer, list):
        answer = ",".join(answer)
    
    # 检查是否已存在
    existing = await session.execute(
        select(APIKeyQuestionTable).where(
            APIKeyQuestionTable.api_key == api_key,
            APIKeyQuestionTable.question_id == question_id,
            APIKeyQuestionTable.platform == platform
        )
    )
    existing_record = existing.scalar_one_or_none()
    
    if existing_record:
        existing_record.answer = answer
        return {"is_new": False}
    else:
        new_record = APIKeyQuestionTable(
            api_key=api_key,
            question_id=question_id,
            platform=platform,
            type=question_type,
            question_content=question_content,
            answer=answer,
            created_at=datetime.now()
        )
        session.add(new_record)
        return {"is_new": True}


async def get_total_question_count(api_key: str) -> int:
    """获取总题目数"""
    from sqlalchemy import func
    async with AsyncSessionLocal() as session:
        # 统计API Key贡献库
        result = await session.execute(
            select(func.count(APIKeyQuestionTable.id)).where(
                APIKeyQuestionTable.api_key == api_key
            )
        )
        key_count = result.scalar() or 0
        
        # 统计公共答案库
        result = await session.execute(
            select(func.count(PublicQuestionTable.id))
        )
        public_count = result.scalar() or 0
        
        return key_count + public_count

