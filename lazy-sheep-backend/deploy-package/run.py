#!/usr/bin/env python
"""
懒羊羊后端启动脚本
解决site-packages中的app包命名冲突问题
"""
import sys
import os

# 确保当前目录在sys.path最前面
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

if __name__ == "__main__":
    import uvicorn
    from api.config import get_settings
    
    settings = get_settings()
    
    uvicorn.run(
        "api.main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=True
    )
