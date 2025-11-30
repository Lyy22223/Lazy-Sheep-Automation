"""
懒羊羊题库API - 主入口
"""
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from loguru import logger
import sys

from api.config import get_settings
from api.database import init_db
from api.routes import search, ai, upload

settings = get_settings()

# 配置日志
logger.remove()
logger.add(sys.stderr, level=settings.log_level)
logger.add(
    settings.log_file,
    rotation="10 MB",
    retention="7 days",
    level=settings.log_level
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时
    logger.info("🚀 启动应用...")
    await init_db()
    logger.info("✅ 数据库初始化完成")
    yield
    # 关闭时
    logger.info("👋 关闭应用...")


# 创建FastAPI应用
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="多平台自动答题系统后端API",
    lifespan=lifespan
)

# 跨域配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应限制具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# API Key认证中间件
@app.middleware("http")
async def verify_api_key(request: Request, call_next):
    """验证API Key"""
    # 健康检查接口不需要验证
    if request.url.path in ["/", "/health", "/docs", "/openapi.json"]:
        return await call_next(request)
    
    # 如果不需要验证，直接通过
    if not settings.api_key_required:
        return await call_next(request)
    
    # 验证API Key
    api_key = request.headers.get("X-API-Key")
    if not api_key or api_key != settings.admin_api_key:
        return JSONResponse(
            status_code=401,
            content={"error": "Invalid API Key"}
        )
    
    return await call_next(request)


# 注册路由
app.include_router(search.router)
app.include_router(ai.router)
app.include_router(upload.router)


@app.get("/")
async def root():
    """根路径"""
    return {
        "message": f"{settings.app_name} v{settings.app_version}",
        "status": "running",
        "docs": "/docs"
    }


@app.get("/health")
async def health():
    """健康检查"""
    return {"status": "healthy"}


# 全局异常处理
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全局异常处理"""
    logger.error(f"Unhandled error: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)}
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=settings.debug
    )
