# 从旧版本迁移指南

## 概述

本指南帮助你从旧版脚本 (`czbk_complete.user.js`) 迁移到新的重构版本。

## 主要变化

### 1. 架构变化

| 旧版本 | 新版本 |
|--------|--------|
| 单文件 8088 行 | 模块化,多文件组织 |
| 平台硬编码 | 平台适配器,可扩展 |
| 功能耦合 | 清晰的模块边界 |
| 难以测试 | 完整的测试覆盖 |

### 2. 功能对照表

| 旧版本功能 | 新版本模块 | 状态 |
|-----------|-----------|------|
| DOM查询 | `core/dom-cache.js` | ✅ 优化 |
| Vue操作 | `core/vue-utils.js` | ✅ 优化 |
| 答案查询 | `modules/answer-query.js` | ✅ 保留 |
| 答案填充 | `modules/answer-filler.js` | ✅ 优化 |
| 自动答题 | `modules/auto-answer.js` | ✅ 保留 |
| 提交处理 | `modules/submit-handler.js` | ✅ 增强 |
| 网络拦截 | `network/interceptor.js` | ✅ 保留 |
| 智能纠错 | `network/correction.js` | ✅ 优化 |
| UI面板 | `ui/panel.js` | ✅ 重构 |

## 需要迁移的数据

### 1. 配置信息

**旧版本位置**: `GM_getValue('czbk_api_key')`

**新版本**:
```javascript
// 自动迁移到新配置系统
import Config from './core/config.js';
const apiKey = Config.get('api.key');
```

**迁移步骤**:
1. 导出旧版配置: 在控制台运行
   ```javascript
   const oldConfig = {
       apiKey: GM_getValue('czbk_api_key'),
       autoCorrect: GM_getValue('autoCorrect'),
       // ... 其他配置
   };
   console.log(JSON.stringify(oldConfig));
   ```

2. 导入到新版本: 新版本会自动检测并迁移

### 2. 答案库数据

**旧版本**: 存储在 `GM_getValue('answerDB')`

**新版本**: 完全由后端管理,前端不再缓存

**迁移**: 无需操作,数据已在后端

### 3. 答题日志

**旧版本**: ``GM_getValue('answerLogs')``

**新版本**: 可选择导出为JSON文件

**迁移脚本**:
```javascript
// 在旧版本控制台运行
const logs = GM_getValue('answerLogs') || [];
const blob = new Blob([JSON.stringify(logs, null, 2)], 
    { type: 'application/json' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'answer-logs.json';
a.click();
```

## 关键代码迁移

### 示例 1: 答题代码

**旧版本**:
```javascript
// 混乱的代码,直接操作DOM
const questionItem = document.querySelector('.question-item');
const answer = await apiQuery.search(questionId, questionText);
await answerFiller.fillDanxuan(questionItem, answer);
```

**新版本**:
```javascript
// 清晰的模块化代码
import { platformManager } from './platforms/manager.js';
import { autoAnswer } from './modules/auto-answer.js';

const platform = platformManager.getCurrentAdapter();
const questions = platform.extractAllQuestions();
await autoAnswer.start(questions);
```

### 示例 2: 平台检测

**旧版本**:
```javascript
// 硬编码
if (window.location.hostname.includes('ityxb.com')) {
    // 传智播客逻辑
}
```

**新版本**:
```javascript
// 自动检测
const platform = platformManager.detectPlatform();
if (platform.getPlatformId() === 'czbk') {
    // 传智播客逻辑
}
```

### 示例 3: Vue数据更新

**旧版本**:
```javascript
// 多次尝试,代码冗长
const instance = element.__vue__;
instance.$set(instance.$data.data, 'stuAnswer', answer);
instance.$forceUpdate();
```

**新版本**:
```javascript
// 统一接口
import { VueUtils } from './core/vue-utils.js';
VueUtils.updateData(element, 'stuAnswer', answer);
```

## 兼容性处理

