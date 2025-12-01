#!/bin/bash
# Gunicorn启动脚本 - 宝塔面板版本

# 进入项目目录
cd /www/wwwroot/deploy-package

# 创建必要的目录
mkdir -p data

# 多线程启动（根据CPU核心数自动调整）
# 使用宝塔的Python环境，如果有虚拟环境则激活
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# 启动Gunicorn（多线程模式）
exec gunicorn api.main:app \
    --bind 0.0.0.0:8000 \
    --workers 4 \
    --worker-class uvicorn.workers.UvicornWorker \
    --threads 2 \
    --timeout 120 \
    --access-logfile data/gunicorn_access.log \
    --error-logfile data/gunicorn_error.log \
    --log-level info
