# 架构设计文档

## 整体架构

### 设计原则

1. **平台无关**: 核心逻辑与平台解耦，通过适配器模式支持多平台
2. **模块化**: 功能按职责拆分为独立模块
3. **可测试**: 所有模块都支持单元测试
4. **可扩展**: 新增平台或功能无需修改核心代码

### 架构图

```
┌─────────────────────────────────────────────────────┐
│                    Main Entry                        │
│                   (main.js)                          │
└────────────────────┬────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         │  Platform Manager      │
         │  - 检测当前平台         │
         │  - 加载对应适配器       │
         └───────────┬───────────┘
                     │
     ┌───────────────┼───────────────┐
     │               │               │
┌────▼─────┐   ┌────▼─────┐   ┌────▼─────┐
│  CZBK    │   │ Chaoxing │   │  Future  │
│ Adapter  │   │ Adapter  │   │ Adapters │
└────┬─────┘   └────┬─────┘   └────┬─────┘
     │              │              │
     └──────────────┼──────────────┘
                    │
         ┌──────────▼──────────┐
         │   Answer System     │
         │   - 答案查询        │
         │   - 答案填充        │
         │   - 自动答题        │
         └──────────┬──────────┘
                    │
     ┌──────────────┼──────────────┐
     │              │              │
┌────▼─────┐ ┌─────▼────┐  ┌─────▼────┐
│ Network  │ │   UI     │  │  Core    │
│ Module   │ │ Module   │  │ Utils    │
└──────────┘ └──────────┘  └──────────┘
```

## 核心模块

### 1. Core (核心库)

**职责**: 提供基础工具和缓存功能

**文件结构**:
```
src/core/
├── config.js          # 配置管理
├── constants.js       # 常量定义
├── dom-cache.js       # DOM查询缓存
├── vue-utils.js       # Vue工具库
└── utils.js           # 通用工具函数
```

**关键类**:
- `DOMCache`: DOM查询缓存管理器
- `VueUtils`: Vue实例操作工具
- `Config`: 配置管理器

### 2. Platforms (平台适配器)

**职责**: 封装平台特定的DOM操作和数据提取逻辑

**文件结构**:
```
src/platforms/
├── base.js            # 平台适配器基类
├── manager.js         # 平台管理器
├── czbk/
│   ├── adapter.js     # 传智播客适配器
│   ├── selectors.js   # DOM选择器定义
│   └── extractor.js   # 数据提取器
└── chaoxing/
    └── adapter.js     # 超星学习通适配器(待实现)
```

**平台适配器接口**:
```javascript
class PlatformAdapter {
    // 平台识别
    getPlatformId()
    getPlatformName()
    matchPage()
    
    // 数据提取
    extractQuestion(element)
    extractAllQuestions()
    getQuestionType(element)
    
    // 答案填充
    fillAnswer(element, answer, type)
    
    // 页面操作
    clickSubmit()
    clickSave()
}
```

### 3. Modules (功能模块)

**职责**: 实现核心业务逻辑

**文件结构**:
```
src/modules/
├── answer-filler.js       # 答案填充器
├── answer-query.js        # 答案查询
├── auto-answer.js         # 自动答题
├── submit-handler.js      # 提交处理
├── busywork-list.js       # 作业列表处理
└── anti-cheat-bypass.js   # 防作弊绕过
```

**关键类**:
- `AnswerFiller`: 统一的答案填充接口
- `AnswerQuery`: 答案查询(云端API + AI)
- `AutoAnswer`: 自动答题流程控制
- `SubmitHandler`: 提交和保存处理

### 4. Network (网络模块)

**职责**: 处理所有网络请求

**文件结构**:
```
src/network/
├── api-client.js      # API客户端
├── interceptor.js     # 网络拦截器
├── correction.js      # 智能纠错
└── request-queue.js   # 请求队列管理
```

**功能**:
- 统一的API请求接口
- 请求去重
- 失败重试
- 智能纠错

### 5. UI (用户界面)

**职责**: 用户交互界面

**文件结构**:
```
src/ui/
├── panel.js           # 控制面板
├── result-display.js  # 结果展示
└── styles.js          # 样式定义
```

## 数据流

### 答题流程

```
1. 用户触发答题
   ↓
2. PlatformManager 检测平台
   ↓
3. 使用对应 Adapter 提取题目
   ↓
4. AnswerQuery 查询答案 (云端API/AI)
   ↓
5. AnswerFiller 填充答案
   ↓
6. 触发平台保存事件
   ↓
7. SubmitHandler 处理提交
```

### 纠错流程

```
1. NetworkInterceptor 拦截批改结果
   ↓
2. CorrectionStrategy 选择纠错策略
   ↓
3. AnswerQuery 查询新答案
   ↓
4. AnswerFiller 重新填充
   ↓
5. 验证结果
```

## 扩展性设计

### 添加新平台

1. 在 `src/platforms/` 下创建新目录
2. 实现 `PlatformAdapter` 接口
3. 在 `PlatformManager` 中注册
4. 无需修改核心代码

示例:
```javascript
// src/platforms/new-platform/adapter.js
import PlatformAdapter from '../base.js';

export default class NewPlatformAdapter extends PlatformAdapter {
    getPlatformId() { return 'new-platform'; }
    matchPage() { 
        return window.location.hostname.includes('example.com'); 
    }
    // ... 实现其他方法
}
```

### 添加新功能模块

1. 在 `src/modules/` 下创建新文件
2. 导出功能类或函数
3. 在 `main.js` 中引入和初始化

## 性能优化

### 1. DOM缓存策略

- 使用 Map 缓存查询结果
- TTL 为 5 秒,自动清理过期缓存
- 支持手动清理

### 2. 请求优化

- 请求去重: 相同请求只发送一次
- 批量查询: 一次请求查询多个题目
- 并发控制: 限制同时发送的请求数

### 3. Vue更新优化

- 批量更新: 合并多次 `$forceUpdate`
- 最小化DOM操作: 只更新变化的部分

## 测试策略

### 单元测试

- 测试所有工具函数
- 测试平台适配器的数据提取
- 测试答案填充逻辑

### 集成测试

- 测试完整答题流程
- 测试纠错流程
- 测试不同平台的兼容性

### E2E测试

- 使用 Puppeteer 或 Playwright
- 模拟真实用户操作
- 验证UI交互

## 安全考虑

1. **输入验证**: 验证所有外部输入(API响应、用户输入)
2. **XSS防护**: 对HTML内容进行转义
3. **CSRF防护**: 验证请求来源
4. **数据加密**: 敏感数据(API Key)加密存储

## 部署方案

### 开发环境

```bash
npm run dev  # 实时编译,自动重载
```

### 生产构建

```bash
npm run build  # 构建压缩版本
npm run build:userscript  # 生成油猴脚本
```

### 发布流程

1. 更新版本号
2. 运行测试
3. 构建生产版本
4. 生成油猴脚本
5. 发布到 GreasyFork

## 后续优化方向

1. **TypeScript迁移**: 增加类型安全
2. **WebAssembly**: 性能关键代码用WASM实现
3. **Service Worker**: 离线缓存和后台同步
4. **PWA**: 构建渐进式Web应用

---

**版本**: 1.0  
**更新时间**: 2025-11-30
