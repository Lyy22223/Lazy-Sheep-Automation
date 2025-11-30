# 实际测试发现总结

基于浏览器控制台实际测试的结果，以下是关键发现和与代码分析的差异。

## 一、Vue实例结构

### 1.1 实例获取方式
- **位置**: `element.__vue__` 直接可用
- **数据位置**: `vue.data`（不是 `vue.$data.data`）
- **Props**: `vue.$props.data` 也存在（可能是同一引用）

### 1.2 题目数据结构
```javascript
vue.data = {
    // 答案相关
    stuAnswer: "...",        // 学生答案（格式因题型而异）
    id: "...",               // 题目ID（与data-id一致）
    questionId: "...",       // 题目模板ID
    
    // 题目信息
    questionType: 0,         // 题型：0单选，1多选，2判断，3填空，4简答
    questionContent: "...",  // 题目内容
    questionOptionList: [],  // 选项列表
    
    // 其他字段（很多，都是响应式的）
    // ...
}
```

### 1.3 重要方法
- `danxuanChange()` - 单选题变化处理
- `duoxuanUptdate()` - 多选题更新处理
- `panduanChange()` - 判断题变化处理
- `initDuoxuanModel()` - 多选题初始化

### 1.4 事件
- `submit-event` - 提交事件（答案保存时触发）
- `strat-write` - 开始作答
- `getQuestion` - 获取题目
- `updateCheat` - 更新防作弊信息
- `editorFoucs` - 编辑器焦点

---

## 二、各题型答案格式（实际测试）

### 2.1 单选题

**Vue数据格式**:
```javascript
vue.data.stuAnswer = "A"  // 字母格式
```

**选项值**:
```javascript
input[type="radio"].value = "A", "B", "C", "D"  // 字母
```

**提交事件格式**:
```javascript
{
    id: "作业ID",
    questionId: "题目ID",
    answer: "0",  // 索引格式（不是字母）
    type: "0"
}
```

**关键发现**:
- Vue数据存储：字母（"A", "B", "C", "D"）
- 提交时转换：索引（"0", "1", "2", "3"）
- 选项value：字母格式
- 点击radio后，stuAnswer自动更新为对应字母

---

### 2.2 多选题

**Vue数据格式**:
```javascript
vue.data.stuAnswer = ['null', 'A', 'B', 'C']  // 数组格式
// 注意：第一个元素是字符串'null'，不是null值
```

**点击后变化**:
```javascript
// 点击前: ['null', 'A', 'B', 'C']
// 取消A后: ['null', 'B', 'C']
```

**网络请求格式**:
```
answer=0%2C1%2C2  // URL编码的 "0,1,2"（逗号分隔的索引）
```

**关键发现**:
- Vue数据：数组格式，第一个元素是字符串'null'
- 网络请求：逗号分隔的索引字符串 "0,1,2"
- 平台会自动转换：数组 → 逗号分隔字符串
- 点击checkbox后，数组自动更新

---

### 2.3 判断题

**Vue数据格式**:
```javascript
vue.data.stuAnswer = "错"  // 中文
```

**网络请求格式**:
```
answer=%E9%94%99  // URL编码的"错"
```

**关键发现**:
- Vue数据：中文（"对"或"错"）
- 网络请求：URL编码的中文
- 与单选题处理方式类似

---

### 2.4 填空题

**Vue数据格式**:
```javascript
vue.data.stuAnswer = "【spring-boot-starter-parent】"  // 普通字符串
```

**输入框值**:
```javascript
input.tk_input.value = "spring-boot-starter-parent"  // 与stuAnswer一致
```

**网络请求格式**:
```
answer=%5B%22prefix1%22%5D  // URL编码的 JSON数组 ["prefix1"]
```

**关键发现**:
- Vue数据：普通字符串
- 输入框value：与stuAnswer一致
- 网络请求：JSON数组格式（可能包含占位符）
- ⚠️ 格式不一致，可能有转换逻辑

---

### 2.5 简答题

**Vue数据格式**:
```javascript
vue.data.stuAnswer = "这是测试答案内容...<br />\n<br />"  // HTML格式
```

**textarea值**:
```javascript
textarea.value = ""  // 空（由KindEditor管理）
```

**KindEditor实例**:
```javascript
window.KindEditor.instances = [KEditor, KEditor, KEditor]  // 数组格式
```

**KindEditor匹配**:
```javascript
// 通过container匹配
instances.find(inst => {
    const containerEl = inst.container.elm || inst.container;
    return containerEl && containerEl.contains(textarea);
})
```

**关键发现**:
- Vue数据：HTML格式字符串
- textarea.value：空（KindEditor管理）
- KindEditor实例：数组格式，不是对象
- 使用 `editor.html()` 获取/设置内容
- 使用 `editor.sync()` 同步到textarea

---

## 三、网络请求格式（实际抓包）

### 3.1 接口信息

**URL**:
```
https://stu.ityxb.com/back/bxg/my/busywork/updateStudentAns
```
⚠️ 注意：有 `/back/` 前缀

**请求方法**: `POST`

**Content-Type**: 
```
application/x-www-form-urlencoded
```
⚠️ 不是 `application/json`！

