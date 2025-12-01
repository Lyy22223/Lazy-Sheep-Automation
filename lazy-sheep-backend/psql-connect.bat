@echo off
REM 快速连接PostgreSQL命令行

echo ================================
echo 连接PostgreSQL数据库
echo ================================
echo.
echo 数据库: lazy_sheep
echo 用户: lazy_user
echo.
echo 常用命令:
echo   \dt         - 查看所有表
echo   \d questions - 查看questions表结构
echo   \q          - 退出
echo.
echo ================================
echo.

docker exec -it lazy-sheep-postgres psql -U lazy_user -d lazy_sheep
