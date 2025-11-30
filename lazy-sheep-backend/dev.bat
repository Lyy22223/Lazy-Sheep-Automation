@echo off
REM 本地开发启动脚本

echo ================================
echo 懒羊羊题库 - 本地开发环境
echo ================================
echo.

REM 检查Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未安装Python或未添加到PATH
    pause
    exit /b 1
)

REM 检查虚拟环境
if not exist "venv" (
    echo [1/4] 创建虚拟环境...
    python -m venv venv
)

REM 激活虚拟环境
echo [2/4] 激活虚拟环境...
call venv\Scripts\activate.bat

REM 安装依赖
echo [3/4] 安装依赖...
pip install -q -r requirements.txt

REM 创建数据目录
if not exist "data" mkdir data

REM 启动服务
echo [4/4] 启动开发服务器...
echo.
echo ================================
echo ✅ 服务已启动
echo ================================
echo.
echo API地址: http://localhost:8000
echo API文档: http://localhost:8000/docs
echo 健康检查: http://localhost:8000/health
echo.
echo 按 Ctrl+C 停止服务
echo ================================
echo.

python run.py