**必需请求头**:
```
login-name: 17777479713  // 登录用户名（需要从页面获取）
```

### 3.2 请求体格式

**表单数据格式**:
```
busyworkId=xxx&busyworkQuestionId=yyy&answer=zzz
```

**各题型实际格式**:

1. **单选题**:
   ```
   answer=1  // 数字索引
   ```

2. **多选题**:
   ```
   answer=0%2C1%2C2  // URL编码的 "0,1,2"（逗号分隔）
   ```

3. **判断题**:
   ```
   answer=%E9%94%99  // URL编码的"错"
   ```

4. **填空题**:
   ```
   answer=%5B%22prefix1%22%5D  // URL编码的 JSON数组
   ```

5. **简答题**:
   ```
   answer=%E8%BF%99%E6%98%AF...  // URL编码的 HTML内容
   ```

### 3.3 关键差异

| 项目 | 代码分析 | 实际测试 | 说明 |
|------|---------|---------|------|
| Content-Type | application/json | application/x-www-form-urlencoded | 完全不同 |
| URL路径 | /bxg/my/busywork/... | /back/bxg/my/busywork/... | 有/back/前缀 |
| 多选题格式 | "012"连续字符串 | "0,1,2"逗号分隔 | 格式不同 |
| 填空题格式 | 普通字符串 | JSON数组 | 格式不同 |

---

## 四、DOM结构（实际测试）

### 4.1 题目容器

**选择器**:
```javascript
.question-item-box[data-id]  // 91个题目
```

**属性**:
- `data-id`: 题目ID（与vue.data.id一致）
- `__vue__`: Vue实例（直接可用）

### 4.2 选项结构

**单选题**:
```javascript
input[type="radio"]  // value="A", "B", "C", "D"
label.el-radio
```

**多选题**:
```javascript
input[type="checkbox"]  // 194个选项结构
label.el-checkbox
```

**判断题**:
```javascript
// 与单选题相同，选项是"对"和"错"
```

**填空题**:
```javascript
input.tk_input  // 1个输入框
```

**简答题**:
```javascript
textarea  // value为空（KindEditor管理）
iframe.ke-edit-iframe  // KindEditor的iframe
```

### 4.3 KindEditor实例

**实例数量**: 3个

**实例格式**: 数组 `[KEditor, KEditor, KEditor]`

**匹配方式**:
```javascript
// 通过container匹配textarea
instances.find(inst => {
    const containerEl = inst.container.elm || inst.container;
    return containerEl && containerEl.contains(textarea);
})
```

**API方法**:
```javascript
editor.html(content)  // 设置HTML内容
editor.text()         // 获取文本内容
editor.html()         // 获取HTML内容
editor.sync()         // 同步到textarea
```

---

## 五、事件机制

### 5.1 自动触发事件

**submit-event**:
- 触发时机：答案变化后自动触发
- 数据格式：
  ```javascript
  {
      id: "作业ID",
      questionId: "题目ID",
      answer: "0",  // 索引格式
      type: "0"     // 题型
  }
  ```
- 用途：确认答案已保存

### 5.2 数据变化监听

**单选题**:
```javascript
// 点击radio后
vue.data.stuAnswer: "B" -> "A"  // 自动更新
```

**多选题**:
```javascript
// 点击checkbox后
vue.data.stuAnswer: ['null', 'A', 'B', 'C'] -> ['null', 'B', 'C']  // 自动更新
```

### 5.3 错误处理

**常见错误**:
```
TypeError: Cannot read properties of null (reading 'ipChangeRestrictEnabled')
```

**原因**: 平台代码bug，不影响功能

**处理**: 已在脚本中捕获并忽略

---

## 六、答案格式转换规则

### 6.1 Vue数据 → 网络请求

| 题型 | Vue数据格式 | 网络请求格式 | 转换方式 |
|------|------------|------------|---------|
| 单选 | "A" (字母) | "1" (索引) | 字母转索引 |
| 多选 | ['null','A','B'] (数组) | "0,1,2" (逗号分隔) | 数组转索引字符串 |
| 判断 | "错" (中文) | "%E9%94%99" (URL编码) | URL编码 |
| 填空 | "答案" (字符串) | '["prefix1"]' (JSON数组) | 字符串转JSON数组 |
| 简答 | "<p>答案</p>" (HTML) | "%E7%AD%94..." (URL编码) | URL编码 |

### 6.2 平台自动转换

**重要发现**:
- 平台会自动处理格式转换
- 我们只需要更新Vue数据，平台会：
  1. 监听数据变化
  2. 触发submit-event
  3. 转换为网络请求格式
  4. 发送请求

**因此**:
- 不需要手动转换格式
- 只需要正确更新Vue数据
- 让平台自动处理转换和请求

---

## 七、优化建议

### 7.1 Vue数据访问

```javascript
// ✅ 正确方式
const vue = element.__vue__;
const data = vue.data;  // 直接访问
const answer = data.stuAnswer;

// ❌ 错误方式
const data = vue.$data.data;  // undefined
```

### 7.2 答案更新

