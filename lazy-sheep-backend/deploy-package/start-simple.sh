#!/bin/bash
# 简单启动脚本 - 直接使用Python启动

# 进入项目目录
cd /www/wwwroot/deploy-package

# 创建必要的目录
mkdir -p data

# 使用宝塔的Python直接运行
exec python3 run.py