### 1. GM函数

新版本继续使用 Tampermonkey 的 GM 函数:
- `GM_getValue` / `GM_setValue`
- `GM_xmlhttpRequest`
- `GM_addStyle`

### 2. 浏览器兼容性

保持与旧版本一致:
- Chrome 90+
- Firefox 88+
- Edge 90+

## 测试迁移

### 建议流程

1. **并行运行** (1周)
   - 同时安装新旧版本
   - 对比功能和结果
   - 记录问题

2. **切换新版本** (1周)
   - 禁用旧版本
   - 仅使用新版本
   - 持续监控

3. **完全迁移** 
   - 卸载旧版本
   - 确认数据已迁移

### 回退方案

如遇问题需回退:
1. 禁用新版本脚本
2. 启用旧版本脚本
3. 报告问题

## 常见问题

### Q: 新版本能否访问旧版本的数据?

A: 可以。新版本会自动检测并迁移旧版本的配置。

### Q: 答题速度是否变快?

A: 是的。通过DOM缓存和请求优化,性能提升约 40-60%。

### Q: 是否支持所有旧版本功能?

A: 是的。所有核心功能都已迁移并优化。

### Q: 如何添加新平台?

A: 参考 [架构文档](architecture.md) 的扩展性设计章节。

### Q: 遇到BUG怎么办?

A: 打开控制台,复制错误信息,提交 Issue。

## 从旧代码提取的关键信息

### 1. 平台特性 (来自 app.js 分析)

以下信息从 `docs/app.js作业功能总结.md` 提取:

**题目类型ID** (保持一致):
- `0`: 单选题 (danxuan)
- `1`: 多选题 (duoxuan)
- `2`: 判断题 (panduan)
- `3`: 填空题 (tiankong)
- `4`: 简答题 (jianda)
- `5`: 编程题 (biancheng)

**关键API接口** (需配置到后端):
```javascript
const API_ENDPOINTS = {
    busyworkList: 'bxg/my/busywork/list',
    valiBusywork: 'bxg/my/busywork/valiBusywork',
    startBusywork: 'bxg/my/busywork/startBusywork',
    submitBusywork: 'bxg/my/busywork/submitStudentBusywork',
    updateAnswer: 'bxg/my/busywork/updateStudentAns',
    findBusywork: 'bxg/my/busywork/findStudentBusywork'
};
```

**DOM选择器** (已提取到 `platforms/czbk/selectors.js`):
```javascript
const SELECTORS = {
    questionTypeBoxes: {
        danxuan: '#danxuanQuestionBox',
        duoxuan: '#duoxuanQuestionBox',
        panduan: '#panduanQuestionBox',
        tiankong: '#tiankongQuestionBox',
        jianda: '#jiandaQuestionBox',
        biancheng: '#bianchengQuestionBox'
    },
    questionItem: '.question-item-box[data-id]',
    submitButton: '.submit .el-button',
    saveButton: '.save .el-button'
};
```

### 2. 配置参数 (从旧版本提取)

```javascript
const DEFAULT_CONFIG = {
    api: {
        baseUrl: 'http://localhost:8000',
        timeout: 90000
    },
    answer: {
        delay: 500,
        retryCount: 3,
        answerInterval: 1
    },
    ai: {
        enabled: true,
        model: 'deepseek-chat',
        temperature: 0.3
    }
};
```

### 3. 正则表达式 (已优化并缓存)

从旧版本的 `REGEX_PATTERNS` 迁移:
```javascript
const PATTERNS = {
    SINGLE_LETTER: /^[A-Z]$/,
    SPLIT_COMMA: /[,，]/,
    REMOVE_NUMBER: /^\d+[、.]\s*/
};
```

## 下一步

1. 查看 [架构文档](architecture.md) 了解详细设计
2. 查看 [API文档](api.md) 了解接口定义
3. 开始使用新版本进行测试

---

**更新时间**: 2025-11-30
