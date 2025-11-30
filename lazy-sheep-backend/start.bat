@echo off
chcp 65001 >nul
echo ================================
echo Lazy Sheep API - Start Script
echo ================================

REM Check virtual environment
if not exist "venv" (
    echo [1/5] Creating virtual environment...
    python -m venv venv
)

REM Activate virtual environment
echo [2/5] Activating virtual environment...
call venv\Scripts\activate.bat

REM Install dependencies
echo [3/5] Installing dependencies...
pip install -q -r requirements.txt

REM Check .env file
if not exist ".env" (
    echo [!] .env file not found, copying example...
    copy .env.example .env
    echo [!] Please edit .env file and add your DeepSeek API Key
    pause
    exit
)

REM Create data directory
if not exist "data" mkdir data

REM Start service
echo [4/5] Starting service...
echo [5/5] Server running on http://localhost:8000
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
