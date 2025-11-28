"""
管理员功能模块
"""
import secrets
from datetime import datetime, timedelta
from typing import Optional
from models import APIKey
from database import create_api_key, reset_daily_queries_for_all, reset_daily_queries_for_key, AsyncSessionLocal
from config import PLAN_LIMITS


def generate_api_key_string(plan: str, prefix: str = "czbk") -> str:
    """生成API Key字符串"""
    random_part = secrets.token_urlsafe(16)  # 22个字符
    api_key = f"{prefix}_{random_part}"
    return api_key


async def generate_api_key(plan: str, expires_days: Optional[int] = None) -> APIKey:
    """
    创建新的API Key
    
    Args:
        plan: 计划类型（free, standard, premium, pro）
        expires_days: 过期天数（可选）
    
    Returns:
        APIKey对象
    """
    api_key_str = generate_api_key_string(plan)
    
    expires_at = None
    if expires_days:
        expires_at = datetime.now() + timedelta(days=expires_days)
    
    daily_limit = PLAN_LIMITS.get(plan, 50)
    
    key_data = {
        "api_key": api_key_str,
        "plan": plan,
        "created_at": datetime.now(),
        "expires_at": expires_at,
        "total_queries": 0,
        "daily_queries": 0,
        "daily_limit": daily_limit,
        "last_reset_date": None,
        "is_active": True
    }
    
    key_record = await create_api_key(key_data)
    
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


async def reset_daily_queries(api_key: Optional[str] = None) -> dict:
    """
    重置每日查询次数
    
    Args:
        api_key: 如果提供，只重置该Key；否则重置所有Key
    
    Returns:
        重置结果统计
    """
    if api_key:
        await reset_daily_queries_for_key(api_key)
        return {
            "reset_count": 1,
            "api_key": api_key
        }
    else:
        await reset_daily_queries_for_all()
        # 统计重置的数量
        from database import APIKeyTable
        from sqlalchemy import select, func
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(func.count(APIKeyTable.id)))
            total = result.scalar() or 0
        return {
            "reset_count": total,
            "api_key": None
        }


async def get_api_key_info(api_key: str) -> Optional[APIKey]:
    """获取API Key信息"""
    from database import get_api_key_by_key
    key_record = await get_api_key_by_key(api_key)
    
    if not key_record:
        return None
    
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

