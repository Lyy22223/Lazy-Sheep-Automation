"""
定时任务模块
用于每日重置查询次数等定时任务
"""
import asyncio
from datetime import datetime, time
from database import reset_daily_queries_for_all


async def reset_daily_queries_task():
    """每日重置查询次数的定时任务"""
    while True:
        try:
            # 计算到明天0点的等待时间
            now = datetime.now()
            tomorrow = now.replace(hour=0, minute=0, second=0, microsecond=0)
            tomorrow = tomorrow.replace(day=tomorrow.day + 1)
            
            wait_seconds = (tomorrow - now).total_seconds()
            
            print(f"等待 {wait_seconds/3600:.2f} 小时后重置查询次数...")
            await asyncio.sleep(wait_seconds)
            
            # 执行重置
            await reset_daily_queries_for_all()
            print(f"[{datetime.now()}] 已重置所有API Key的每日查询次数")
            
        except Exception as e:
            print(f"重置查询次数任务出错: {e}")
            # 出错后等待1小时再重试
            await asyncio.sleep(3600)


async def start_scheduler():
    """启动定时任务"""
    # 启动重置查询次数任务
    asyncio.create_task(reset_daily_queries_task())
    print("定时任务已启动")

