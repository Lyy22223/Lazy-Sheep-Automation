# 📊 数据流程与格式转换详解

## 概览

本文档详细说明传智播客平台数据格式和数据库存储格式之间的转换关系，以及数据在系统中的完整流转过程。

---

## 🔄 两个方向的数据流

### 1️⃣ **正确答案上传流程**

```
用户答题 → 平台格式 → [数据转换] → 数据库格式 → 云端保存
```

**场景：**
- 自动答题成功
- 智能纠错成功

**目的：** 将用户确认的正确答案保存到云端，完善题库

### 2️⃣ **答案查询流程**

```
用户查询 → 数据库格式 → [数据转换] → 平台格式 → 页面展示
```

**场景：**
- 搜索题目答案
- 批量查询题目

**目的：** 从云端获取答案，帮助用户快速答题

---

## 📝 数据格式对比

### 传智播客平台格式

```javascript
{
    // 题目标识
    id: "1234567890",           // 题目ID
    questionId: "1234567890",   // 题目ID（可选）
    
    // 题目内容
    questionContent: "题目内容",
    questionContentText: "题目内容",  // 备用字段
    
    // 题型
    questionType: "0",          // 0=单选 1=多选 2=判断 3=填空 4=简答
    
    // 选项（多种可能的格式）
    options: "[\"选项A\",\"选项B\"]",  // JSON字符串
    // 或
    questionOptionList: [
        { key: "A", text: "选项A" },
        { key: "B", text: "选项B" }
    ],
    
    // 答案
    answer: "A",                // 正确答案
    stuAnswer: "B",             // 学生答案
    
    // 批改结果
    correct: false              // 是否正确
}
```

### 数据库存储格式

```javascript
{
    // 题目标识
    questionId: "1234567890",   // 唯一ID（必需）
    
    // 题目内容
    questionContent: "题目内容", // 题目内容（必需）
    
    // 题型
    type: "0",                  // 题型（必需）
    
    // 选项（统一为数组）
    options: ["选项A", "选项B", "选项C", "选项D"],
    
    // 答案
    answer: "A",                // 正确答案（必需）
    answerText: "选项A",        // 答案文本说明
    
    // 元数据
    platform: "czbk",           // 平台标识
    source: "auto_answer",      // 来源（auto_answer/correction/user）
    confidence: 1.0             // 置信度（0-1）
}
```

---

## 🔧 数据转换器（DataTransformer）

### 核心方法

#### 1. `platformToDatabase(platformData)`

**功能：** 平台格式 → 数据库格式

**处理：**
- 统一题目ID字段
- 标准化题型为字符串
- 解析并统一选项格式
- 生成答案文本说明

**示例：**

```javascript
// 输入（平台格式）
{
    id: "Q123",
    questionContent: "1+1=?",
    questionType: "0",
    options: "[\"2\",\"3\",\"4\",\"5\"]",
    answer: "A"
}

// 输出（数据库格式）
{
    questionId: "Q123",
    questionContent: "1+1=?",
    type: "0",
    options: ["2", "3", "4", "5"],
    answer: "A",
    answerText: "2",
    platform: "czbk"
}
```

#### 2. `databaseToPlatform(dbData)`

**功能：** 数据库格式 → 平台格式

**处理：**
- 补充平台所需的所有字段
- 转换选项为平台格式
- 保持兼容性

**示例：**

```javascript
// 输入（数据库格式）
{
    questionId: "Q123",
    content: "1+1=?",
    type: "0",
    answer: "A",
    options: ["2", "3", "4", "5"]
}

// 输出（平台格式）
{
    id: "Q123",
    questionId: "Q123",
    questionContent: "1+1=?",
    questionType: "0",
    answer: "A",
    options: ["2", "3", "4", "5"],
    questionOptionList: [
        { key: "A", text: "2" },
        { key: "B", text: "3" },
        { key: "C", text: "4" },
        { key: "D", text: "5" }
    ]
}
```

#### 3. `extractCorrectAnswerFromCorrectionResult(error, correctAnswer)`

