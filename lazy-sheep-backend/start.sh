#!/bin/bash

echo "🐑 懒羊羊题库API - 启动脚本"
echo "=============================="

# 检查虚拟环境
if [ ! -d "venv" ]; then
    echo "📦 创建虚拟环境..."
    python -m venv venv
fi

# 激活虚拟环境
echo "🔧 激活虚拟环境..."
source venv/bin/activate

# 安装依赖
echo "📥 安装依赖..."
pip install -q -r requirements.txt

# 检查.env文件
if [ ! -f ".env" ]; then
    echo "⚠️ 未找到.env文件，复制示例配置..."
    cp .env.example .env
    echo "❗ 请编辑.env文件，填入你的DeepSeek API Key"
    exit 1
fi

# 创建数据目录
mkdir -p data

# 启动服务
echo "🚀 启动服务..."
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
