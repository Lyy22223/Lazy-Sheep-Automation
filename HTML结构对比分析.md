# HTML结构对比分析

## 核心差异

### 1. 填空题结构差异 ⚠️

#### 原脚本预期结构
- 题目文本和输入框分离
- 输入框在单独的容器中
- 题目文本在 `.myEditorTxt` 中，不包含输入框HTML

#### cehsi.html 实际结构
```html
<div class="question-title-box">
  <div class="myEditorTxt">
    Spring Security中基于HttpSecurity的
    <input type="text" class="tk_input" 
           data-questionid="06db41cd473b4dd99006eb90a956c998" 
           maxlength="500" 
           value="" 
           data-index="%s">
    方法可以配置CSRF跨站请求伪造防护功能。
  </div>
</div>
```

**关键差异点：**
1. ✅ 输入框直接嵌入在题目文本中（作为HTML元素）
2. ✅ 输入框有 `data-index="%s"` 占位符属性
3. ✅ 使用 `textContent` 获取题目文本时会包含输入框的值（可能为空字符串）

### 2. 题目文本提取问题

#### 原脚本的提取逻辑
```javascript
getQuestionText: function(element) {
    let titleBox = element.querySelector('.question-title-box .myEditorTxt');
    if (titleBox) return titleBox.textContent.trim();
    // ...
}
```

#### 问题分析
- ✅ `textContent` 会获取包含输入框在内的所有文本
- ✅ 输入框值为空时，会留下空白
- ✅ 输入框有 `data-index="%s"` 占位符，可能影响文本提取
- ❌ 提取的题目文本可能包含多余空白或特殊字符

### 3. 填空题题目文本示例

**HTML中的实际内容：**
```html
<div class="myEditorTxt">
  Spring Security中基于HttpSecurity的
  <input ...>  <!-- 这里是输入框，可能为空 -->
  方法可以配置CSRF跨站请求伪造防护功能。
</div>
```

**使用 `textContent` 获取的结果：**
```
"Spring Security中基于HttpSecurity的 方法可以配置CSRF跨站请求伪造防护功能。"
```

**期望获取的结果（用于查询）：**
```
"Spring Security中基于HttpSecurity的方法可以配置CSRF跨站请求伪造防护功能。"
```

或者保留占位符：
```
"Spring Security中基于HttpSecurity的%s方法可以配置CSRF跨站请求伪造防护功能。"
```

### 4. 数据属性差异

#### 原脚本使用的属性
- `data-questionid` ✅ (存在)
- `data-id` ✅ (存在)
- `class="tk_input"` ✅ (存在)

#### HTML中的额外属性
- `data-index="%s"` ⚠️ (新出现，占位符)
- `maxlength="500"` ✅ (正常属性)

### 5. 可能的影响

#### 对题目查询的影响
1. **题目文本不匹配**：由于输入框嵌入，提取的文本可能有空白或格式差异
2. **API查询失败**：题目文本格式不同可能导致云端API无法匹配
3. **本地库查询失败**：题目文本不准确导致本地库无法匹配

#### 用户反馈
> "都几十题了也就那两个请求"

**分析：**
- 可能只对前几道题发送了查询请求
- 后续题目因为文本提取问题，可能：
  - 题目文本为空或格式错误
  - 被判定为已答题或跳过
  - 查询失败后没有重试

### 6. 建议的修复方案

#### 方案1：改进题目文本提取（推荐）
```javascript
getQuestionText: function(element) {
    let titleBox = element.querySelector('.question-title-box .myEditorTxt');
    if (!titleBox) {
        // 使用备用方法...
        return '';
    }
    
    // 克隆节点以避免修改原DOM
    const clone = titleBox.cloneNode(true);
    
    // 处理填空题：将输入框替换为占位符
    const inputs = clone.querySelectorAll('input.tk_input');
    inputs.forEach(input => {
        // 检查是否有 data-index 占位符
        const placeholder = input.getAttribute('data-index') || '___';
        const textNode = document.createTextNode(placeholder);
        input.parentNode.replaceChild(textNode, input);
    });
    
    // 获取清理后的文本
    let text = clone.textContent.trim();
    
    // 清理多余空白（将多个空格替换为单个空格）
    text = text.replace(/\s+/g, ' ').trim();
    
    // 移除题号（如果存在）
    text = text.replace(/^\d+[、.]\s*/, '');
    
    return text;
}
```

