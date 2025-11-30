# 懒羊羊自动化平台 - 构建指南

## 🚀 快速开始

### 1. 安装依赖

```bash
cd e:\Dev\czbk\czbk-refactor
npm install
```

### 2. 开发模式

```bash
npm run dev
```

这将启动 Webpack 开发模式with watch，每次修改代码后自动重新构建。

输出文件: `dist/lazy-sheep-auto-answer.dev.user.js`

### 3. 生产构建

```bash
npm run build
```

生成优化后的生产版本。

输出文件: `dist/lazy-sheep-auto-answer.user.js`

---

## 📦 构建输出

构建完成后，在 `dist/` 目录下会生成:

- **开发版**: `lazy-sheep-auto-answer.dev.user.js` (包含 source map)
- **生产版**: `lazy-sheep-auto-answer.user.js` (优化压缩)

---

## 🔧 安装到浏览器

### 方法1: 直接安装

1. 安装 Tampermonkey 扩展
2. 打开 `dist/lazy-sheep-auto-answer.user.js`
3. Tampermonkey 会自动识别并提示安装

### 方法2: 从文件安装

1. 打开 Tampermonkey 管理面板
2. 点击 "实用工具" → "从文件导入"
3. 选择 `dist/lazy-sheep-auto-answer.user.js`

---

## 🛠️ 开发工作流

### 推荐流程

1. **修改源代码** 
   ```
   src/core/xxx.js
   src/modules/xxx.js
   ...
   ```

2. **自动重新构建** (开发模式自动进行)
   ```bash
   npm run dev  # 在后台运行
   ```

3. **在浏览器中重载脚本**
   - Tampermonkey会检测到文件变化
   - 手动重载页面测试

4. **测试功能**
   - 访问 https://stu.ityxb.com
   - 打开控制台查看日志

### 调试技巧

1. **查看构建日志**
   ```bash
   npm run dev  # 观察 Webpack 输出
   ```

2. **检查生成的文件**
   ```bash
   # Windows
   type dist\lazy-sheep-auto-answer.dev.user.js | more
   
   # 或在编辑器中打开
   code dist\lazy-sheep-auto-answer.dev.user.js
   ```

3. **浏览器控制台**
   ```javascript
   // 全局可用
   AutoAnswerSystem
   PlatformManager
   
   // 示例
   const platform = PlatformManager.getCurrentAdapter();
   console.log(platform.getPlatformName());
   ```

---

## 📋 构建配置

### Webpack配置 (`config/webpack.config.js`)

- **入口**: `src/main.js`
- **输出**: `dist/*.user.js`
- **Babel**: ES6+ 转译
- **别名**: 
  - `@` → `src/`
  - `@core` → `src/core/`
  - `@modules` → `src/modules/`
  - 等等

### 自定义构建

修改 `config/webpack.config.js` 可以:

- 添加新的别名
- 修改输出文件名
- 添加插件
- 调整优化选项

---

## 🧪 测试

### 运行测试

```bash
npm test
```

### 观察模式

```bash
npm run test:watch
```

---

## 🎨 代码规范

### ESLint检查

```bash
npm run lint
```

### Prettier格式化

```bash
npm run format
```

---

## ⚠️ 常见问题

### Q: 构建失败?

**检查Node版本**:
```bash
node --version  # 需要 >= 16.0.0
```

**清理并重新安装**:
```bash
rm -rf node_modules package-lock.json
npm install
```

### Q: 脚本无法在浏览器中加载?

**检查userscript头部**:
- 打开 `dist/*.user.js`
- 确认开头有 `// ==UserScript==` 标记
- 检查 `@match` 规则是否正确

### Q: 修改代码后不生效?

**确认开发模式正在运行**:
```bash
npm run dev  # 应该看到 "webpack watching..."
```

**手动重新构建**:
```bash
npm run build
```

**在浏览器中硬刷新**:
- Chrome: `Ctrl + Shift + R`
- Firefox: `Ctrl + F5`

---

## 📁 项目结构

```
czbk-refactor/
├── src/                  # 源代码
├── config/               # 构建配置 ✅
│   ├── webpack.config.js
│   ├── babel.config.js
│   └── userscript-header.js
├── dist/                 # 构建输出
├── package.json          # 依赖配置 ✅
└── README.md
```

---

**构建系统版本**: 1.0  
**最后更新**: 2025-11-30
