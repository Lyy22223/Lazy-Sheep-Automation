# 数据库连接信息

## 📊 PostgreSQL连接配置

### Navicat连接设置

```
连接名: 懒羊羊题库-本地开发
主机: localhost
端口: 5432
数据库: lazy_sheep
用户名: lazy_user
密码: lazy_password
```

### 详细配置步骤

#### 1. 打开Navicat
- 点击 `连接` → `PostgreSQL`

#### 2. 填写基本信息
```
连接名称: 懒羊羊题库-本地开发
主机: localhost (或 127.0.0.1)
端口: 5432
初始数据库: lazy_sheep
用户名: lazy_user
密码: lazy_password
```

#### 3. 高级设置（可选）
- **编码**: UTF8
- **维护数据库**: postgres
- **使用SSH隧道**: 否

#### 4. 测试连接
点击 `测试连接` 按钮，应该显示：
```
连接成功
```

#### 5. 保存并连接
点击 `确定`，然后双击连接名称即可。

---

## 📝 查看数据库内容

### 当前表结构

#### questions表（题目表）
```sql
-- 查看表结构
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'questions';

-- 查看数据
SELECT * FROM questions LIMIT 10;
```

**字段说明：**
- `id`: 主键（自增）
- `question_id`: 题目唯一ID（UUID）
- `question_content`: 题目内容
- `type`: 题目类型（0=单选，1=多选，2=判断）
- `answer`: 答案
- `answer_text`: 答案文本
- `options`: 选项（JSON）
- `platform`: 平台标识（czbk）
- `confidence`: 答案置信度
- `content_hash`: 内容哈希（用于去重）
- `created_at`: 创建时间
- `updated_at`: 更新时间

#### api_keys表（API密钥表）
```sql
-- 查看所有密钥
SELECT key, name, usage_count, quota_daily, is_active, expire_at
FROM api_keys;
```

---

## 🔧 常用SQL操作

### 查询题目
```sql
-- 按平台查询
SELECT * FROM questions WHERE platform = 'czbk';

-- 按类型查询
SELECT * FROM questions WHERE type = '0';  -- 单选题

-- 按置信度查询
SELECT * FROM questions WHERE confidence >= 0.9;

-- 搜索题目内容
SELECT * FROM questions WHERE question_content LIKE '%关键词%';
```

### 统计信息
```sql
-- 题目总数
SELECT COUNT(*) as total FROM questions;

-- 按类型统计
SELECT type, COUNT(*) as count FROM questions GROUP BY type;

-- 按平台统计
SELECT platform, COUNT(*) as count FROM questions GROUP BY platform;

-- 高置信度题目数量
SELECT COUNT(*) FROM questions WHERE confidence >= 0.9;
```

### 清理测试数据
```sql
-- 删除所有题目（危险！）
TRUNCATE TABLE questions RESTART IDENTITY;

-- 删除特定平台的题目
DELETE FROM questions WHERE platform = 'test';
```

---

## 🐳 Docker命令行连接

如果Navicat无法连接，可以使用命令行：

```bash
# 进入PostgreSQL容器
docker exec -it lazy-sheep-postgres psql -U lazy_user -d lazy_sheep

# 常用命令
\l          # 列出所有数据库
\c lazy_sheep  # 切换数据库
\dt         # 列出所有表
\d questions   # 查看表结构
\q          # 退出
```

---

## ❓ 连接问题排查

### 问题1: 连接被拒绝
```bash
# 检查Docker容器是否运行
docker ps | findstr postgres

# 应该看到：
# lazy-sheep-postgres   Up XX minutes (healthy)
```

### 问题2: 端口被占用
```bash
# 检查端口占用
netstat -ano | findstr :5432

# 如果被占用，修改docker-compose.dev.yml
ports:
  - "5433:5432"  # 改为5433端口
```

### 问题3: 密码错误
确认密码是：`lazy_password`

如果忘记，可以在 `.env.local` 查看，或者重建容器：
```bash
docker-compose -f docker-compose.dev.yml down
docker-compose -f docker-compose.dev.yml up -d
```

---

## 🔐 Redis连接信息

如果你也想用工具连接Redis：

### Redis配置
```
主机: localhost
端口: 6379
密码: (无)
数据库: 0
```

### 推荐工具
- **RedisInsight** (官方工具，免费)
  - 下载: https://redis.io/insight/
- **Another Redis Desktop Manager**
  - 下载: https://github.com/qishibo/AnotherRedisDesktopManager

---

## 📋 快速参考

| 服务 | 地址 | 用户名 | 密码 |
|------|------|--------|------|
| PostgreSQL | localhost:5432 | lazy_user | lazy_password |
| Redis | localhost:6379 | - | - |
| API文档 | http://localhost:8000/docs | - | - |
| 健康检查 | http://localhost:8000/health | - | - |

---

## 💡 提示

1. **备份数据**：重要数据记得导出备份
2. **不要在生产环境使用这些密码**
3. **定期清理测试数据**
4. **使用索引优化查询性能**

---

祝开发愉快！🎉
