"""
创建测试API密钥
"""
import asyncio
import secrets
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from api.database import engine, Base
from api.models.api_key import APIKey


async def create_test_key():
    """创建测试API密钥"""
    
    # 生成随机密钥
    test_key = f"sk-test-{secrets.token_urlsafe(32)}"
    
    # 创建数据库会话
    async with AsyncSession(engine) as session:
        # 创建测试密钥
        api_key = APIKey(
            key=test_key,
            user_id="test_user",
            name="测试密钥",
            usage_count=0,
            quota_daily=10000,  # 每日10000次
            quota_monthly=100000,  # 每月100000次
            is_active=True,
            expire_at=datetime.now() + timedelta(days=365)  # 1年后过期
        )
        
        session.add(api_key)
        await session.commit()
        await session.refresh(api_key)
        
        print("=" * 60)
        print("✅ 测试API密钥创建成功！")
        print("=" * 60)
        print()
        print(f"API密钥: {test_key}")
        print(f"用户ID: test_user")
        print(f"名称: 测试密钥")
        print(f"每日配额: 10,000 次")
        print(f"每月配额: 100,000 次")
        print(f"过期时间: {api_key.expire_at.strftime('%Y-%m-%d %H:%M:%S')}")
        print()
        print("=" * 60)
        print("使用方法：")
        print("=" * 60)
        print()
        print("1. 在请求头中添加：")
        print(f'   X-API-Key: {test_key}')
        print()
        print("2. 或在.env.local中配置：")
        print(f'   ADMIN_API_KEY={test_key}')
        print()
        print("3. 测试命令（PowerShell）：")
        print(f'   $headers = @{{"X-API-Key" = "{test_key}"}}')
        print('   Invoke-RestMethod -Uri http://localhost:8000/api/search -Method POST -Headers $headers -ContentType "application/json" -Body \'{"questionContent":"测试","type":"0","platform":"czbk"}\'')
        print()
        print("4. 或使用curl：")
        print(f'   curl -X POST http://localhost:8000/api/search \\')
        print(f'     -H "X-API-Key: {test_key}" \\')
        print('     -H "Content-Type: application/json" \\')
        print('     -d \'{"questionContent":"测试","type":"0","platform":"czbk"}\'')
        print()
        print("5. 访问API文档测试：")
        print("   http://localhost:8000/docs")
        print(f"   点击右上角 Authorize，输入: {test_key}")
        print()
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(create_test_key())
