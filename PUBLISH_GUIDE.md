# 📤 发布指南

懒羊羊自动化平台发布到油猴脚本托管平台的完整流程

---

## ✅ 发布前检查清单

### 1. 代码检查
- [x] 修改默认API地址: `http://39.104.15.174:8000`
- [x] 设置测试API Key: `sk-test-lazy-sheep-dev-2024`
- [x] 更新版本号（见下方）
- [ ] 测试所有功能
- [ ] 检查控制台无错误
- [ ] 确认代码已提交

### 2. 文档准备
- [x] 用户说明文档: `RELEASE_README.md`
- [x] 后端部署文档: `lazy-sheep-backend/DEPLOYMENT.md`
- [ ] 更新 CHANGELOG.md

### 3. 后端部署
- [ ] 在服务器 `39.104.15.174` 上部署后端
- [ ] 配置 PostgreSQL 数据库
- [ ] 配置 Redis 缓存
- [ ] 创建测试API Key
- [ ] 测试API连接
- [ ] 配置防火墙开放8000端口

---

## 🔢 更新版本号

### 1. 修改 package.json

```bash
cd lazy-sheep-userscript
vim package.json
```

更新版本号：
```json
{
  "version": "2.0.0",
  ...
}
```

### 2. 修改油猴脚本头

```bash
vim config/userscript-header.js
```

更新以下字段：
```javascript
// @version      2.0.0
// @description  在线学习平台自动化助手，支持自动答题、自动刷课、智能纠错。目前对传智播客支持最完善，持续扩展更多平台
// @author       Lazy Sheep Team
// @match        https://*.itcast.cn/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        unsafeWindow
```

---

## 📦 打包脚本

### 1. 安装依赖（如果还没有）

```bash
cd lazy-sheep-userscript
npm install
```

### 2. 构建生产版本

```bash
npm run build
```

构建完成后，打包文件位于：
- `dist/czbk-answer.user.js` - 主脚本文件

### 3. 验证打包文件

检查文件：
```bash
# Windows
type dist\czbk-answer.user.js | more

# 检查文件大小
dir dist\czbk-answer.user.js
```

确认：
- ✅ 文件头包含正确的元数据
- ✅ 版本号正确
- ✅ @match 规则正确
- ✅ 代码已压缩/美化

---

## 🌐 发布到 Greasy Fork

### 1. 注册账号

