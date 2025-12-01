#!/usr/bin/env python3
"""
API密钥管理工具
用于创建、查看、删除用户脚本使用的API密钥
"""
import asyncio
import sys
import secrets
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from api.database import engine, Base, init_db
from api.models.api_key import APIKey


async def create_key(user_id: str, name: str, days: int = 365, daily_quota: int = 10000, monthly_quota: int = 100000):
    """创建API密钥"""
    
    # 生成随机密钥
    api_key = f"sk-{secrets.token_urlsafe(32)}"
    
    # 创建数据库会话
    async with AsyncSession(engine) as session:
        # 创建密钥记录
        key_record = APIKey(
            key=api_key,
            user_id=user_id,
            name=name,
            usage_count=0,
            quota_daily=daily_quota,
            quota_monthly=monthly_quota,
            is_active=True,
            expire_at=datetime.now() + timedelta(days=days)
        )
        
        session.add(key_record)
        await session.commit()
        await session.refresh(key_record)
        
        print("=" * 80)
        print("✅ API密钥创建成功！")
        print("=" * 80)
        print()
        print(f"🔑 API密钥: {api_key}")
        print(f"👤 用户ID: {user_id}")
        print(f"📝 名称: {name}")
        print(f"📊 每日配额: {daily_quota:,} 次")
        print(f"📊 每月配额: {monthly_quota:,} 次")
        print(f"⏰ 过期时间: {key_record.expire_at.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"⏰ 有效期: {days} 天")
        print()
        print("=" * 80)
        print("📖 使用方法")
        print("=" * 80)
        print()
        print("1️⃣ 在用户脚本设置中配置：")
        print(f"   API密钥: {api_key}")
        print(f"   API地址: http://your-server-ip:8000")
        print()
        print("2️⃣ 测试API连接（命令行）：")
        print(f'   curl -X POST http://localhost:8000/api/search \\')
        print(f'     -H "X-API-Key: {api_key}" \\')
        print(f'     -H "Content-Type: application/json" \\')
        print(f'     -d \'{{"questionContent":"测试","type":"0","platform":"czbk"}}\'')
        print()
        print("3️⃣ 访问API文档测试：")
        print("   http://your-server-ip:8000/docs")
        print(f"   点击右上角 Authorize，输入: {api_key}")
        print()
        print("⚠️  请妥善保管此密钥，它不会再次显示！")
        print("=" * 80)
        print()
        
        return api_key


async def list_keys():
    """列出所有API密钥"""
    async with AsyncSession(engine) as session:
        result = await session.execute(select(APIKey))
        keys = result.scalars().all()
        
        if not keys:
            print("❌ 没有找到任何API密钥")
            return
        
        print("=" * 100)
        print("📋 API密钥列表")
        print("=" * 100)
        print()
        print(f"{'用户ID':<20} {'名称':<20} {'使用次数':<10} {'状态':<8} {'过期时间':<20}")
        print("-" * 100)
        
        for key in keys:
            status = "✅ 激活" if key.is_active else "❌ 停用"
            expire = key.expire_at.strftime('%Y-%m-%d %H:%M:%S') if key.expire_at else "永久"
            print(f"{key.user_id:<20} {key.name:<20} {key.usage_count:<10} {status:<8} {expire:<20}")
        
        print()
        print(f"总计: {len(keys)} 个密钥")
        print("=" * 100)


async def delete_key(user_id: str):
    """删除指定用户的API密钥"""
    async with AsyncSession(engine) as session:
        result = await session.execute(
            select(APIKey).where(APIKey.user_id == user_id)
        )
        key = result.scalar_one_or_none()
        
        if not key:
            print(f"❌ 未找到用户 {user_id} 的密钥")
            return
        
        await session.delete(key)
        await session.commit()
        
        print(f"✅ 已删除用户 {user_id} 的密钥")


async def show_key(user_id: str):
    """显示指定用户的API密钥详情"""
    async with AsyncSession(engine) as session:
        result = await session.execute(
            select(APIKey).where(APIKey.user_id == user_id)
        )
        key = result.scalar_one_or_none()
        
        if not key:
            print(f"❌ 未找到用户 {user_id} 的密钥")
            return
        
        print("=" * 80)
        print(f"📋 API密钥详情 - {user_id}")
        print("=" * 80)
        print()
        print(f"🔑 API密钥: {key.key}")
        print(f"👤 用户ID: {key.user_id}")
        print(f"📝 名称: {key.name}")
        print(f"📊 使用次数: {key.usage_count}")
        print(f"📊 每日配额: {key.quota_daily:,} 次")
        print(f"📊 每月配额: {key.quota_monthly:,} 次")
        print(f"✅ 状态: {'激活' if key.is_active else '停用'}")
        print(f"⏰ 创建时间: {key.created_at.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"⏰ 过期时间: {key.expire_at.strftime('%Y-%m-%d %H:%M:%S') if key.expire_at else '永久'}")
        if key.last_used_at:
            print(f"⏰ 最后使用: {key.last_used_at.strftime('%Y-%m-%d %H:%M:%S')}")
        print()
        print("=" * 80)


async def main():
    """主函数"""
    
    # 初始化数据库
    await init_db()
    
    if len(sys.argv) < 2:
        print("=" * 80)
        print("🔧 API密钥管理工具")
        print("=" * 80)
        print()
        print("用法:")
        print()
        print("  创建密钥:")
        print("    python create_api_key.py create <用户ID> <名称> [有效天数] [每日配额] [每月配额]")
        print("    示例: python create_api_key.py create user001 \"测试用户\" 365 10000 100000")
        print()
        print("  列出所有密钥:")
        print("    python create_api_key.py list")
        print()
        print("  显示密钥详情:")
        print("    python create_api_key.py show <用户ID>")
        print("    示例: python create_api_key.py show user001")
        print()
        print("  删除密钥:")
        print("    python create_api_key.py delete <用户ID>")
        print("    示例: python create_api_key.py delete user001")
        print()
        print("=" * 80)
        return
    
    command = sys.argv[1]
    
    if command == "create":
        if len(sys.argv) < 4:
            print("❌ 用法: python create_api_key.py create <用户ID> <名称> [有效天数] [每日配额] [每月配额]")
            return
        
        user_id = sys.argv[2]
        name = sys.argv[3]
        days = int(sys.argv[4]) if len(sys.argv) > 4 else 365
        daily_quota = int(sys.argv[5]) if len(sys.argv) > 5 else 10000
        monthly_quota = int(sys.argv[6]) if len(sys.argv) > 6 else 100000
        
        await create_key(user_id, name, days, daily_quota, monthly_quota)
    
    elif command == "list":
        await list_keys()
    
    elif command == "show":
        if len(sys.argv) < 3:
            print("❌ 用法: python create_api_key.py show <用户ID>")
            return
        
        user_id = sys.argv[2]
        await show_key(user_id)
    
    elif command == "delete":
        if len(sys.argv) < 3:
            print("❌ 用法: python create_api_key.py delete <用户ID>")
            return
        
        user_id = sys.argv[2]
        confirm = input(f"⚠️  确认删除用户 {user_id} 的密钥？(yes/no): ")
        if confirm.lower() == "yes":
            await delete_key(user_id)
        else:
            print("❌ 已取消")
    
    else:
        print(f"❌ 未知命令: {command}")
        print("可用命令: create, list, show, delete")


if __name__ == "__main__":
    asyncio.run(main())
