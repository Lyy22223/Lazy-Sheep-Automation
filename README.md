<div align="center">
  <img src="logo.png" alt="Lazy Sheep Logo" width="200"/>
  
  # 懒羊羊自动化平台
  
  > 在线学习平台自动化助手 | 支持自动答题、自动刷课、智能纠错

[![License](https://img.shields.io/github/license/Lyy22223/Lazy-Sheep-Automation)](LICENSE)
[![Vue](https://img.shields.io/badge/Vue-3.x-brightgreen.svg)](https://vuejs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688.svg)](https://fastapi.tiangolo.com/)

</div>

---

## 📖 项目简介

懒羊羊自动化平台是一个智能答题解决方案，包含前端用户脚本和后端API服务。

### ✨ 核心特性

- 🎯 **智能答题** - 支持单选、多选、判断、填空、简答等多种题型
- 🤖 **AI 辅助** - 集成 DeepSeek AI (V3/R1) 智能解答
- 📚 **题库管理** - 云端题库 + 智能搜索
- 🎨 **现代化UI** - Vue 3 + Ant Design Vue
- 🔒 **反作弊绕过** - 解除复制粘贴、右键菜单等限制
- 🚀 **高性能** - 并发控制、请求队列优化

---

## 📁 项目结构

```
Lazy-Sheep-Automation/
├── lazy-sheep-userscript/      # 前端用户脚本
│   ├── src/                   # 源代码
│   ├── dist/                  # 构建输出
│   └── package.json           # 项目配置
│
└── lazy-sheep-backend/         # 后端 API 服务
    ├── api/                   # API 核心代码
    ├── deploy-package/        # 部署包
    ├── requirements.txt       # Python 依赖
    └── run.py                 # 启动文件
```

---

## 🚀 快速开始

### 前端用户脚本

```bash
# 1. 安装依赖
cd lazy-sheep-userscript
npm install

# 2. 构建
npm run build

# 3. 安装脚本
# 打开 dist/lazy-sheep-auto-answer.user.js
# 在 Tampermonkey 中安装
```

### 后端 API 服务

```bash
# 1. 安装依赖
cd lazy-sheep-backend
pip install -r requirements.txt

# 2. 配置环境
cp deploy-package/.env.example deploy-package/.env
# 编辑 .env 设置数据库和API密钥

# 3. 启动服务
python run.py
```

---

## 🛠️ 技术栈

- **前端**: Vue 3 + Ant Design Vue + Webpack
- **后端**: FastAPI + SQLAlchemy + PostgreSQL/SQLite
- **AI**: DeepSeek API (V3/R1)
- **部署**: Gunicorn + Uvicorn

---

## 📄 许可证

本项目采用 [MIT License](LICENSE) 开源协议。

**⚠️ 免责声明**: 本工具仅供学习交流使用，请勿用于违反平台规定的行为。

---

<div align="center">
  Made with ❤️ by Lazy Sheep Team
</div>