访问 [Greasy Fork](https://greasyfork.org/) 并注册账号

### 2. 创建新脚本

1. 登录后点击 **「发布你编写的脚本」**
2. 填写脚本信息：

#### 基本信息
- **名称（中文）**: 懒羊羊自动化平台
- **名称（英文）**: Lazy Sheep Automation Platform
- **描述（中文）**: 在线学习平台自动化助手，支持自动答题、自动刷课、智能纠错。云端题库+AI答题双重保障，一键完成试卷/作业！目前对传智播客支持最完善，持续扩展更多平台。
- **描述（英文）**: Online learning platform automation assistant. Features: auto answer, auto course, smart correction. Cloud database + AI powered! Currently best support for CZBK, expanding to more platforms.

#### 代码
- 粘贴 `dist/czbk-answer.user.js` 的完整内容

#### 附加信息
- **版本号**: 2.0.0
- **许可证**: MIT
- **兼容性**: Tampermonkey 4.0+

#### 截图（可选但推荐）
准备以下截图：
1. 悬浮按钮界面
2. 控制面板界面
3. 答题进度界面
4. 刷课功能界面
5. 设置页面

### 3. 添加详细说明

在 **「附加信息」** 标签页添加：

复制 `RELEASE_README.md` 的内容到说明区域

### 4. 提交审核

点击 **「发布脚本」** 提交审核

审核通过后，脚本将获得一个URL：
```
https://greasyfork.org/scripts/[你的脚本ID]
```

---

## 🔄 更新脚本

### 1. 修改代码并构建

```bash
cd lazy-sheep-userscript
# 修改代码...
npm run build
```

### 2. 更新版本号

记得同时更新：
- `package.json` 的 `version`
- `userscript-header.js` 的 `@version`

### 3. 在 Greasy Fork 更新

1. 登录 Greasy Fork
2. 进入你的脚本管理页面
3. 点击 **「编辑」**
4. 更新代码内容
5. 填写 **「版本更新说明」**
6. 提交更新

---

## 🚀 后端部署流程

### 1. 连接服务器

```bash
ssh root@39.104.15.174
```

### 2. 上传代码

**使用 SCP 上传**
```bash
# 在本地执行
scp -r lazy-sheep-backend root@39.104.15.174:/opt/
```

### 3. 按照部署文档操作

参考 `lazy-sheep-backend/DEPLOYMENT.md` 完整部署：

1. 安装依赖（Python, PostgreSQL, Redis）
2. 配置环境变量
3. 初始化数据库
4. 创建测试API Key
5. 启动服务
6. 配置防火墙
7. 测试连接

### 4. 验证部署

```bash
# 测试API连接
curl http://39.104.15.174:8000/health

# 测试搜索API
curl -X POST http://39.104.15.174:8000/api/search \
  -H "Content-Type: application/json" \
  -H "X-API-Key: sk-test-lazy-sheep-dev-2024" \
  -d '{
    "questionId": "test",
    "questionContent": "测试题目",
    "type": "0",
    "platform": "czbk"
  }'
```

---

## 📝 发布后工作

### 1. 更新文档链接

在 `RELEASE_README.md` 中更新：
- Greasy Fork 安装链接

### 2. 监控和反馈

- 关注 Greasy Fork 的用户反馈
- 查看服务器日志
- 收集用户使用数据
- 及时回复用户评论

---

## 🛡️ 安全注意事项

### 测试API Key 管理

`sk-test-lazy-sheep-dev-2024` 是公开的测试密钥：

**限制设置**：
- 每日请求配额: 10000次
- 单IP限制: 100次/小时
- 功能限制: 仅基础查询和AI答题

**监控**：
```sql
-- 查看使用情况
SELECT COUNT(*) as request_count, 
       DATE(created_at) as date
FROM api_requests 
WHERE api_key = 'sk-test-lazy-sheep-dev-2024'
GROUP BY DATE(created_at)
ORDER BY date DESC
LIMIT 30;
```

**如果滥用**：
1. 添加更严格的限流
2. 要求用户申请个人API Key
3. 临时禁用公开密钥

### 防止恶意使用

在后端添加保护：
```python
# rate limiting
# IP黑名单
# 请求签名验证
# 内容安全检查
```

---

## 📊 发布检查表

发布前最后检查：

- [ ] ✅ 版本号已更新（2.0.0）
- [ ] ✅ API地址正确（39.104.15.174:8000）
- [ ] ✅ API Key已配置（sk-test-lazy-sheep-dev-2024）
- [ ] ✅ 后端服务已部署
- [ ] ✅ 后端服务正常运行
- [ ] ✅ 数据库已初始化
- [ ] ✅ 测试API Key已创建
- [ ] ✅ 防火墙已配置
- [ ] ✅ 脚本已构建（npm run build）
- [ ] ✅ 脚本文件已验证
- [ ] ✅ 说明文档已准备
- [ ] ✅ 截图已准备
- [ ] ✅ 功能已测试
- [ ] ⬜ 发布到 Greasy Fork
- [ ] ⬜ 更新文档链接

---

## 🔗 相关信息

**生产环境**：
- 后端API: http://39.104.15.174:8000
- API文档: http://39.104.15.174:8000/docs
- 脚本安装: https://greasyfork.org/scripts/[待更新]

**文档**：
- 用户文档: `RELEASE_README.md`
- 部署文档: `lazy-sheep-backend/DEPLOYMENT.md`
- 更新日志: `CHANGELOG.md`

---

## 💡 发布建议

### 最佳发布时间
- **工作日下午**: 审核较快
- **避开周末**: 审核延迟

### 提高曝光度
1. 完善的中英文说明
2. 清晰的功能截图
3. 详细的使用教程
4. 及时回复用户反馈
5. 持续更新维护

### 用户支持
- 在 Greasy Fork 回复用户评论
- 提供 QQ群等交流渠道
- 及时处理用户反馈

---

**准备完成！祝发布顺利！** 🎉