```javascript
// ✅ 正确方式
vue.$set(vue.data, 'stuAnswer', newAnswer);
vue.$forceUpdate();

// 或者直接赋值（Vue会监听）
vue.data.stuAnswer = newAnswer;
```

### 7.3 多选题处理

```javascript
// ✅ 正确方式：只操作DOM，让Vue自动更新
checkbox.click();  // Vue数据会自动更新为数组

// ❌ 错误方式：手动设置数组格式
vue.$set(vue.data, 'stuAnswer', ['null', 'A', 'B']);  // 可能格式不对
```

### 7.4 简答题处理

```javascript
// ✅ 正确方式：使用KindEditor API
const editor = instances.find(inst => 
    inst.container?.contains(textarea)
);
editor.html(htmlContent);
editor.sync();  // 同步到textarea和Vue数据
```

### 7.5 答案检查

```javascript
// ✅ 正确方式：考虑多选题的特殊格式
function isAnswered(questionItem) {
    const answer = questionItem.__vue__?.data?.stuAnswer;
    if (!answer) return false;
    
    // 多选题：检查数组是否有有效答案
    if (Array.isArray(answer)) {
        return answer.some(v => v !== 'null' && v !== null && v !== '');
    }
    
    // 其他类型：检查字符串
    return String(answer).trim().length > 0;
}
```

---

## 八、与代码分析的差异总结

| 项目 | 代码分析 | 实际测试 | 影响 |
|------|---------|---------|------|
| Content-Type | JSON | Form-urlencoded | 需要修改请求格式 |
| URL路径 | /bxg/... | /back/bxg/... | 需要添加/back/前缀 |
| 多选题Vue格式 | 字符串"012" | 数组['null','A','B'] | 不需要手动转换 |
| 多选题请求格式 | "012" | "0,1,2" | 平台自动转换 |
| 填空题请求格式 | 字符串 | JSON数组 | 平台自动转换 |
| Vue数据位置 | $data.data | data | 访问方式不同 |
| KindEditor实例 | 对象 | 数组 | 匹配方式不同 |

---

## 九、实际测试数据

### 9.1 题目统计
- 总题目数：91道
- 已答题数：91道
- 未答题数：0道
- 按题型分布：有完整统计

### 9.2 选项统计
- 选项结构：194个
- 平均每题：约2个选项（可能是判断题较多）

### 9.3 KindEditor统计
- 实例数量：3个
- 说明：有3道简答题

---

## 十、关键代码修正

### 10.1 Vue工具类

```javascript
const VueUtils = {
    getInstance(element) {
        return element?.__vue__ || null;
    },
    
    getQuestionData(questionItem) {
        const vue = this.getInstance(questionItem);
        return vue?.data || null;
    },
    
    getAnswer(questionItem) {
        const data = this.getQuestionData(questionItem);
        return data?.stuAnswer || null;
    },
    
    updateAnswer(questionItem, answer) {
        const vue = this.getInstance(questionItem);
        if (!vue || !vue.data) return false;
        
        vue.$set(vue.data, 'stuAnswer', answer);
        vue.$forceUpdate();
        return true;
    },
    
    isAnswered(questionItem) {
        const answer = this.getAnswer(questionItem);
        if (!answer) return false;
        
        // 多选题特殊处理
        if (Array.isArray(answer)) {
            return answer.some(v => v !== 'null' && v !== null && v !== '');
        }
        
        return String(answer).trim().length > 0;
    }
};
```

### 10.2 答案填充修正

```javascript
// 单选题：使用字母格式
fillDanxuan: async function(questionItem, answer) {
    // 转换为字母
    let letter = answer;
    if (!/[A-Z]/.test(answer)) {
        const index = parseInt(answer);
        letter = String.fromCharCode(65 + index);
    }
    
    // 更新Vue数据
    const vue = questionItem.__vue__;
    vue.$set(vue.data, 'stuAnswer', letter);
    
    // 点击对应radio
    const radios = questionItem.querySelectorAll('input[type="radio"]');
    const targetRadio = Array.from(radios).find(r => r.value === letter);
    if (targetRadio) {
        targetRadio.click();
        return true;
    }
    return false;
}

// 多选题：只操作DOM，让Vue自动更新
fillDuoxuan: async function(questionItem, answer) {
    // 解析答案，转换为字母数组
    const letters = answer.split(',').map(v => {
        v = v.trim().toUpperCase();
        if (/[A-Z]/.test(v)) return v;
        const index = parseInt(v);
        return String.fromCharCode(65 + index);
    });
    
    // 只操作checkbox，Vue会自动更新数组
    const checkboxes = questionItem.querySelectorAll('input[type="checkbox"]');
    const targetIndexes = new Set(letters.map(l => l.charCodeAt(0) - 65));
    
    for (let i = 0; i < checkboxes.length; i++) {
        if (targetIndexes.has(i) !== checkboxes[i].checked) {
            checkboxes[i].click();
            await utils.sleep(100);
        }
    }
    
    return true;
}
```

---

*基于实际浏览器控制台测试*
*测试时间: 2024年*
*测试环境: Chrome浏览器，实际答题页面*

