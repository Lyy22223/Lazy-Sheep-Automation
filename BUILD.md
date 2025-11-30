# 懒羊羊自动化平台 - 传智播客答题脚本构建说明

## 构建工具

本脚本使用 Node.js + Terser 进行生产环境构建，支持：
- ✅ 自动移除所有日志调用（utils.log、console.log 等）
- ✅ 代码混淆和压缩（中等级别，保护核心逻辑）
- ✅ 保留 UserScript 元数据头
- ✅ 保留必要的全局 API（GM_*、window、document 等）

## 安装依赖

```bash
npm install
```

## 构建命令

### 生产版本（移除日志 + 混淆）
```bash
npm run build
```

### 开发版本（仅压缩，保留日志）
```bash
npm run build:dev
```

## 输出文件

构建完成后，生产版本将输出到：
```
dist/czbk_complete.prod.user.js
```

## 构建特性

### 日志移除
- 移除所有 `utils.log()` 调用
- 移除所有 `console.log()`、`console.debug()`、`console.info()` 调用
- 保留 `console.error()` 和 `console.warn()`（用于错误处理）

### 代码混淆
- **变量名混淆**：局部变量和函数名会被混淆
- **代码压缩**：移除空白、注释，优化代码结构
- **保护机制**：保留 UserScript API 和页面 API，确保功能正常

### 混淆级别
- **中等级别**：平衡代码大小和可读性
- **不混淆顶级作用域**：避免破坏 UserScript 环境
- **保留关键 API**：GM_*、window、document、Vue、ElementPlus 等

## 注意事项

1. **首次构建前**：确保已安装 Node.js (>=14.0.0)
2. **依赖安装**：运行 `npm install` 安装 Terser
3. **测试验证**：构建后建议在 Tampermonkey 中测试功能是否正常
4. **版本管理**：建议将 `dist/` 目录添加到 `.gitignore`

## 品牌标识

所有配置和描述均包含"懒羊羊自动化平台"品牌标识：
- 脚本名称：懒羊羊自动化平台 - 传智播客答题脚本
- 脚本描述：强调"传智播客专用"、"支持率最高"、"答题准确率最高"
- 作者信息：懒羊羊自动化平台

## 技术支持

懒羊羊自动化平台出品 - 传智播客专用智能答题脚本，支持率最高！