#### 方案2：使用 innerHTML 解析
```javascript
getQuestionText: function(element) {
    let titleBox = element.querySelector('.question-title-box .myEditorTxt');
    if (!titleBox) return '';
    
    // 获取 HTML 内容
    const html = titleBox.innerHTML;
    
    // 将输入框替换为占位符
    const cleanedHtml = html.replace(
        /<input[^>]*class="tk_input"[^>]*>/gi, 
        (match) => {
            const placeholder = match.match(/data-index="([^"]+)"/)?.[1] || '___';
            return placeholder;
        }
    );
    
    // 创建临时元素提取纯文本
    const temp = document.createElement('div');
    temp.innerHTML = cleanedHtml;
    let text = temp.textContent.trim();
    
    // 清理空白
    text = text.replace(/\s+/g, ' ').trim();
    text = text.replace(/^\d+[、.]\s*/, '');
    
    return text;
}
```

#### 方案3：增强填空题识别
```javascript
getQuestionText: function(element) {
    let titleBox = element.querySelector('.question-title-box .myEditorTxt');
    if (!titleBox) return '';
    
    // 检查是否是填空题（包含输入框）
    const hasTiankongInput = titleBox.querySelector('input.tk_input');
    
    if (hasTiankongInput) {
        // 填空题特殊处理
        const clone = titleBox.cloneNode(true);
        const inputs = clone.querySelectorAll('input.tk_input');
        
        inputs.forEach((input, index) => {
            // 使用下划线或索引作为占位符
            const placeholder = `[填空${index + 1}]`;
            const textNode = document.createTextNode(placeholder);
            input.parentNode.replaceChild(textNode, input);
        });
        
        let text = clone.textContent.trim();
        text = text.replace(/\s+/g, ' ').trim();
        text = text.replace(/^\d+[、.]\s*/, '');
        
        return text;
    }
    
    // 非填空题使用原有逻辑
    return titleBox.textContent.trim();
}
```

### 7. 调试建议

#### 添加日志查看提取的题目文本
```javascript
getQuestionText: function(element) {
    // ... 提取逻辑 ...
    
    if (result) {
        console.log('提取的题目文本:', result);
        console.log('题目文本长度:', result.length);
        console.log('包含输入框:', result.includes('<input') || element.querySelector('input.tk_input'));
    }
    
    return result;
}
```

#### 检查题目文本是否为空
```javascript
query: async function(questionItem) {
    let questionText = utils.getQuestionText(questionItem);
    
    // 添加详细日志
    if (!questionText || questionText.trim().length < 5) {
        console.warn('题目文本提取失败:', {
            questionId: utils.getQuestionId(questionItem),
            questionType: utils.getQuestionType(questionItem),
            rawHtml: questionItem.querySelector('.myEditorTxt')?.innerHTML,
            textContent: questionItem.querySelector('.myEditorTxt')?.textContent
        });
    }
    
    // ...
}
```

## 总结

**主要问题：**
1. 填空题输入框嵌入在题目文本中
2. 提取题目文本时可能包含输入框的空白或占位符
3. 导致题目文本格式不一致，API查询失败

**解决方向：**
- 改进 `getQuestionText` 函数，特殊处理填空题
- 将嵌入的输入框替换为占位符（如 `___` 或 `[填空]`）
- 清理多余空白，确保题目文本格式一致
- 添加日志记录，便于调试和排查问题

