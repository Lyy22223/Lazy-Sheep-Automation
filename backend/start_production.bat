@echo off
REM Windows生产环境启动脚本（使用 Gunicorn + Uvicorn Workers）

REM 1核1GB服务器推荐配置：2 workers
REM 2核2GB服务器推荐配置：4 workers
REM 4核4GB服务器推荐配置：8 workers

set WORKERS=2
set HOST=0.0.0.0
set PORT=8000
set TIMEOUT=120

echo 启动生产环境服务器...
echo Workers: %WORKERS%
echo Host: %HOST%
echo Port: %PORT%
echo Timeout: %TIMEOUT%

gunicorn main:app -w %WORKERS% -k uvicorn.workers.UvicornWorker --bind %HOST%:%PORT% --timeout %TIMEOUT% --max-requests 1000 --max-requests-jitter 100 --access-logfile - --error-logfile - --log-level info

