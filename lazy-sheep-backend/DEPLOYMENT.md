# 🚀 后端部署文档

懒羊羊自动化平台后端服务部署指南

---

## 📋 环境要求

### 系统要求
- **操作系统**: Linux (Ubuntu 20.04+ / CentOS 7+) 或 Windows Server
- **Python**: 3.10 或更高版本
- **数据库**: MySQL 8.0+
- **缓存**: Redis 6.0+
- **内存**: 最低 2GB，推荐 4GB+
- **磁盘**: 最低 10GB 可用空间

### 外部服务
- **DeepSeek API**: 需要有效的 API Key
- **域名/IP**: 公网可访问的服务器地址

---

## 🛠️ 快速部署（Ubuntu/Debian）

### 1. 安装系统依赖

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装 Python 3.10+
sudo apt install python3.10 python3.10-venv python3-pip -y

# 安装 MySQL
sudo apt install mysql-server -y

# 安装 Redis
sudo apt install redis-server -y

# 启动服务
sudo systemctl start mysql
sudo systemctl start redis-server
sudo systemctl enable mysql
sudo systemctl enable redis-server
```

### 2. 配置 MySQL

```bash
# 登录 MySQL
sudo mysql

# 创建数据库和用户
CREATE DATABASE lazy_sheep DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'lazy_sheep'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON lazy_sheep.* TO 'lazy_sheep'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 3. 克隆并配置项目

```bash
# 克隆代码
cd /opt
git clone https://github.com/your-repo/lazy-sheep-backend.git
cd lazy-sheep-backend

# 创建虚拟环境
python3.10 -m venv venv
source venv/bin/activate

# 安装依赖
pip install --upgrade pip
pip install -r requirements.txt
```

### 4. 配置环境变量

```bash
# 复制配置模板
cp .env.example .env

# 编辑配置文件
vim .env
```

**`.env` 配置示例：**

```bash
# 数据库配置
DATABASE_URL=mysql+aiomysql://lazy_sheep:your_password@localhost:3306/lazy_sheep

# Redis配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0

# API密钥配置（生成新的安全密钥）
API_KEY_SECRET=your_secret_key_here

# DeepSeek API配置
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_API_BASE=https://api.deepseek.com/v1

# 服务器配置
HOST=0.0.0.0
PORT=8000
WORKERS=4

# 日志配置
LOG_LEVEL=INFO
LOG_FILE=/var/log/lazy-sheep/app.log

# CORS配置（允许前端跨域）
CORS_ORIGINS=*
```

### 5. 初始化数据库

```bash
# 运行数据库迁移
python init_db.py

# 创建默认API Key
python scripts/create_api_key.py --key sk-test-lazy-sheep-dev-2024 --name "测试密钥" --quota 10000
```

### 6. 启动服务

**方式一：直接运行（测试）**

```bash
# 激活虚拟环境
source /opt/lazy-sheep-backend/venv/bin/activate

# 启动服务
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

**方式二：使用 Systemd（生产推荐）**

创建服务文件：
```bash
sudo vim /etc/systemd/system/lazy-sheep.service
```

写入以下内容：
```ini
[Unit]
Description=Lazy Sheep Backend Service
After=network.target mysql.service redis.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/lazy-sheep-backend
Environment="PATH=/opt/lazy-sheep-backend/venv/bin"
EnvironmentFile=/opt/lazy-sheep-backend/.env
ExecStart=/opt/lazy-sheep-backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

启动服务：
```bash
# 重新加载配置
sudo systemctl daemon-reload

# 启动服务
sudo systemctl start lazy-sheep

# 设置开机自启
sudo systemctl enable lazy-sheep

# 查看状态
sudo systemctl status lazy-sheep

# 查看日志
sudo journalctl -u lazy-sheep -f
```

### 7. 配置 Nginx 反向代理（可选）

安装 Nginx：
```bash
sudo apt install nginx -y
```

创建配置文件：
```bash
sudo vim /etc/nginx/sites-available/lazy-sheep
```

写入以下内容：
```nginx
server {
    listen 80;
    server_name 39.104.15.174;  # 替换为你的域名或IP

    # 日志
    access_log /var/log/nginx/lazy-sheep-access.log;
    error_log /var/log/nginx/lazy-sheep-error.log;

    # 限流配置
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=20 nodelay;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # 超时设置
        proxy_connect_timeout 90s;
        proxy_send_timeout 90s;
        proxy_read_timeout 90s;
    }
}
```

启用配置：
```bash
# 创建软链接
sudo ln -s /etc/nginx/sites-available/lazy-sheep /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx
```

---

## 🔐 安全配置

### 1. 生成安全的API Key

```bash
# 生成随机密钥
python -c "import secrets; print('sk-' + secrets.token_urlsafe(32))"

# 添加到数据库
python scripts/create_api_key.py --key "sk-xxx" --name "生产密钥" --quota 100000
```

### 2. 配置防火墙

```bash
# 安装 UFW
sudo apt install ufw -y

# 允许必要端口
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS

# 启用防火墙
sudo ufw enable

# 检查状态
sudo ufw status
```

### 3. 配置 MySQL 安全

```bash
# 运行安全脚本
sudo mysql_secure_installation

# 设置：
# - 设置 root 密码
# - 删除匿名用户
# - 禁止 root 远程登录
# - 删除测试数据库
```