**功能：** 从纠错结果提取正确答案数据

**用途：** 智能纠错成功后，自动上传正确答案

**特点：**
- 自动设置 `source: 'correction'`
- 置信度为 `1.0`（经过验证）

---

## 🔄 完整数据流程

### 场景1：自动答题成功后上传

```
┌─────────────┐
│ 1. 提取题目  │ → PlatformManager.extractAllQuestions()
└─────────────┘
       ↓
┌─────────────┐
│ 2. 搜索答案  │ → APIClient.search()
└─────────────┘
       ↓
┌─────────────┐
│ 3. 填充答案  │ → AnswerFiller.fill()
└─────────────┘
       ↓
┌─────────────┐
│ 4. 答题成功  │ ✓
└─────────────┘
       ↓
┌───────────────────────────────┐
│ 5. 准备上传数据                │
│   - platformData = {           │
│       questionId, content,     │
│       type, options, answer    │
│     }                          │
└───────────────────────────────┘
       ↓
┌───────────────────────────────┐
│ 6. 数据转换                    │
│   uploadData =                 │
│   DataTransformer              │
│   .platformToDatabase()        │
└───────────────────────────────┘
       ↓
┌───────────────────────────────┐
│ 7. 验证数据                    │
│   DataTransformer              │
│   .validateDatabaseFormat()    │
└───────────────────────────────┘
       ↓
┌───────────────────────────────┐
│ 8. 清理数据                    │
│   cleanData =                  │
│   DataTransformer              │
│   .cleanData()                 │
└───────────────────────────────┘
       ↓
┌───────────────────────────────┐
│ 9. 上传云端                    │
│   APIClient.upload()           │
│   ↓                            │
│   POST /api/upload             │
│   ↓                            │
│   保存到PostgreSQL             │
└───────────────────────────────┘
       ↓
┌─────────────┐
│ 10. 完成 ✓  │
└─────────────┘
```

### 场景2：智能纠错成功后上传

```
┌─────────────┐
│ 1. 获取错题  │ → CorrectionManager._fetchErrorsFromAPI()
└─────────────┘
       ↓
┌─────────────┐
│ 2. AI生成   │ → _aiCorrection()
│    新答案    │
└─────────────┘
       ↓
┌─────────────┐
│ 3. 填充答案  │ → AnswerFiller.fill()
└─────────────┘
       ↓
┌─────────────┐
│ 4. 提交验证  │ → 平台批改接口
└─────────────┘
       ↓
┌─────────────┐
│ 5. 纠错成功  │ ✓ (答案正确)
└─────────────┘
       ↓
┌───────────────────────────────┐
│ 6. 提取正确答案                │
│   uploadData =                 │
│   DataTransformer              │
│   .extractCorrectAnswer        │
│   FromCorrectionResult()       │
│                                │
│   设置:                        │
│   - source: 'correction'       │
│   - confidence: 1.0            │
└───────────────────────────────┘
       ↓
┌───────────────────────────────┐
│ 7. 验证 + 清理                 │
└───────────────────────────────┘
       ↓
┌───────────────────────────────┐
│ 8. 上传云端                    │
│   APIClient.upload()           │
└───────────────────────────────┘
       ↓
┌─────────────┐
│ 9. 完成 ✓   │
└─────────────┘
```

---

## 🎯 关键设计

### 1. 异步上传

```javascript
// ✅ 正确做法：不阻塞答题流程
this._uploadAnswer(question, answer).catch(error => {
    logger.warn('上传失败（不影响答题）:', error);
});

// ❌ 错误做法：阻塞答题
await this._uploadAnswer(question, answer);
```

### 2. 数据源标识

- `auto_answer`: 自动答题获得
- `correction`: 智能纠错获得
- `user`: 用户手动上传

### 3. 置信度设置

- `1.0`: 用户确认或经过验证的答案
- `0.9`: AI生成的答案
- `0.8`: 从其他来源导入的答案

### 4. 数据验证

```javascript
// 必需字段检查
const required = ['questionId', 'questionContent', 'type', 'answer'];

// 题型检查
if (!['0', '1', '2', '3', '4'].includes(data.type)) {
    throw new Error('无效题型');
}
```

