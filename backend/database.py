"""
数据库操作模块
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy import Column, Integer, String, Text, DateTime, Date, Boolean, Index
from datetime import datetime, date
from typing import Optional
import json

from config import DATABASE_URL

Base = declarative_base()

# ==================== 数据库表定义 ====================
class APIKeyTable(Base):
    """API Key表"""
    __tablename__ = "api_keys"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    api_key = Column(String(100), unique=True, nullable=False, index=True)
    plan = Column(String(20), nullable=False, default="free")
    created_at = Column(DateTime, nullable=False, default=datetime.now)
    expires_at = Column(DateTime, nullable=True)
    total_queries = Column(Integer, default=0)
    daily_queries = Column(Integer, default=0)
    daily_limit = Column(Integer, default=50)
    last_reset_date = Column(Date, nullable=True, index=True)
    is_active = Column(Boolean, default=True)


class PublicQuestionTable(Base):
    """公共答案库表"""
    __tablename__ = "public_questions"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    question_id = Column(String(200), nullable=False, index=True)
    platform = Column(String(50), nullable=False, index=True)
    type = Column(String(10), nullable=False)
    question_content = Column(Text, nullable=False)
    answer = Column(Text, nullable=True)
    solution = Column(Text, nullable=True)
    options = Column(Text, nullable=True)  # JSON字符串
    source = Column(String(20), default="system")
    created_at = Column(DateTime, default=datetime.now)
    
    __table_args__ = (
        Index('idx_question_platform', 'question_id', 'platform', unique=True),
    )


class APIKeyQuestionTable(Base):
    """API Key贡献库表"""
    __tablename__ = "api_key_questions"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    api_key = Column(String(100), nullable=False, index=True)
    question_id = Column(String(200), nullable=False, index=True)
    platform = Column(String(50), nullable=False, index=True)
    type = Column(String(10), nullable=False)
    question_content = Column(Text, nullable=False)
    answer = Column(Text, nullable=True)
    solution = Column(Text, nullable=True)
    options = Column(Text, nullable=True)  # JSON字符串
    created_at = Column(DateTime, default=datetime.now)
    
    __table_args__ = (
        Index('idx_api_key_question', 'api_key', 'question_id', 'platform', unique=True),
    )


class SearchLogTable(Base):
    """搜索记录表"""
    __tablename__ = "search_logs"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    api_key = Column(String(100), nullable=False, index=True)
    question_id = Column(String(200), nullable=True)
    platform = Column(String(50), nullable=True)
    search_date = Column(Date, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.now)
    
    __table_args__ = (
        Index('idx_api_key_date', 'api_key', 'search_date'),
    )


# ==================== 数据库引擎和会话 ====================
engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    future=True
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False
)


# ==================== 数据库初始化 ====================
async def init_db():
    """初始化数据库，创建所有表"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("数据库表创建完成")


# ==================== 获取数据库会话 ====================
async def get_db():
    """获取数据库会话"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ==================== API Key操作 ====================
async def get_api_key_by_key(api_key: str) -> Optional[APIKeyTable]:
    """根据API Key获取记录"""
    from sqlalchemy import select
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(APIKeyTable).where(APIKeyTable.api_key == api_key)
        )
        return result.scalar_one_or_none()


async def create_api_key(key_data: dict) -> APIKeyTable:
    """创建新的API Key"""
    async with AsyncSessionLocal() as session:
        key_obj = APIKeyTable(**key_data)
        session.add(key_obj)
        await session.commit()
        await session.refresh(key_obj)
        return key_obj


async def update_query_count(api_key: str, count: int = 1):
    """更新查询次数"""
    from sqlalchemy import update
    async with AsyncSessionLocal() as session:
        await session.execute(
            update(APIKeyTable)
            .where(APIKeyTable.api_key == api_key)
            .values(
                daily_queries=APIKeyTable.daily_queries + count,
                total_queries=APIKeyTable.total_queries + count
            )
        )
        await session.commit()


async def reset_daily_queries_for_all():
    """重置所有API Key的每日查询次数"""
    from sqlalchemy import update, or_
    today = date.today()
    async with AsyncSessionLocal() as session:
        await session.execute(
            update(APIKeyTable)
            .where(
                or_(
                    APIKeyTable.last_reset_date.is_(None),
                    APIKeyTable.last_reset_date < today
                )
            )
            .values(daily_queries=0, last_reset_date=today)
        )
        await session.commit()


async def reset_daily_queries_for_key(api_key: str):
    """重置指定API Key的每日查询次数"""
    from sqlalchemy import update
    today = date.today()
    async with AsyncSessionLocal() as session:
        await session.execute(
            update(APIKeyTable)
            .where(APIKeyTable.api_key == api_key)
            .values(daily_queries=0, last_reset_date=today)
        )
        await session.commit()

