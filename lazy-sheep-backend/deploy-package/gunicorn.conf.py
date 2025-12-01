# Gunicorn配置文件
# 用于宝塔面板或生产环境部署

import multiprocessing
import os

# 工作目录（宝塔面板路径）
chdir = '/www/wwwroot/deploy-package'

# 监听地址和端口
bind = '0.0.0.0:8000'

# Worker配置（多进程+多线程）
# workers: 推荐 CPU核心数 * 2 + 1
workers = multiprocessing.cpu_count() * 2 + 1

# 每个worker的线程数（多线程支持）
threads = 2

# 使用uvicorn的worker类（支持ASGI）
worker_class = 'uvicorn.workers.UvicornWorker'

# Worker连接数
worker_connections = 1000

# 超时时间（秒）
timeout = 120
keepalive = 5

# 日志配置
accesslog = './data/gunicorn_access.log'
errorlog = './data/gunicorn_error.log'
loglevel = 'info'

# 进程名称
proc_name = 'lazy-sheep-api'

# 优雅重启超时
graceful_timeout = 30

# Daemon模式（宝塔面板管理时设为False）
daemon = False

# 预加载应用（提升性能）
preload_app = True

# PID文件
pidfile = './data/gunicorn.pid'
