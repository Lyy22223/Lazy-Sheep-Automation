# 传智播客答题脚本项目

## 项目结构

```
czbk/
├── scripts/          # 用户脚本（油猴脚本）
│   ├── czbk_answer.user.js    # 传智播客答题脚本（主脚本）
│   ├── auto_answer.user.js    # 原版答题脚本（参考）
│   └── chaoxing.js            # 超星学习通脚本（参考）
│
├── docs/             # 文档
│   ├── 商业化方案设计.md
│   ├── 前后端系统设计方案.md
│   ├── 答案库结构说明.md
│   ├── 脚本功能说明.md
│   └── index.html
│
├── data/             # 数据文件（答案库JSON）
│   ├── danxuan.json      # 单选题答案库
│   ├── duoxuan.json      # 多选题答案库
│   ├── panduan.json      # 判断题答案库
│   ├── tiankong.json     # 填空题答案库
│   ├── jianda.json       # 简答题答案库
│   ├── merged_answers.json
│   └── 答题记录_*.json
│
├── tools/            # 工具脚本
│   ├── *.py          # Python工具脚本
│   └── *.js          # JavaScript工具脚本
│
└── backend/          # 后端代码（待开发）
```

## 核心功能

### 1. 传智播客答题脚本（czbk_answer.user.js）

**主要功能：**
- ✅ 云端API查询（后端统一管理答案库）
- ✅ AI答题（答案库没有时自动调用）
- ✅ 自动填充答案（支持所有题型）
- ✅ 智能纠错（后端自动处理，根据批改结果自动更新答案）
- ✅ 刷课功能（自动完成课程）

**技术栈：**
- Vue 3 + Ant Design Vue（可选，控制面板）
- Pinia状态管理（可选）
- 原生JavaScript（轻量级方案）

### 2. 后端API

**API地址：** `http://8.138.237.189:8000`

**主要接口：**
- `POST /api/search` - 查询答案
- `POST /api/ai/answer` - AI答题
- `GET /api/key/status` - 查询API Key状态

## 开发计划

1. ✅ 整理项目结构
2. 🔄 开发传智播客答题脚本（Vue3 + Antdv）
3. ⏳ 开发传智播客刷课脚本
4. ⏳ 实现AI答题功能集成
5. ⏳ 实现本地答案库管理（GM_getValue）

## 使用说明

1. 安装Tampermonkey浏览器扩展
2. 导入 `scripts/czbk_answer.user.js` 脚本
3. 在传智播客答题页面使用

## 配置说明

- API Key：首次使用会提示输入，保存在GM_getValue中
- 答案库：统一由后端管理，前端不再进行本地缓存
- 智能纠错：后端自动处理，根据批改结果自动计算纠错策略

