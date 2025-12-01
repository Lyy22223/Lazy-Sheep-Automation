# 🧪 自动上传答案功能 - 测试指南

## ✨ 新功能说明

现在前端自动答题成功后，会**自动上传正确答案到数据库**！

### 工作流程

```
1. 用户开始自动答题
   ↓
2. 系统搜索答案（云端API）
   ↓
3. 填充答案到页面
   ↓
4. 答题成功 ✓
   ↓
5. 🔥 自动上传答案到数据库（新功能）
   ↓
6. 继续下一题
```

### 特点

- ✅ **异步上传**：不阻塞答题流程
- ✅ **智能去重**：后端自动去重，避免重复
- ✅ **高置信度**：用户确认的答案，置信度1.0
- ✅ **容错设计**：上传失败不影响答题
- ✅ **增量式**：题库自动完善

---

## 📋 测试步骤

### 前提条件

1. **后端API服务运行中**
   ```bash
   cd lazy-sheep-backend
   python run.py
   ```
   访问 http://localhost:8000/docs 确认运行

2. **PostgreSQL运行中**
   ```bash
   docker ps | findstr postgres
   # 应该看到：lazy-sheep-postgres (healthy)
   ```

3. **API密钥已创建**
   ```
   sk-test-lazy-sheep-dev-2024
   ```

---

### Step 1: 配置前端API密钥

打开油猴脚本，在控制台执行：

```javascript
// 方式1：使用配置API
window.LazyUtils?.setConfig('api.key', 'sk-test-lazy-sheep-dev-2024');

// 方式2：直接修改localStorage
localStorage.setItem('lazy-sheep-api-key', 'sk-test-lazy-sheep-dev-2024');

// 验证配置
console.log('API Key:', window.LazyUtils?.getConfig('api.key'));
```

---

### Step 2: 清空数据库（可选）

如果想从头测试，清空数据库：

```sql
-- 在DBeaver或psql中执行
TRUNCATE TABLE questions RESTART IDENTITY;

-- 验证清空
SELECT COUNT(*) FROM questions;  -- 应该返回0
```

---

### Step 3: 开始自动答题

1. 打开课程页面（有习题的课程）
2. 打开控制台（F12）
3. 启动自动答题：
   ```javascript
   // 使用面板按钮，或控制台命令
   window.LazySheep.startAutoAnswer();
   ```

---

### Step 4: 观察日志

在控制台查看日志：

```
[AutoAnswer] 🚀 开始自动答题
[AutoAnswer] 共 10 道题目
[AutoAnswer] 开始答题: Q123...
[API] 搜索成功: Q123
[AutoAnswer] ✓ 答题成功 (1/10)
[AutoAnswer] 答案已上传: Q123  ← 🔥 看到这个就说明上传成功了
...
[AutoAnswer] ✅ 答题完成
```

**关键日志：**
- `[AutoAnswer] 答案已上传: xxx` - 上传成功
- `[AutoAnswer] 上传答案失败` - 上传失败（不影响答题）

---

### Step 5: 验证数据库

在DBeaver中查询：

```sql
-- 查看所有题目
SELECT 
    question_id,
    question_content,
    answer,
    answer_text,
    confidence,
    platform,
    created_at
FROM questions
ORDER BY created_at DESC
LIMIT 10;

-- 统计题目数量
SELECT COUNT(*) as total FROM questions;

-- 按类型统计
SELECT 
    type,
    COUNT(*) as count,
    AVG(confidence) as avg_confidence
FROM questions 
GROUP BY type;
```

**期望结果：**
- 数据库中应该有新增的题目记录
- `confidence` 字段为 `1.0`
- `platform` 字段为 `czbk`
- `created_at` 是刚才的时间

---

### Step 6: 测试去重功能

再次答相同的题目，观察是否去重：

```sql
-- 查看相同题目的更新时间
SELECT 
    question_content,
    answer,
    confidence,
    created_at,
    updated_at
FROM questions
WHERE question_content LIKE '%某个题目内容%';
```

**期望行为：**
- 相同题目不会重复插入
- 如果新答案置信度更高，会更新答案
- `updated_at` 字段会更新

---

## 🔍 调试技巧

### 1. 查看API请求

在控制台的Network标签中：
1. 筛选 `upload`
2. 应该能看到 `POST /api/upload` 请求
3. 查看请求体和响应

### 2. 查看详细日志

启用debug日志：
```javascript
// 在控制台执行
window.LazyUtils.setConfig('debug', true);
```

### 3. 手动测试上传

```javascript
// 在控制台执行
const testData = {
    questionId: 'test-' + Date.now(),
    questionContent: '测试题目：1+1=?',
    type: '0',
    answer: 'A',
    answerText: '2',
    platform: 'czbk',
    confidence: 1.0
};

// 调用API上传
fetch('http://localhost:8000/api/upload', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'sk-test-lazy-sheep-dev-2024'
    },
    body: JSON.stringify(testData)
}).then(r => r.json()).then(console.log);
```

### 4. 查看后端日志

```bash
# 查看API日志
Get-Content lazy-sheep-backend\data\app.log -Wait

# 应该看到：
# INFO - POST /api/upload
# DEBUG - 保存题目: xxx
```

---

## ❗ 常见问题

### Q1: 看不到"答案已上传"日志

**原因：**
- API密钥未配置
- 后端服务未启动
- 网络请求失败

**解决：**
```javascript
// 检查API Key
console.log(window.LazyUtils.getConfig('api.key'));

// 检查API地址
console.log(window.LazyUtils.getConfig('api.baseUrl'));
// 应该是：http://localhost:8000

// 测试连接
fetch('http://localhost:8000/health').then(r => r.json()).then(console.log);
```

### Q2: 数据库中没有数据

**检查：**
1. 后端服务是否运行
2. 数据库连接是否正常
3. 查看后端日志是否有错误

```bash
# 检查服务
curl http://localhost:8000/health

# 检查数据库
docker exec -it lazy-sheep-postgres psql -U lazy_user -d lazy_sheep -c "SELECT COUNT(*) FROM questions;"
```

### Q3: 上传失败但不影响答题

**这是正常的！**
- 上传是异步的，失败不会阻塞答题
- 检查后端日志查看失败原因
- 常见原因：API Key错误、网络问题

---

## 📊 性能测试

测试100道题目的上传性能：

```sql
-- 查看上传速度
SELECT 
    DATE_TRUNC('minute', created_at) as minute,
    COUNT(*) as questions_uploaded
FROM questions
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY minute
ORDER BY minute DESC;

-- 查看平均响应时间（需要在后端添加统计）
```

---

## ✅ 测试检查清单

- [ ] 后端API服务运行正常
- [ ] PostgreSQL数据库运行正常
- [ ] API密钥已创建并配置
- [ ] 前端油猴脚本已加载
- [ ] 自动答题功能正常
- [ ] 控制台显示"答案已上传"日志
- [ ] 数据库中有新增题目记录
- [ ] 去重功能正常工作
- [ ] 答案置信度为1.0
- [ ] 上传失败不影响答题

---

## 🎉 成功标志

如果看到以下现象，说明功能正常：

1. ✅ 控制台日志：`[AutoAnswer] 答案已上传: xxx`
2. ✅ 数据库有新记录
3. ✅ Network标签有 `POST /api/upload` 请求
4. ✅ 相同题目不会重复插入
5. ✅ 题库数量持续增长

---

需要帮助？
- 查看后端日志：`lazy-sheep-backend\data\app.log`
- 查看控制台错误
- 检查Network请求
- 验证数据库连接
