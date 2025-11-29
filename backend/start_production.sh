#!/bin/bash
# 生产环境启动脚本（使用 Gunicorn + Uvicorn Workers）

# 1核1GB服务器推荐配置：2 workers
# 2核2GB服务器推荐配置：4 workers
# 4核4GB服务器推荐配置：8 workers

WORKERS=${WORKERS:-2}  # 默认2个worker（适合1核CPU）
HOST=${HOST:-0.0.0.0}
PORT=${PORT:-8000}
TIMEOUT=${TIMEOUT:-120}

echo "启动生产环境服务器..."
echo "Workers: $WORKERS"
echo "Host: $HOST"
echo "Port: $PORT"
echo "Timeout: $TIMEOUT"

gunicorn main:app \
    -w $WORKERS \
    -k uvicorn.workers.UvicornWorker \
    --bind $HOST:$PORT \
    --timeout $TIMEOUT \
    --max-requests 1000 \
    --max-requests-jitter 100 \
    --access-logfile - \
    --error-logfile - \
    --log-level info

