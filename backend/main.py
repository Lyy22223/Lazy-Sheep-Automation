"""
传智播客答题API服务
FastAPI后端实现
"""
import sys
import io
# 设置标准输出编码为UTF-8，避免乱码
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
if sys.stderr.encoding != 'utf-8':
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import Optional, List
from datetime import datetime, date
import uvicorn
import logging

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

from models import APIKey, SearchRequest, SearchResponse, AIAnswerRequest, AIAnswerResponse, AIModel
from database import init_db, get_db, update_query_count
from auth import verify_api_key, verify_api_key_optional, check_search_limit
from search import search_answer, batch_search_answer, get_answer_stats
from ai_service import ai_answer_question
from admin import generate_api_key, reset_daily_queries
from contextlib import asynccontextmanager

# 初始化数据库和启动任务
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时执行
    await init_db()
    logger.info("数据库初始化完成")
    
    # 启动定时任务
    try:
        from scheduler import start_scheduler
        await start_scheduler()
    except Exception as e:
        logger.error(f"启动定时任务失败: {e}")
    
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


@app.get("/api/key/status")
async def get_key_status(key_info: APIKey = Depends(verify_api_key)):
    """查询API Key状态（兼容接口）"""
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
        logger.error(f"搜索失败: {str(e)}", exc_info=True)
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
        logger.error(f"批量搜索失败: {str(e)}", exc_info=True)
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
        logger.info(f"收到AI答题请求: API Key={key_info.api_key[:10]}..., question_type={request.type}, model={request.model}")
        logger.info(f"题目内容: {request.questionContent[:100]}...")
        
        # 检查AI功能是否启用
        if not key_info.is_active:
            logger.warning(f"API Key未激活: {key_info.api_key[:10]}...")
            raise HTTPException(status_code=403, detail="API Key未激活")
        
        result = await ai_answer_question(
            question=request.questionContent,
            question_type=request.type,
            options=request.options,
            platform=request.platform or "czbk",
            model=request.model  # 传递模型参数
        )
        
        logger.info(f"AI答题成功: answer={result.get('answer')}")
        
        # 更新查询次数
        await increment_query_count(key_info.api_key)
        
        return {
            "code": 1,
            "message": "AI答题完成",
            "data": result
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI答题失败: {str(e)}", exc_info=True)
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
        
        # res.json 格式默认只保存正确答案（correct: true）
        # 检查是否是 res.json 格式
        is_res_json = ("resultObject" in data and isinstance(data.get("resultObject"), dict) and 
                      ("code" in data or "errorMessage" in data)) or \
                     ("res" in data and isinstance(data.get("res"), dict))
        
        # res.json 格式：传递 None 让 process_upload_data 自动判断（res.json 默认只保存正确答案）
        # 其他格式：传递 False（保存所有题目）
        only_correct = None if is_res_json else False
        
        logger.info(f"上传题库数据: is_res_json={is_res_json}, only_correct={only_correct}")
        result = await process_upload_data(data, key_info.api_key, only_correct=only_correct)
        
        return {
            "code": 1,
            "message": "题库上传成功",
            "data": result
        }
    except Exception as e:
        logger.error(f"上传失败: {str(e)}", exc_info=True)
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
        logger.error(f"获取统计失败: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取统计失败: {str(e)}")


# ==================== 模型列表接口 ====================
@app.get("/api/models")
async def get_models(key_info: Optional[APIKey] = Depends(verify_api_key_optional)):
    """
    获取可用的AI模型列表
    
    支持：
    - 需要API Key认证（如果配置了认证）
    - 返回后端配置的可用模型列表
    """
    try:
        from config import (
            AI_PROVIDER, AI_BASE_URL, AI_MODEL,
            DEEPSEEK_BASE_URL, DEEPSEEK_MODEL,
            OPENAI_BASE_URL, OPENAI_MODEL
        )
        
        models = []
        
        # 根据配置生成模型列表
        # DeepSeek模型
        if DEEPSEEK_BASE_URL or AI_PROVIDER.lower() == "deepseek":
            base_url = AI_BASE_URL or DEEPSEEK_BASE_URL or "https://api.deepseek.com/v1"
            
            # DeepSeek V3.2-Exp 快速模式
            models.append({
                "id": "deepseek-chat",
                "name": "DeepSeek V3.2-Exp (快速模式)",
                "provider": "DeepSeek",
                "description": "DeepSeek-V3.2-Exp 非思考模式，快速响应，适合快速答题和常规题目",
                "baseUrl": base_url,
                "features": ["快速响应", "中文支持好", "性价比高", "适合快速答题"],
                "temperature": 0.3,
                "maxTokens": 2000
            })
            
            # DeepSeek V3.2-Exp 思考模式
            models.append({
                "id": "deepseek-reasoner",
                "name": "DeepSeek V3.2-Exp (思考模式)",
                "provider": "DeepSeek",
                "description": "DeepSeek-V3.2-Exp 思考模式，深度推理，适合复杂逻辑题和需要深度思考的题目",
                "baseUrl": base_url,
                "features": ["深度推理", "逻辑思维强", "错误率低", "适合复杂题"],
                "temperature": 0.3,
                "maxTokens": 2000
            })
        
        # OpenAI模型（如果配置了）
        if OPENAI_BASE_URL or AI_PROVIDER.lower() == "openai":
            base_url = AI_BASE_URL or OPENAI_BASE_URL or "https://api.openai.com/v1"
            model_name = AI_MODEL or OPENAI_MODEL or "gpt-3.5-turbo"
            
            models.append({
                "id": model_name,
                "name": f"OpenAI {model_name}",
                "provider": "OpenAI",
                "description": f"OpenAI {model_name} 模型，通用AI答题",
                "baseUrl": base_url,
                "features": ["通用性强", "多语言支持", "适合各种题型"],
                "temperature": 0.3,
                "maxTokens": 2000
            })
        
        # 如果没有配置任何模型，返回默认的DeepSeek模型（即使没有配置API Key也可以返回模型列表）
        if not models:
            models.append({
                "id": "deepseek-chat",
                "name": "DeepSeek V3.2-Exp (快速模式)",
                "provider": "DeepSeek",
                "description": "DeepSeek-V3.2-Exp 非思考模式，快速响应，适合快速答题和常规题目",
                "baseUrl": "https://api.deepseek.com/v1",
                "features": ["快速响应", "中文支持好", "性价比高", "适合快速答题"],
                "temperature": 0.3,
                "maxTokens": 2000
            })
            
            models.append({
                "id": "deepseek-reasoner",
                "name": "DeepSeek V3.2-Exp (思考模式)",
                "provider": "DeepSeek",
                "description": "DeepSeek-V3.2-Exp 思考模式，深度推理，适合复杂逻辑题和需要深度思考的题目",
                "baseUrl": "https://api.deepseek.com/v1",
                "features": ["深度推理", "逻辑思维强", "错误率低", "适合复杂题"],
                "temperature": 0.3,
                "maxTokens": 2000
            })
        
        return {
            "code": 1,
            "message": "success",
            "data": models
        }
    except Exception as e:
        logger.error(f"获取模型列表失败: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取模型列表失败: {str(e)}")


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
        logger.error(f"生成API Key失败: {str(e)}", exc_info=True)
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
        logger.error(f"重置失败: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"重置失败: {str(e)}")


# ==================== 错误处理 ====================
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    logger.warning(f"HTTP异常: {exc.status_code} - {exc.detail}")
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
    logger.error(f"未处理的异常: {str(exc)}", exc_info=True)
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

