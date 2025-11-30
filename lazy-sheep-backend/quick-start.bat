@echo off
echo ================================
echo Quick Start - Lazy Sheep API
echo ================================
echo.

REM Create .env if not exists
if not exist ".env" (
    copy .env.example .env
    echo [!] Please edit .env and add your DeepSeek API Key
    notepad .env
    pause
)

REM Create data directory
if not exist "data" mkdir data

REM Install and run directly (no venv needed if Python packages are global)
echo [*] Installing dependencies...
pip install loguru fastapi uvicorn sqlalchemy aiosqlite redis httpx python-dotenv pydantic pydantic-settings openai

echo.
echo [*] Starting server...
echo [*] API Docs: http://localhost:8000/docs
echo [*] Press Ctrl+C to stop
echo.

REM 设置Python路径，确保优先使用项目目录
set PYTHONPATH=%CD%;%PYTHONPATH%
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
