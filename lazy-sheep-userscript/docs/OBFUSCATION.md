# 代码混淆配置说明

## 🔒 混淆功能

生产构建时会自动启用代码混淆，保护源代码不被轻易分析。

## 🛠️ 混淆选项

### 当前配置

```javascript
{
  // 字符串数组旋转
  rotateStringArray: true,
  
  // 字符串数组化
  stringArray: true,
  stringArrayThreshold: 0.75,
  stringArrayEncoding: ['base64'],
  
  // 控制流扁平化 (降低代码可读性)
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  
  // 死代码注入
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  
  // 标识符混淆 (变量名混淆为十六进制)
  identifierNamesGenerator: 'hexadecimal',
  
  // 保留的标识符 (Tampermonkey API)
  reservedNames: [
    'GM_getValue',
    'GM_setValue',
    'GM_xmlhttpRequest',
    // ...等
  ],
  
  // 自我防御
  selfDefending: true,
  
  // 拆分字符串
  splitStrings: true,
  splitStringsChunkLength: 10,
  
  // 转换对象键
  transformObjectKeys: true
}
```

### 效果对比

**原始代码**:
```javascript
function autoAnswer() {
    const questions = platform.extractAllQuestions();
    for (const q of questions) {
        await fillAnswer(q.element, q.answer);
    }
}
```

**混淆后**:
```javascript
var _0x1a2b3c=['Z3VIc...','aW5pdA...'];
function _0x4d5e6f(_0x7a8b9c,_0x0d1e2f){
    return _0x1a2b3c[_0x7a8b9c-=0x0];
}
// 代码变得难以阅读...
```

## 📋 混淆级别调整

### 轻度混淆 (推荐，平衡性能)

```javascript
{
  stringArray: true,
  stringArrayThreshold: 0.5,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  identifierNamesGenerator: 'hexadecimal'
}
```

### 中度混淆 (当前配置)

```javascript
{
  stringArray: true,
  stringArrayThreshold: 0.75,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4
}
```

### 重度混淆 (最强保护，性能影响大)

```javascript
{
  stringArray: true,
  stringArrayThreshold: 1.0,
  stringArrayEncoding: ['base64', 'rc4'],
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 1.0,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 1.0,
  debugProtection: true
}
```

## ⚠️ 注意事项

### 1. 性能影响

混淆会增加代码体积和运行时开销：
- 轻度混淆: +10-20% 体积
- 中度混淆: +30-50% 体积  
- 重度混淆: +50-100% 体积

### 2. 调试困难

混淆后的代码难以调试，建议：
- 开发时使用 `npm run dev` (不混淆)
- 只在生产构建时混淆

### 3. 保留的名称

必须保留以下名称，否则脚本无法运行：
- `GM_*` 函数 (Tampermonkey API)
- `unsafeWindow`
- 其他全局API

## 🔧 自定义配置

编辑 `config/webpack.config.js`:

```javascript
new WebpackObfuscator({
  // 修改这里的配置
  stringArrayThreshold: 0.5,  // 降低混淆程度
  controlFlowFlattening: false, // 关闭控制流扁平化
  // ...
}, [])
```

## 📊 构建对比

| 模式 | 是否混淆 | 文件大小 | 可读性 |
|------|---------|---------|-------|
| 开发 | ❌ | ~200KB | ✅ 高 |
| 生产 | ✅ | ~300KB | ❌ 低 |

---

**更新**: 2025-11-30  
**版本**: 1.0
