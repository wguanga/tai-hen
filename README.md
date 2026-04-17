# Paper Reader

> 本地学术论文精读应用 — 双击启动，划词高亮 + AI 解释 + 笔记管理 + Markdown 导出。
>
> Electron 壳 · Python FastAPI 后端 · React + TypeScript 前端 · SQLite 存储。

---

## 功能

- 📄 **PDF 阅读**：基于 react-pdf，支持缩放、翻页
- 🎨 **四色高亮**：黄（重要概念）· 蓝（方法细节）· 绿（实验结论）· 紫（不理解）
- 🤖 **AI 解释**：选中文字一键流式解释；支持追问对话
- 📝 **笔记汇总**：右侧面板展示所有笔记，AI 回答可一键存为笔记
- 📤 **导出 Markdown**：按页/颜色分组的阅读报告
- 🔌 **多 LLM 提供商**：OpenAI / Anthropic / Ollama 可切换

---

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面壳 | Electron 28+ |
| 前端 | React 18 + TypeScript 5 + Vite 5 + Tailwind 3 |
| PDF 渲染 | react-pdf (pdfjs-dist) |
| 后端 | Python 3.11+ · FastAPI · SQLModel · PyMuPDF |
| 数据库 | SQLite (WAL 模式) |
| AI | OpenAI / Anthropic / Ollama SDK |

---

## 快速开始

### 1. 准备环境

```bash
# Python 3.11+、Node.js 18+ 必需
python --version
node --version
```

### 2. 安装依赖

```bash
# 后端
cd backend
pip install -r requirements.txt

# 前端
cd ../frontend
npm install

# 根（Electron + 编排）
cd ..
npm install
```

### 3. 配置 AI（首次启动后在设置页完成，或手动编辑）

创建 `data/config.json`（首次运行应用会自动生成默认文件）：

```json
{
  "provider": "openai",
  "model": "gpt-4o-mini",
  "api_key": "sk-...",
  "base_url": "",
  "ollama_model": "qwen2.5:14b"
}
```

支持 `provider`: `openai` | `anthropic` | `ollama`。

### 4. 启动

```bash
# 开发模式（后端 + 前端 + Electron 同时起）
npm run dev

# 或只起后端（调试 API）
npm run dev:backend
# 另一终端：npm run dev:frontend
```

启动后访问 http://localhost:5173（开发模式下，Electron 窗口会自动加载）。

---

## 目录结构

```
paper-reader/
├── CLAUDE.md                  ← 项目规格（给 Claude Code 读）
├── .claude/                   ← 开发手册（比 CLAUDE.md 更深入）
│   ├── README.md              ← 索引
│   ├── architecture.md        ← 架构详解
│   ├── api-reference.md       ← 完整 API
│   ├── db-schema.md           ← 数据库
│   ├── frontend-guide.md      ← 前端指南
│   ├── backend-guide.md       ← 后端指南
│   ├── ai-prompts.md          ← LLM 提示词
│   ├── conventions.md         ← 命名/格式约定
│   ├── dev-tips.md            ← 开发技巧与坑
│   ├── decisions.md           ← ADR 决策记录
│   └── changelog.md           ← 设计变更日志
├── package.json               ← Electron + 编排脚本
├── electron/main.js           ← Electron 入口
├── frontend/                  ← React + Vite
│   └── src/
│       ├── App.tsx
│       ├── api.ts
│       ├── types.ts
│       ├── store/
│       ├── hooks/
│       └── components/
├── backend/                   ← FastAPI
│   ├── main.py
│   ├── db.py
│   ├── models.py
│   ├── routers/
│   ├── services/
│   └── repositories/
└── data/                      ← 运行时自动创建（.gitignore）
    ├── reader.db
    ├── papers/
    ├── logs/
    └── config.json
```

---

## 开发者手册

🔴 **所有开发细节见 `.claude/` 目录**。推荐阅读顺序：

1. `.claude/README.md` — 索引，按"当前任务"查
2. `.claude/architecture.md` — 理解整体
3. 按需阅读对应模块文档

📋 **修改设计规则**：
- 改 API → 同步更新 `.claude/api-reference.md` + `changelog.md`
- 改表结构 → 同步更新 `.claude/db-schema.md` + 加迁移
- 改提示词 → 同步更新 `.claude/ai-prompts.md`
- 做架构决策 → 写入 `.claude/decisions.md`（ADR）

🧪 **测试硬性规约（ADR-013）**：新增/修改功能必须配套测试，详见 `.claude/testing.md`。

```bash
# 后端
cd backend && pip install -r requirements-dev.txt && python -m pytest tests/

# 前端
cd frontend && npm test
```

当前基线：后端 70 tests · 前端 25 tests。

---

## 当前版本

**v0.1 原型**（2026-04-15）

✅ 核心路径可运行：上传 PDF、划词高亮、AI 流式解释、存笔记、导出 MD  
🚧 未实现：PDF 虚拟化、多模型路由、缩略图、全文搜索、云同步  
🐛 已知问题：Windows 下 Electron 关闭时 Python 子进程可能残留（见 `.claude/dev-tips.md#49`）

---

## 许可

MIT
