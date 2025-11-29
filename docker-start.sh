#!/bin/bash
# Docker快速启动脚本

echo "=========================================="
echo "  传智播客API服务 - Docker部署"
echo "=========================================="

# 检查Docker是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ Docker未安装，请先安装Docker"
    exit 1
fi

# 检查Docker Compose是否安装
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose未安装，请先安装Docker Compose"
    exit 1
fi

# 创建数据目录
mkdir -p backend/data
mkdir -p backend/logs

# 检查.env文件
if [ ! -f .env ]; then
    echo "⚠️  未找到.env文件，使用默认配置"
    echo "   建议创建.env文件并配置API密钥"
fi

# 构建并启动
echo ""
echo "🚀 开始构建并启动服务..."
docker-compose up -d --build

# 等待服务启动
echo ""
echo "⏳ 等待服务启动（10秒）..."
sleep 10

# 检查服务状态
echo ""
echo "📊 服务状态："
docker-compose ps

# 测试健康检查
echo ""
echo "🏥 测试健康检查..."
if curl -s http://localhost:8000/api/health > /dev/null; then
    echo "✅ 服务运行正常！"
    echo ""
    echo "📍 API地址: http://localhost:8000"
    echo "📖 API文档: http://localhost:8000/docs"
    echo "🏥 健康检查: http://localhost:8000/api/health"
else
    echo "⚠️  健康检查失败，请查看日志："
    echo "   docker-compose logs -f czbk-api"
fi

echo ""
echo "📝 常用命令："
echo "   查看日志: docker-compose logs -f czbk-api"
echo "   停止服务: docker-compose down"
echo "   重启服务: docker-compose restart"
echo "   查看状态: docker-compose ps"

