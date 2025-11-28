"""
传智播客答题API服务
FastAPI后端实现
"""
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Optional, List
from datetime import datetime, date
import uvicorn

from models import APIKey, SearchRequest, SearchResponse, AIAnswerRequest, AIAnswerResponse
from database import init_db, get_db, update_query_count
from auth import verify_api_key, check_search_limit
from search import search_answer, batch_search_answer, get_answer_stats
from ai_service import ai_answer_question
from admin import generate_api_key, reset_daily_queries
from contextlib import asynccontextmanager

# 初始化数据库和启动任务
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时执行
    await init_db()
    print("数据库初始化完成")
    
    # 启动定时任务
    try:
        from scheduler import start_scheduler
        await start_scheduler()
    except Exception as e:
        print(f"启动定时任务失败: {e}")
    
    yield
    
    # 关闭时执行（如果需要）
    pass

app = FastAPI(
    title="传智播客答题API",
    description="提供题目答案查询和AI答题服务",
    version="1.0.0",
    lifespan=lifespan
)

# CORS中间件配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应限制具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== 健康检查 ====================
@app.get("/")
async def root():
    return {"message": "传智播客答题API服务", "version": "1.0.0", "status": "running"}


@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


# ==================== API Key信息查询 ====================
@app.get("/api/key/info")
async def get_key_info(key_info: APIKey = Depends(verify_api_key)):
    """查询API Key信息"""
    return {
        "code": 1,
        "message": "success",
        "data": {
            "api_key": key_info.api_key,
            "plan": key_info.plan,
            "daily_queries": key_info.daily_queries,
            "daily_limit": key_info.daily_limit,
            "total_queries": key_info.total_queries,
            "expires_at": key_info.expires_at.isoformat() if key_info.expires_at else None,
            "is_active": key_info.is_active,
            "created_at": key_info.created_at.isoformat()
        }
    }


# ==================== 搜索答案接口 ====================
@app.post("/api/search", response_model=SearchResponse)
async def search(
    request: SearchRequest,
    key_info: APIKey = Depends(check_search_limit)
):
    """
    搜索答案接口
    
    支持：
    - 精确匹配（questionId）
    - 模糊匹配（questionContent）
    - 相似度匹配
    """
    try:
        result = await search_answer(request, key_info.api_key)
        
        # 更新查询次数（无论是否找到都算一次查询）
        await increment_query_count(key_info.api_key)
        
        if result and result.get("found"):
            return {
                "code": 1,
                "message": "找到答案",
                "data": result
            }
        else:
            return {
                "code": 0,
                "message": "未找到匹配的答案",
                "data": None
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"搜索失败: {str(e)}")


# ==================== 批量搜索接口 ====================
@app.post("/api/search/batch")
async def batch_search(
    requests: List[SearchRequest],
    key_info: APIKey = Depends(check_search_limit)
):
    """批量搜索答案"""
    try:
        # 检查批量请求数量限制
        if len(requests) > 100:
            raise HTTPException(status_code=400, detail="批量请求最多100条")
        
        results = await batch_search_answer(requests, key_info.api_key)
        
        # 更新查询次数（按实际找到答案的数量）
        found_count = sum(1 for r in results if r.get("found"))
        if found_count > 0:
            await increment_query_count(key_info.api_key, count=found_count)
        
        return {
            "code": 1,
            "message": "批量搜索完成",
            "data": results,
            "statistics": {
                "total": len(requests),
                "found": found_count,
                "not_found": len(requests) - found_count
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"批量搜索失败: {str(e)}")


# ==================== AI答题接口 ====================
@app.post("/api/ai/answer", response_model=AIAnswerResponse)
async def ai_answer(
    request: AIAnswerRequest,
    key_info: APIKey = Depends(check_search_limit)
):
    """
    AI答题接口
    
    当本地答案库找不到答案时，使用AI生成答案
    """
    try:
        # 检查AI功能是否启用
        if not key_info.is_active:
            raise HTTPException(status_code=403, detail="API Key未激活")
        
        result = await ai_answer_question(
            question=request.questionContent,
            question_type=request.type,
            options=request.options,
            platform=request.platform or "czbk"
        )
        
        # 更新查询次数
        await increment_query_count(key_info.api_key)
        
        return {
            "code": 1,
            "message": "AI答题完成",
            "data": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI答题失败: {str(e)}")


# ==================== 上传题库接口 ====================
@app.post("/api/upload")
async def upload_questions(
    data: dict,
    key_info: APIKey = Depends(verify_api_key)
):
    """
    上传题库数据
    
    支持上传：
    - data.json格式（题目数据）
    - res.json格式（已答题数据）
    - answerRecords（答题记录）
    """
    try:
        from upload import process_upload_data
        
        result = await process_upload_data(data, key_info.api_key)
        
        return {
            "code": 1,
            "message": "题库上传成功",
            "data": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"上传失败: {str(e)}")


# ==================== 统计信息接口 ====================
@app.get("/api/stats")
async def get_stats(key_info: APIKey = Depends(verify_api_key)):
    """获取答案库统计信息"""
    try:
        from search import get_answer_stats
        
        stats = await get_answer_stats(key_info.api_key)
        
        return {
            "code": 1,
            "message": "success",
            "data": stats
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取统计失败: {str(e)}")


# ==================== 辅助函数 ====================
async def increment_query_count(api_key: str, count: int = 1):
    """增加查询次数"""
    await update_query_count(api_key, count)


# ==================== 管理员接口 ====================
@app.post("/api/admin/generate-key")
async def admin_generate_key(
    plan: str,
    expires_days: Optional[int] = None,
    admin_key: Optional[str] = Header(None, alias="X-Admin-Key")
):
    """
    生成新的API Key（管理员接口）
    
    需要在Header中提供X-Admin-Key
    """
    # 简单的管理员密钥验证（生产环境应使用更安全的方式）
    from config import ADMIN_KEY
    if admin_key != ADMIN_KEY:
        raise HTTPException(status_code=403, detail="无权限访问管理员接口")
    
    try:
        key_info = await generate_api_key(plan, expires_days)
        return {
            "code": 1,
            "message": "API Key生成成功",
            "data": {
                "api_key": key_info.api_key,
                "plan": key_info.plan,
                "daily_limit": key_info.daily_limit,
                "expires_at": key_info.expires_at.isoformat() if key_info.expires_at else None
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成API Key失败: {str(e)}")


@app.post("/api/admin/reset-daily-queries")
async def admin_reset_queries(
    api_key: Optional[str] = None,
    admin_key: Optional[str] = Header(None, alias="X-Admin-Key")
):
    """
    重置每日查询次数（管理员接口）
    
    如果不提供api_key，则重置所有Key
    """
    from config import ADMIN_KEY
    if admin_key != ADMIN_KEY:
        raise HTTPException(status_code=403, detail="无权限访问管理员接口")
    
    try:
        result = await reset_daily_queries(api_key)
        return {
            "code": 1,
            "message": "重置成功",
            "data": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"重置失败: {str(e)}")


# ==================== 错误处理 ====================
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "code": 0,
            "message": exc.detail,
            "data": None
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={
            "code": 0,
            "message": f"服务器内部错误: {str(exc)}",
            "data": None
        }
    )


# ==================== 启动服务 ====================
if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )

