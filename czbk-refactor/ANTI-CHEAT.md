# 反作弊机制绕过说明

## 📋 功能概述

平台可能会实施各种防作弊机制来限制用户操作，本模块可以解除这些限制，让你正常使用浏览器功能。

## 🔓 解除的限制

### 1. **复制粘贴限制**
- ✅ 允许 Ctrl+C 复制
- ✅ 允许 Ctrl+V 粘贴
- ✅ 允许 Ctrl+X 剪切
- ✅ 解除输入框的粘贴限制

### 2. **右键菜单限制**
- ✅ 允许右键点击
- ✅ 显示浏览器右键菜单
- ✅ 可以使用"检查元素"等功能

### 3. **文本选择限制**
- ✅ 允许选择页面文本
- ✅ 可以拖拽选择
- ✅ 双击选择单词

### 4. **输入框限制**
- ✅ 移除 readonly（只读）属性
- ✅ 移除 disabled（禁用）属性
- ✅ 允许粘贴到输入框
- ✅ 启用自动完成

### 5. **拖拽限制**
- ✅ 允许拖拽文件
- ✅ 允许拖拽文本
- ✅ 允许拖拽链接

### 6. **键盘快捷键**
- ✅ Ctrl+C（复制）
- ✅ Ctrl+V（粘贴）
- ✅ Ctrl+X（剪切）
- ✅ Ctrl+A（全选）
- ✅ Ctrl+Z（撤销）
- ✅ Ctrl+Y（重做）
- ✅ Ctrl+F（查找）

## 🚀 使用方法

### 自动启用（推荐）

脚本会在启动时自动解除所有限制，无需手动操作。

启动时会看到日志：
```
[System] ✓ 平台限制已解除
[AntiCheat] ✅ 所有限制已解除
```

### 手动控制

如果需要手动控制，可以在控制台使用：

```javascript
// 启用绕过
AutoAnswerSystem.enableAntiCheat();

// 禁用绕过（不推荐）
AutoAnswerSystem.disableAntiCheat();
```

## 🔍 工作原理

### 1. 事件拦截
```javascript
// 拦截并允许复制粘贴事件
document.addEventListener('copy', (e) => {
    e.stopImmediatePropagation();  // 阻止平台的监听器
}, true);  // 捕获阶段优先执行
```

### 2. 属性移除
```javascript
// 移除输入框限制
input.removeAttribute('readonly');
input.removeAttribute('disabled');
input.onpaste = null;  // 移除粘贴限制
```

### 3. CSS 覆盖
```javascript
// 强制允许文本选择
* {
    user-select: text !important;
}
```

### 4. 持续监控
```javascript
// 每秒检查并移除新增的限制
setInterval(() => {
    removeRestrictions();
}, 1000);
```

## ⚠️ 注意事项

### 1. 使用场景
- ✅ 学习和研究
- ✅ 提高答题效率
- ✅ 方便资料整理
- ❌ 不要用于作弊

### 2. 兼容性
- ✅ Chrome / Edge
- ✅ Firefox
- ✅ Safari
- ⚠️ 可能被部分平台检测

### 3. 检测风险
某些高级平台可能会检测：
- 修改了默认事件行为
- 移除了限制属性
- 使用了油猴脚本

**建议：**
- 正常使用，不要过度滥用
- 定期清除缓存和日志
- 不要在考试等重要场景使用

## 🛠️ 技术细节

### 事件优先级
```
捕获阶段（true） → 目标阶段 → 冒泡阶段（false）
        ↑
    我们的监听器优先执行
```

### MutationObserver
```javascript
// 监控DOM变化，实时移除新增的限制
const observer = new MutationObserver(() => {
    removeRestrictions();
});

observer.observe(document.body, {
    childList: true,    // 监控子节点变化
    subtree: true       // 监控所有后代节点
});
```

### stopImmediatePropagation
```javascript
// 阻止同一元素上其他监听器执行
e.stopImmediatePropagation();

// vs stopPropagation（只阻止冒泡）
e.stopPropagation();
```

## 📊 效果对比

| 功能 | 平台限制 | 绕过后 |
|------|---------|--------|
| 复制文本 | ❌ 禁止 | ✅ 允许 |
| 粘贴到输入框 | ❌ 禁止 | ✅ 允许 |
| 右键菜单 | ❌ 禁止 | ✅ 允许 |
| 选择文本 | ❌ 禁止 | ✅ 允许 |
| Ctrl+C | ❌ 无效 | ✅ 有效 |
| Ctrl+V | ❌ 无效 | ✅ 有效 |
| 拖拽文件 | ❌ 禁止 | ✅ 允许 |

## 🔧 调试

### 查看日志
打开浏览器控制台（F12），查看：
```
[AntiCheat] 解除平台限制...
[AntiCheat] 已解除复制粘贴限制
[AntiCheat] 已解除右键菜单限制
[AntiCheat] 已解除文本选择限制
[AntiCheat] 已解除拖拽限制
[AntiCheat] 已移除输入框限制
[AntiCheat] ✅ 所有限制已解除
```

### 测试方法
1. **测试复制**：选择文本 → Ctrl+C → 应该成功
2. **测试粘贴**：在输入框 → Ctrl+V → 应该成功
3. **测试右键**：右键点击 → 应该显示菜单
4. **测试选择**：拖拽鼠标 → 应该选中文本

## 📝 常见问题

### Q1: 为什么有些输入框还是不能粘贴？
**A:** 可能是动态添加的，等待1秒后会自动解除。或者手动刷新页面。

### Q2: 会不会被平台检测到？
**A:** 有可能，但风险较低。我们使用的都是正常的浏览器API。

### Q3: 可以关闭这个功能吗？
**A:** 可以，但不推荐。如果需要，请修改 `main.js` 注释掉相关代码。

### Q4: 为什么右键菜单还是被禁止？
**A:** 检查是否有其他扩展干扰。尝试禁用其他扩展后重试。

## 🎯 最佳实践

### 1. 正常使用
```
✅ 复制题目到笔记
✅ 粘贴答案到输入框
✅ 使用浏览器开发工具调试
```

### 2. 避免滥用
```
❌ 批量复制整个网站内容
❌ 恶意修改页面数据
❌ 破坏网站正常功能
```

### 3. 合理场景
```
✅ 学习资料整理
✅ 笔记记录
✅ 提高学习效率
```

## 📚 相关资料

- [MDN - Event.stopImmediatePropagation()](https://developer.mozilla.org/zh-CN/docs/Web/API/Event/stopImmediatePropagation)
- [MDN - MutationObserver](https://developer.mozilla.org/zh-CN/docs/Web/API/MutationObserver)
- [MDN - addEventListener](https://developer.mozilla.org/zh-CN/docs/Web/API/EventTarget/addEventListener)

## 📄 许可证

本功能仅供学习和研究使用，请遵守相关法律法规和平台规定。
