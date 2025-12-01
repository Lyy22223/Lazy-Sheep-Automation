<div align="center">
  <img src="logo.png" alt="Lazy Sheep Logo" width="200"/>
  
  # 懒羊羊自动化平台
  
  > 在线学习平台自动化助手 | 支持自动答题、自动刷课、智能纠错

[![GitHub release](https://img.shields.io/github/v/release/Lyy22223/Lazy-Sheep-Automation)](https://github.com/Lyy22223/Lazy-Sheep-Automation/releases)
[![License](https://img.shields.io/github/license/Lyy22223/Lazy-Sheep-Automation)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/Lyy22223/Lazy-Sheep-Automation)](https://github.com/Lyy22223/Lazy-Sheep-Automation/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/Lyy22223/Lazy-Sheep-Automation)](https://github.com/Lyy22223/Lazy-Sheep-Automation/issues)
[![Vue](https://img.shields.io/badge/Vue-3.x-brightgreen.svg)](https://vuejs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688.svg)](https://fastapi.tiangolo.com/)
[![CI](https://github.com/Lyy22223/Lazy-Sheep-Automation/workflows/CI/badge.svg)](https://github.com/Lyy22223/Lazy-Sheep-Automation/actions)

</div>

---

## 📖 项目简介

懒羊羊自动化平台是一个完整的智能答题解决方案，包含前端用户脚本和后端API服务。支持多种题型的自动答题、AI智能解答、题库管理等功能。

### ✨ 核心特性

- 🎯 **智能答题** - 支持单选、多选、判断、填空、简答等多种题型
- 🤖 **AI 辅助** - 集成 DeepSeek AI (V3/R1) 智能解答
- 📚 **题库管理** - 本地题库 + 向量化搜索
- 🎨 **现代化UI** - Vue 3 + Ant Design Vue
- 🔒 **反作弊绕过** - 解除复制粘贴、右键菜单等限制
- 📊 **日志系统** - 可视化日志面板，支持过滤、导出
- 🚀 **高性能** - 并发控制、请求队列优化

---

## 📁 项目结构

```
czbk/
├── lazy-sheep-userscript/      # 🎨 前端用户脚本
│   ├── src/
│   │   ├── core/              # 核心模块
│   │   │   ├── anti-cheat-bypass.js  # 反作弊绕过
│   │   │   ├── config.js             # 配置管理
│   │   │   └── utils.js              # 工具函数
│   │   ├── modules/           # 功能模块
│   │   │   ├── auto-answer.js        # 自动答题
│   │   │   ├── answer-filler.js      # 答案填充
│   │   │   ├── correction.js         # 智能纠错
│   │   │   └── submit-handler.js     # 提交处理
│   │   ├── network/           # 网络层
│   │   │   ├── api-client.js         # API 客户端
│   │   │   ├── interceptor.js        # 请求拦截
│   │   │   └── request-queue.js      # 请求队列
│   │   ├── ui/                # 用户界面
│   │   │   ├── panel.vue             # 控制面板
│   │   │   └── index.js              # UI 管理器
│   │   └── main.js            # 入口文件
│   ├── config/                # 构建配置
│   └── dist/                  # 编译输出
│
├── lazy-sheep-backend/         # 🚀 后端 API 服务
│   ├── app/
│   │   ├── routes/            # API 路由
│   │   │   ├── ai.py                 # AI 答题接口
│   │   │   ├── search.py             # 题库搜索
│   │   │   └── upload.py             # 批量上传
│   │   ├── services/          # 业务逻辑
│   │   │   ├── ai_service.py         # AI 服务
│   │   │   └── search_service.py     # 搜索服务
│   │   ├── models/            # 数据模型
│   │   └── main.py            # 应用入口
│   ├── requirements.txt       # Python 依赖
│   └── Dockerfile             # Docker 配置
│
├── archive/                    # 📦 归档目录
│   ├── legacy/                # 旧版文件
│   └── old-scripts/           # 旧版脚本
│
├── docs/                       # 📚 文档
│   ├── design/                # 设计文档
│   ├── reference/             # 参考文档
│   └── deployment/            # 部署文档
│
├── scripts/                    # 🔧 工具脚本
│   ├── docker-start.bat       # Docker 启动脚本
│   └── docker-start.sh
│
└── deploy/                     # 🐳 部署配置
    ├── docker-compose.yml     # Docker Compose
    └── .dockerignore
```

---

## 🚀 快速开始

### 前端用户脚本

#### 1. 安装依赖

```bash
cd lazy-sheep-userscript
npm install
```

#### 2. 开发模式

```bash
npm run dev:serve
```

访问 `http://localhost:3000/czbk.user.js` 获取脚本

#### 3. 生产构建

```bash
npm run build
```

编译后的脚本在 `dist/czbk.user.js`

#### 4. 安装到浏览器

1. 安装 Tampermonkey 扩展
2. 打开 `dist/czbk.user.js`
3. 点击安装

### 后端 API 服务

#### 快速启动（推荐）

```bash
cd lazy-sheep-backend
./quick-start.bat    # Windows
./start.sh           # Linux/Mac
```

#### 手动启动

```bash
# 1. 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Linux/Mac
venv\Scripts\activate     # Windows

# 2. 安装依赖
pip install -r requirements.txt

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 设置 DEEPSEEK_API_KEY

# 4. 启动服务
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### Docker 部署

```bash
cd deploy
docker-compose up -d
```

---

## 🎯 功能特性

### 前端功能

| 功能 | 说明 | 状态 |
|------|------|------|
| **自动答题** | 支持所有题型的自动识别和填充 | ✅ |
| **AI 答题** | DeepSeek V3/R1 智能解答 | ✅ |
| **智能纠错** | 自动分析错题并纠正 | ✅ |
| **题库搜索** | 本地题库快速匹配 | ✅ |
| **反作弊** | 解除复制粘贴等限制 | ✅ |
| **日志系统** | 可视化日志、过滤、导出 | ✅ |
| **批量上传** | 批量上传题目到题库 | ✅ |

### 后端功能

| 功能 | 说明 | 状态 |
|------|------|------|
| **AI 接口** | DeepSeek API 集成 | ✅ |
| **题库搜索** | 向量化 + 精确匹配 | ✅ |
| **API 管理** | API Key 验证和管理 | ✅ |
| **批量导入** | Excel/JSON 批量导入 | ✅ |
| **数据持久化** | SQLite 数据库 | ✅ |

---

## 🛠️ 技术栈

### 前端

- **框架**: Vue 3 (Composition API)
- **UI 库**: Ant Design Vue
- **构建工具**: Webpack 5
- **语言**: JavaScript (ES6+)
- **打包**: Tampermonkey UserScript

### 后端

- **框架**: FastAPI
- **数据库**: SQLite
- **AI**: DeepSeek API
- **部署**: Docker + Uvicorn
- **语言**: Python 3.9+

---

## 📖 文档

- [前端开发指南](lazy-sheep-userscript/DEV-SETUP.md)
- [反作弊功能说明](lazy-sheep-userscript/ANTI-CHEAT.md)
- [后端 API 文档](lazy-sheep-backend/README.md)
- [部署指南](docs/deployment/DOCKER_DEPLOY.md)
- [系统设计方案](docs/design/前后端系统设计方案.md)

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m '[feat] Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

### 提交规范

```
[feat] 新功能
[fix] 修复Bug
[docs] 文档更新
[style] 代码格式调整
[refactor] 代码重构
[perf] 性能优化
[test] 测试相关
[chore] 构建/工具相关
```

---

## 📄 许可证

本项目采用 [MIT License](LICENSE) 开源协议。

### ⚠️ 免责声明

- 本工具仅供学习交流使用
- 请勿用于违反平台规定的行为
- 使用本工具造成的任何后果由用户自行承担
- 开发者不承担任何法律责任

---

## 🙏 致谢

- [Vue.js](https://vuejs.org/)
- [Ant Design Vue](https://antdv.com/)
- [FastAPI](https://fastapi.tiangolo.com/)
- [DeepSeek](https://www.deepseek.com/)

---

<p align="center">
  Made with ❤️ by Lazy Sheep Team
</p>