---

## 🐛 常见问题

### Q1: 为什么需要数据转换？

**A:** 平台格式和数据库格式不同：
- 平台格式复杂，字段不统一
- 数据库格式标准化，便于存储和查询
- 转换层解耦前后端

### Q2: 上传失败会影响答题吗？

**A:** 不会！上传是异步的，失败只会记录日志：
```javascript
this._uploadAnswer().catch(err => {
    logger.warn('上传失败（不影响答题）');
});
```

### Q3: 如何处理重复题目？

**A:** 后端使用 `content_hash`（MD5）去重：
- 相同题目不会重复插入
- 置信度更高的答案会覆盖旧答案

### Q4: 选项格式为什么这么复杂？

**A:** 平台有多种可能的格式：
- `options`: JSON字符串
- `questionOptionList`: 对象数组
- 数据转换器统一处理为字符串数组

---

## 📊 数据流向图

```
┌──────────────────────────────────────────────────────────┐
│                     前端（用户脚本）                      │
│                                                           │
│  ┌─────────────┐      ┌──────────────┐                  │
│  │ 自动答题    │      │  智能纠错     │                  │
│  └──────┬──────┘      └──────┬───────┘                  │
│         │                    │                           │
│         └──────────┬─────────┘                           │
│                    ↓                                     │
│         ┌──────────────────────┐                         │
│         │  DataTransformer     │                         │
│         │  (数据转换器)         │                         │
│         └──────────┬───────────┘                         │
│                    ↓                                     │
│         ┌──────────────────────┐                         │
│         │   APIClient.upload   │                         │
│         └──────────┬───────────┘                         │
└────────────────────┼────────────────────────────────────┘
                     │
                     ↓ POST /api/upload
┌────────────────────┼────────────────────────────────────┐
│                    ↓                                     │
│              ┌───────────┐                               │
│              │ FastAPI   │                               │
│              │ Backend   │                               │
│              └─────┬─────┘                               │
│                    ↓                                     │
│         ┌──────────────────────┐                         │
│         │  search_service.py   │                         │
│         │  save_question()     │                         │
│         └──────────┬───────────┘                         │
│                    ↓                                     │
│         ┌──────────────────────┐                         │
│         │    PostgreSQL        │                         │
│         │   questions表         │                         │
│         └──────────────────────┘                         │
│                                                           │
│                  后端（API服务）                          │
└──────────────────────────────────────────────────────────┘
```

---

## ✅ 验证数据流程

### 测试步骤

1. **启动后端服务**
   ```bash
   python run.py
   ```

2. **观察上传日志**
   ```
   [AutoAnswer] ✓ 答题成功 (1/10)
   [AutoAnswer] 答案已上传: Q123
   ```

   或

   ```
   [Correction] ✅ 题目 Q456 - 纠错成功！
   [Correction] 💾 题目 Q456 - 正确答案已上传到云端
   ```

3. **验证数据库**
   ```sql
   SELECT 
       question_id,
       answer,
       source,
       confidence,
       created_at
   FROM questions
   ORDER BY created_at DESC
   LIMIT 10;
   ```

4. **检查数据完整性**
   - `questionId` 不为空
   - `type` 在 0-4 之间
   - `answer` 不为空
   - `source` 为 `auto_answer` 或 `correction`
   - `confidence` 为 `1.0`

---

## 🎉 总结

### 核心优势

1. **解耦前后端** - 数据转换层独立
2. **容错性强** - 上传失败不影响功能
3. **数据标准化** - 统一格式便于处理
4. **可追溯性** - source字段记录数据来源
5. **高质量** - 置信度标识答案可靠性

### 两个方向

- ✅ **上传正确答案** - 完善题库
- ✅ **智能纠错** - 试错找答案

两者结合，形成完整的题库自动化生态！

---

需要更多帮助？
- 查看代码: `src/network/data-transformer.js`
- 查看测试: `TESTING.md`
- 查看API文档: http://localhost:8000/docs
