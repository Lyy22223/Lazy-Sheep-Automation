@echo off
REM Windows Docker快速启动脚本

echo ==========================================
echo   传智播客API服务 - Docker部署
echo ==========================================

REM 检查Docker是否安装
where docker >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Docker未安装，请先安装Docker Desktop
    exit /b 1
)

REM 检查Docker Compose是否安装
where docker-compose >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Docker Compose未安装，请先安装Docker Compose
    exit /b 1
)

REM 创建数据目录
if not exist "backend\data" mkdir backend\data
if not exist "backend\logs" mkdir backend\logs

REM 检查.env文件
if not exist ".env" (
    echo ⚠️  未找到.env文件，使用默认配置
    echo    建议创建.env文件并配置API密钥
)

REM 构建并启动
echo.
echo 🚀 开始构建并启动服务...
docker-compose up -d --build

REM 等待服务启动
echo.
echo ⏳ 等待服务启动（10秒）...
timeout /t 10 /nobreak >nul

REM 检查服务状态
echo.
echo 📊 服务状态：
docker-compose ps

REM 测试健康检查
echo.
echo 🏥 测试健康检查...
curl -s http://localhost:8000/api/health >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo ✅ 服务运行正常！
    echo.
    echo 📍 API地址: http://localhost:8000
    echo 📖 API文档: http://localhost:8000/docs
    echo 🏥 健康检查: http://localhost:8000/api/health
) else (
    echo ⚠️  健康检查失败，请查看日志：
    echo    docker-compose logs -f czbk-api
)

echo.
echo 📝 常用命令：
echo    查看日志: docker-compose logs -f czbk-api
echo    停止服务: docker-compose down
echo    重启服务: docker-compose restart
echo    查看状态: docker-compose ps

