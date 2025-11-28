"""
上传题库数据处理模块
"""
import json
from typing import Dict, List, Optional
from datetime import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal, PublicQuestionTable, APIKeyQuestionTable


async def process_upload_data(data: Dict, api_key: str) -> Dict:
    """
    处理上传的题库数据
    
    支持格式：
    1. data.json格式（题目数据）
    2. res.json格式（已答题数据，包含答案）
    3. answerRecords（答题记录数组）
    
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
                        result = await save_question(
                            session,
                            item,
                            question_type,
                            api_key,
                            "czbk"  # 默认平台
                        )
                        if result["is_new"]:
                            new_count += 1
                        else:
                            updated_count += 1
                        statistics[question_type] += 1
        
        # 处理res.json格式（已答题数据）
        if "res" in data and isinstance(data["res"], dict):
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
                        result = await save_question(
                            session,
                            item,
                            question_type,
                            api_key,
                            "czbk",
                            has_answer=True  # res.json包含答案
                        )
                        if result["is_new"]:
                            new_count += 1
                        else:
                            updated_count += 1
                        statistics[question_type] += 1
        
        # 处理answerRecords格式
        if "answerRecords" in data and isinstance(data["answerRecords"], list):
            for record in data["answerRecords"]:
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
        answer = item.get("stuAnswer") or item.get("answer") or item.get("stu_answer")
        if isinstance(answer, list):
            answer = ",".join(answer)
    
    # 提取解析
    solution = item.get("solution") or item.get("analysis") or item.get("解析")
    
    # 提取选项（JSON格式）
    options = None
    if "options" in item and item["options"]:
        options = json.dumps(item["options"], ensure_ascii=False)
    
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