### 4. 配置 SSL 证书（可选）

使用 Let's Encrypt 免费证书：
```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx -y

# 获取证书
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo certbot renew --dry-run
```

---

## 📊 监控和维护

### 1. 查看日志

```bash
# 应用日志
sudo journalctl -u lazy-sheep -f

# Nginx 日志
sudo tail -f /var/log/nginx/lazy-sheep-access.log
sudo tail -f /var/log/nginx/lazy-sheep-error.log

# MySQL 日志
sudo tail -f /var/log/mysql/error.log
```

### 2. 性能监控

安装监控工具：
```bash
# 安装 htop
sudo apt install htop -y

# 查看系统资源
htop

# 查看 MySQL 状态
mysql -u root -p -e "SHOW STATUS;"

# 查看 Redis 状态
redis-cli INFO
```

### 3. 数据库备份

创建备份脚本：
```bash
vim /opt/scripts/backup.sh
```

写入以下内容：
```bash
#!/bin/bash
BACKUP_DIR="/backup/mysql"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

mysqldump -u lazy_sheep -p'your_password' lazy_sheep > $BACKUP_DIR/lazy_sheep_$DATE.sql
gzip $BACKUP_DIR/lazy_sheep_$DATE.sql

# 保留最近7天的备份
find $BACKUP_DIR -name "lazy_sheep_*.sql.gz" -mtime +7 -delete
```

添加定时任务：
```bash
# 编辑 crontab
crontab -e

# 每天凌晨2点备份
0 2 * * * /opt/scripts/backup.sh
```

---

## 🔧 常见问题

### Q1: 服务无法启动？

**A**: 检查：
```bash
# 查看详细日志
sudo journalctl -u lazy-sheep -xe

# 检查端口占用
sudo netstat -tulpn | grep 8000

# 检查 Python 环境
/opt/lazy-sheep-backend/venv/bin/python --version

# 测试数据库连接
mysql -u lazy_sheep -p lazy_sheep
```

### Q2: 数据库连接失败？

**A**: 检查：
```bash
# 测试连接
mysql -u lazy_sheep -p -h localhost lazy_sheep

# 检查 MySQL 是否运行
sudo systemctl status mysql

# 查看 MySQL 日志
sudo tail -f /var/log/mysql/error.log

# 检查 .env 配置是否正确
cat /opt/lazy-sheep-backend/.env | grep DATABASE_URL
```

### Q3: Redis 连接失败？

**A**: 检查：
```bash
# 测试连接
redis-cli ping

# 检查 Redis 是否运行
sudo systemctl status redis-server

# 查看 Redis 日志
sudo tail -f /var/log/redis/redis-server.log
```

### Q4: DeepSeek API 调用失败？

**A**: 检查：
```bash
# 测试 API Key
curl https://api.deepseek.com/v1/models \
  -H "Authorization: Bearer your_api_key"

# 检查网络连接
ping api.deepseek.com

# 查看应用日志
sudo journalctl -u lazy-sheep | grep deepseek
```

### Q5: 性能问题？

**A**: 优化：
```bash
# 增加 Worker 数量
# 编辑 /etc/systemd/system/lazy-sheep.service
ExecStart=/opt/lazy-sheep-backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --workers 8

# 优化 MySQL
# 编辑 /etc/mysql/mysql.conf.d/mysqld.cnf
[mysqld]
innodb_buffer_pool_size = 1G
innodb_log_file_size = 256M
max_connections = 500

# 优化 Redis
# 编辑 /etc/redis/redis.conf
maxmemory 512mb
maxmemory-policy allkeys-lru

# 重启服务
sudo systemctl restart lazy-sheep mysql redis-server
```

---

## 📈 扩展部署

### Docker 部署

创建 `Dockerfile`:
```dockerfile
FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

创建 `docker-compose.yml`:
```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=mysql+aiomysql://lazy_sheep:password@db:3306/lazy_sheep
      - REDIS_HOST=redis
      - DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}
    depends_on:
      - db
      - redis

  db:
    image: mysql:8.0
    environment:
      - MYSQL_ROOT_PASSWORD=rootpassword
      - MYSQL_DATABASE=lazy_sheep
      - MYSQL_USER=lazy_sheep
      - MYSQL_PASSWORD=password
    volumes:
      - mysql_data:/var/lib/mysql

  redis:
    image: redis:6-alpine
    volumes:
      - redis_data:/data

volumes:
  mysql_data:
  redis_data:
```

启动：
```bash
docker-compose up -d
```

---

## 🎯 生产环境检查清单

部署前请确认：

- [ ] 已修改默认密码
- [ ] 已配置安全的 API Key
- [ ] 已配置防火墙规则
- [ ] 已配置 SSL 证书（如需HTTPS）
- [ ] 已设置日志轮转
- [ ] 已配置数据库备份
- [ ] 已配置监控告警
- [ ] 已测试服务自动重启
- [ ] 已配置反向代理（Nginx）
- [ ] 已测试负载能力

---

## 📞 技术支持

遇到部署问题？

- 📧 Email: support@example.com
- 🐛 GitHub: https://github.com/your-repo/issues
- 📚 文档: https://docs.your-site.com

---

**版本**: 2.0.0  
**更新时间**: 2024-12-01
