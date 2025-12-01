@echo off
REM Docker开发环境管理脚本

echo ================================
echo 懒羊羊题库 - Docker管理
echo ================================
echo.

if "%1"=="" goto usage
if "%1"=="start" goto start
if "%1"=="stop" goto stop
if "%1"=="restart" goto restart
if "%1"=="logs" goto logs
if "%1"=="status" goto status
if "%1"=="clean" goto clean
if "%1"=="rebuild" goto rebuild
if "%1"=="shell" goto shell
goto usage

:start
echo [启动] 启动Docker服务...
docker-compose -f docker-compose.dev.yml up -d
echo.
echo ================================
echo ✅ Docker服务已启动
echo ================================
echo.
echo 后端API: http://localhost:8000
echo   - API文档: http://localhost:8000/docs
echo   - 健康检查: http://localhost:8000/health
echo.
echo PostgreSQL: localhost:5432
echo   - 用户: lazy_user
echo   - 密码: lazy_password
echo   - 数据库: lazy_sheep
echo.
echo Redis: localhost:6379 (本地)
echo.
echo 查看日志: docker-dev.bat logs
echo 停止服务: docker-dev.bat stop
echo ================================
goto end

:stop
echo [停止] 停止Docker服务...
docker-compose -f docker-compose.dev.yml down
echo ✅ 服务已停止
goto end

:restart
echo [重启] 重启Docker服务...
docker-compose -f docker-compose.dev.yml restart
echo ✅ 服务已重启
goto end

:logs
echo [日志] 查看服务日志（Ctrl+C退出）...
echo.
docker-compose -f docker-compose.dev.yml logs -f
goto end

:status
echo [状态] 检查服务状态...
echo.
docker-compose -f docker-compose.dev.yml ps
goto end

:clean
echo [清理] 清理所有数据（危险操作！）
echo.
set /p confirm="确认删除所有数据？(yes/no): "
if /i "%confirm%"=="yes" (
    docker-compose -f docker-compose.dev.yml down -v
    echo ✅ 数据已清理
) else (
    echo ❌ 取消清理
)
goto end

:rebuild
echo [重建] 重建后端容器（修改依赖后使用）...
docker-compose -f docker-compose.dev.yml build --no-cache backend
docker-compose -f docker-compose.dev.yml up -d backend
echo ✅ 后端容器已重建
goto end

:shell
echo [Shell] 进入后端容器...
docker exec -it lazy-sheep-backend /bin/bash
goto end

:usage
echo 用法: docker-dev.bat [命令]
echo.
echo 可用命令:
echo   start    - 启动Docker服务
echo   stop     - 停止Docker服务
echo   restart  - 重启Docker服务（重启容器）
echo   rebuild  - 重建后端容器（修改依赖后使用）
echo   logs     - 查看服务日志
echo   status   - 查看服务状态
echo   shell    - 进入后端容器Shell
echo   clean    - 清理所有数据
echo.
echo 示例:
echo   docker-dev.bat start        # 启动所有服务
echo   docker-dev.bat logs         # 查看日志
echo   docker-dev.bat shell        # 进入容器调试
echo   docker-dev.bat rebuild      # 修改requirements.txt后重建
goto end

:end
