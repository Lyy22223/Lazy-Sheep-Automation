# 使用Python 3.11 slim镜像（轻量级）
FROM python:3.11-slim

# 设置工作目录
WORKDIR /app

# 设置环境变量
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# 安装系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件
COPY requirements.txt .

# 安装Python依赖
RUN pip install --no-cache-dir -r requirements.txt

# 复制应用代码
COPY . .

# 创建数据目录（用于持久化数据库）
RUN mkdir -p /app/data

# 暴露端口
EXPOSE 8000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

# 启动命令（使用Gunicorn + Uvicorn Workers）
# 默认2个workers（适合1核CPU），可通过环境变量WORKERS调整
CMD ["sh", "-c", "gunicorn main:app -w ${WORKERS:-2} -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000 --timeout 120 --max-requests 1000 --max-requests-jitter 100 --access-logfile - --error-logfile - --log-level info"]

