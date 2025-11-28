"""
认证和权限控制模块
"""
from fastapi import HTTPException, Depends, Header
from typing import Optional
from datetime import datetime, date
from models import APIKey
from database import get_api_key_by_key, AsyncSessionLocal
from config import PLAN_LIMITS


async def get_api_key_header(x_api_key: Optional[str] = Header(None, alias="X-API-Key")) -> str:
    """从请求头获取API Key"""
    if not x_api_key:
        raise HTTPException(
            status_code=401,
            detail="API Key required. Please provide X-API-Key header."
        )
    return x_api_key


async def verify_api_key(api_key: str = Depends(get_api_key_header)) -> APIKey:
    """
    验证API Key并返回Key信息
    
    检查：
    1. API Key是否存在
    2. 是否激活
    3. 是否过期
    """
    # 从数据库获取Key信息
    key_record = await get_api_key_by_key(api_key)
    
    if not key_record:
        raise HTTPException(status_code=401, detail="Invalid API Key")
    
    if not key_record.is_active:
        raise HTTPException(status_code=403, detail="API Key is not active")
    
    # 检查是否过期
    if key_record.expires_at and key_record.expires_at < datetime.now():
        raise HTTPException(status_code=403, detail="API Key has expired")
    
    # 检查是否需要重置每日查询次数
    today = date.today()
    if key_record.last_reset_date != today:
        # 重置每日查询次数
        from database import reset_daily_queries_for_key
        await reset_daily_queries_for_key(api_key)
        # 重新获取更新后的记录
        key_record = await get_api_key_by_key(api_key)
    
    # 转换为APIKey模型
    return APIKey(
        id=key_record.id,
        api_key=key_record.api_key,
        plan=key_record.plan,
        created_at=key_record.created_at,
        expires_at=key_record.expires_at,
        total_queries=key_record.total_queries,
        daily_queries=key_record.daily_queries,
        daily_limit=key_record.daily_limit,
        last_reset_date=key_record.last_reset_date,
        is_active=key_record.is_active
    )


async def check_search_limit(key_info: APIKey = Depends(verify_api_key)) -> APIKey:
    """
    检查搜索次数限制
    
    检查：
    1. 每日查询限制
    2. 如果达到限制，抛出429错误
    """
    # 检查每日限制（-1表示无限）
    if key_info.daily_limit > 0 and key_info.daily_queries >= key_info.daily_limit:
        raise HTTPException(
            status_code=429,
            detail=f"Daily search limit exceeded. Limit: {key_info.daily_limit}/day. "
                   f"Used: {key_info.daily_queries}. Reset at midnight."
        )
    
    return key_info

