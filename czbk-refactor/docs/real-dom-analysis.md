# 实际DOM结构参考

> 从真实页面提取的DOM结构信息，用于开发和测试

## 数据来源

- **来源文件**: `test/实际DOM结构信息`
- **提取时间**: 测试期间
- **题目数量**: 91题
- **选项数量**: 194个

## 关键发现

### 1. 题目ID格式

所有题目都使用 **32位UUID** 作为ID，格式示例：
```
5ae2df26223742f083202749dcb7769a
7738be01df8d4fcfa58bc36e8b02722b
```

这个ID可以用 `data-id` 属性获取。

### 2. Vue实例状态

- 所有91个题目容器都有Vue实例 (标记为"存在")
- Vue根实例: `undefined` (可能在父级元素)
- 需要向上查找Vue实例

### 3. 选择题选项结构

- 总共194个选项 (平均每题约2.1个选项)
- 包含单选、多选、判断题的选项

### 4. KindEditor实例

发现3个KindEditor实例 (索引: 0, 1, 2)
- 用于简答题的富文本编辑
- 需要特殊处理

## 对开发的影响

### ✅ 已在重构项目中考虑

1. **题目ID提取** → `platforms/czbk/extractor.js`
   ```javascript
   getQuestionId(element) {
       return element.dataset.id || 
              element.getAttribute('data-id');
   }
   ```

2. **Vue实例查找** → `core/vue-utils.js`
   ```javascript
   // 已实现向上查找10层
   getInstance(element) {
       for (let i = 0; i < 10 && el; i++) {
           if (el.__vue__) return el.__vue__;
           // ...
       }
   }
   ```

3. **KindEditor处理** → 待实现
   需要在 `modules/answer-filler.js` 中添加富文本编辑器支持

### 📝 需要添加的内容

基于这个实际数据，我们需要：

1. **创建测试用例**
   ```javascript
   // tests/fixtures/real-dom-data.js
   export const REAL_QUESTION_IDS = [
       '5ae2df26223742f083202749dcb7769a',
       '7738be01df8d4fcfa58bc36e8b02722b',
       // ... 91个真实ID
   ];
   ```

2. **KindEditor适配器**
   ```javascript
   // src/modules/answer-filler.js
   fillJianda(questionItem, answer) {
       // 检查是否使用KindEditor
       const kindEditor = this.findKindEditor(questionItem);
       if (kindEditor) {
           kindEditor.html(answer);
       } else {
           // 使用普通textarea
       }
   }
   ```

3. **选项结构验证**
   用194个选项数据验证选择器准确性

## 使用建议

### 开发阶段

1. **复制到测试目录**
   ```bash
   copy test\实际DOM结构信息 czbk-refactor\tests\fixtures\
   ```

2. **创建测试数据文件**
   解析这个文件，生成结构化的测试数据

3. **编写集成测试**
   使用真实ID测试DOM查询和数据提取

### 调试阶段

当遇到问题时，对比：
- 实际结构 vs 我们的选择器
- 实际Vue实例 vs 我们的查找逻辑
- 实际选项数量 vs 我们的提取结果

## 下一步行动

**立即行动 (优先级高)**:
1. ✅ 将此文件移动到 `czbk-refactor/tests/fixtures/`
2. 📝 创建 `tests/fixtures/real-dom-data.js` 解析这些数据
3. 📝 在 `platforms/czbk/selectors.js` 中验证选择器

**后续行动**:
4. 📝 添加KindEditor支持到 `answer-filler.js`
5. 📝 编写基于真实数据的集成测试

## 参考

- 题目容器选择器: `.question-item-box[data-id]`
- Vue实例查找: 向上遍历最多10层
- KindEditor: 通过 `textarea.ke-edit-textarea` 或 `iframe.ke-edit-iframe` 识别

---

**更新**: 2025-11-30  
**状态**: 待整合到测试数据
