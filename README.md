# Paper Reader

> 本地学术论文精读应用 — 双击启动，AI 辅助划词、高亮、笔记、总结、图表解读、术语积累。
>
> Electron 壳 · Python FastAPI 后端 · React + TypeScript 前端 · SQLite 存储。

---

## 功能总览

### 📄 PDF 阅读
- react-pdf 渲染，支持 50%–300% 缩放、页码跳转、**阅读进度记忆**
- **虚拟化**：IntersectionObserver 按需渲染 ±2 页，支持 100+ 页大论文不卡
- **PDF 目录（TOC）**侧栏，当前章节高亮，点击跳转
- **PDF 全文搜索**（Ctrl+F）：匹配高亮、上下翻跳
- **专注模式**（F11）：隐藏所有面板全屏阅读
- **深色模式**（localStorage 持久化）
- **拖拽上传 PDF**

### 🎨 高亮系统
- 四色分类：黄（重要概念）· 蓝（方法细节）· 绿（实验结论）· 紫（不理解）
- 精确坐标存储（多行选中、缩放跟随）
- 点击高亮菜单：**改色 / 复制原文 / 查看笔记 / 加入术语库 / AI 重解 / 删除**
- 按颜色筛选、**滚动条 minimap** 一览全文高亮分布
- SHA256 去重上传，级联删除

### 📝 笔记系统
- 6 种**模板**一键插入：核心贡献 / 方法细节 / 实验结论 / 疑问 / 对比 / 批注
- Markdown + **KaTeX 数学公式**渲染（`$x^2$`、`$$\sum$$`）
- 显示关联的高亮原文 + 相对时间戳
- 按时间 / 页码排序切换，inline 编辑
- **跨论文笔记搜索**（Ctrl+Shift+F）：关键词高亮 + 一键跳转到对应论文

### 🤖 AI 能力
- **结构化自动摘要**：核心贡献 / 解决问题 / 方法 / 实验结论 / 局限 / 关键术语
  - 首次打开论文可选自动触发，结果缓存为笔记
- **AI 上下文注入**：chat 自动携带论文已有摘要 + 所有高亮 + 手动笔记
- **智能建议重点 ✨**：AI 读全文挑选 5-10 个关键句，带页码+颜色+理由；一键采纳创建高亮（通过 PyMuPDF `search_for` 精确定位）
- **章节级解读 📖**：TOC 每项一键 AI 读本节生成要点
- **双语对照悬浮**：选中段落下方浮出翻译
- **图表 AI 解读 📊**：PyMuPDF 提取 Figure/Table + caption；vision 模型解读图像
  - 当前模型不支持图像时按钮**灰色禁用**并提示切换到 gpt-4o / claude-3.x / llava 等
- **论文对比 ⚖️**：勾选 2-5 篇，AI 输出结构化对比报告
- **引用 `[n]` 悬浮**：AI 回答和 PDF 文本层中的 `[12]` 都自动识别，鼠标交互显示对应参考文献
- AI 回答**强制标注页码**：`(p.N)` 或 `> p.N: "原文"`
- SSE 流式，支持 OpenAI / Anthropic / Ollama，AbortController 可中断
- 设置页 **API 连通性测试**按钮

### 📖 术语库 Glossary
- 生成摘要时自动解析「关键术语」小节入库
- 高亮菜单「加入术语库」手动快速添加
- 全局术语库窗口：模糊搜索、编辑、删除、按来源标记

### 📤 导出
- Markdown 按页排序、按颜色分组，含高亮 + 关联笔记 + AI 摘要

### 🏷️ 论文管理
- **标签系统**：内联编辑，按标签过滤
- 列表搜索（标题/作者）
- 左侧栏 / 右侧栏可折叠

### ⌨️ 键盘快捷键

| 键 | 动作 |
|---|---|
| `1 / 2 / 3 / 4` | 切换高亮颜色（黄/蓝/绿/紫） |
| `E` | 对选中文字触发 AI 解释 |
| `T` | 翻译（在 AI 面板） |
| `N` | 添加手动笔记 |
| `Ctrl+S` | 导出 Markdown |
| `Ctrl+F` | PDF 内搜索 |
| `Ctrl+Shift+F` | 跨论文笔记搜索 |
| `F11` | 专注模式 |
| `Esc` | 关闭弹窗/退出专注 |

---

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面壳 | Electron 28+ |
| 前端 | React 18 + TypeScript 5 + Vite 5 + Tailwind 3 |
| PDF 渲染 | react-pdf (pdfjs-dist) |
| Markdown | react-markdown + remark-math + rehype-katex |
| 后端 | Python 3.11+ · FastAPI · SQLModel · PyMuPDF |
| 数据库 | SQLite (WAL 模式) |
| AI | OpenAI / Anthropic / Ollama（均支持 vision） |
| 测试 | pytest / Vitest / React Testing Library |

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
cd backend && pip install -r requirements.txt

# 前端
cd ../frontend && npm install

# 根（Electron + 编排）
cd .. && npm install
```

### 3. 启动

```bash
# 开发模式（后端 :8000 + 前端 :5173 同时起）
npm run dev

# 或只起后端（调试 API）
npm run dev:backend
# 另一终端：npm run dev:frontend

# 前后端都起来后，叠加 Electron 壳
npm run electron:dev
```

浏览器访问 http://localhost:5173 也可直接使用（纯 Web 模式）。

### 4. 配置 AI

启动后点击工具栏 `⚙️ 设置`：
- 选择 Provider：OpenAI / Anthropic / Ollama
- 填写 API Key / Model / Base URL（可选）
- 点击 `🔌 测试连接` 验证
- 查看**视觉能力**徽章（✓/✗）决定是否能使用图表解读功能

或手工编辑 `data/config.json`（应用首次启动自动生成）。API Key 存储为文件权限 600（见 ADR-009）。

---

## 目录结构

```
paper-reader/
├── CLAUDE.md                  ← 项目规格
├── .claude/                   ← 开发手册（索引在 .claude/README.md）
│   ├── architecture.md · api-reference.md · db-schema.md
│   ├── frontend-guide.md · backend-guide.md · ai-prompts.md
│   ├── conventions.md · dev-tips.md · testing.md
│   ├── decisions.md (ADR)    · changelog.md
├── package.json               ← Electron + 脚本
├── electron/main.js           ← Electron 入口
├── frontend/                  ← React + Vite
│   ├── vitest.config.ts
│   └── src/
│       ├── App.tsx · api.ts · types.ts
│       ├── store/app-store.tsx
│       ├── hooks/             (useStream · useHighlight · useKeyboard ·
│       │                        usePageVirtualization · usePdfCitations)
│       └── components/        (Toolbar · PdfReader · AiPanel · NotesPanel ·
│                               SummaryPanel · FiguresPanel · PaperList ·
│                               TocPanel · SearchBar · ContextMenu · Toast ·
│                               Markdown · ComparePapersModal · GlobalSearch ·
│                               GlossaryModal · SuggestHighlightsModal ·
│                               BilingualPopover · HighlightMinimap · ...)
├── backend/                   ← FastAPI
│   ├── main.py · db.py · models.py · schemas.py · errors.py
│   ├── services/              (pdf_parser · llm_service · paper_service ·
│   │                            export_service · config_service)
│   ├── repositories/          (paper_repo · highlight_repo · note_repo ·
│   │                            chat_repo · glossary_repo)
│   ├── routers/               (papers · highlights · notes · ai · config ·
│   │                            search · glossary)
│   ├── pytest.ini
│   └── tests/                 (8 个测试文件，152 cases)
└── data/                      ← 运行时自动创建（.gitignore）
    ├── reader.db (+ -wal, -shm)
    ├── papers/                ← PDF 文件
    ├── logs/
    └── config.json
```

---

## API 速查

完整 API 文档见 `.claude/api-reference.md`，以下是主要端点概览：

| Prefix | 端点 | 说明 |
|--------|------|------|
| `/papers` | POST `/upload` | 上传 PDF |
| `/papers` | GET `` `?q=&tag=` | 列表 + 搜索 + 标签过滤 |
| `/papers` | GET/DELETE `/{id}` | 详情 / 删除 |
| `/papers` | PUT `/{id}` | 更新标签 |
| `/papers` | GET `/{id}/file` | PDF 二进制 |
| `/papers` | GET `/{id}/outline` | 目录 |
| `/papers` | GET `/{id}/search?q=` | 全文搜索 |
| `/papers` | GET `/{id}/references` | 参考文献 |
| `/papers` | GET `/{id}/figures` + `/{xref}.png` | 图表清单 / 图像 |
| `/papers` | GET/POST `/{id}/summary` | 获取/生成摘要 |
| `/papers` | GET `/{id}/export` | Markdown 导出 |
| `/papers` | GET `/tags` | 聚合所有标签 |
| `/papers/{id}/highlights` | CRUD | 高亮 |
| `/papers/{id}/notes` | CRUD | 笔记 |
| `/ai` | POST `/explain`,`/translate`,`/summarize`,`/chat` | 流式 SSE |
| `/ai` | POST `/explain_section`,`/explain_figure` | 章节/图表解读 |
| `/ai` | POST `/suggest_highlights` | 建议重点（JSON） |
| `/ai` | POST `/compare_papers` | 论文对比（SSE） |
| `/search/notes` | GET `?q=` | 跨论文笔记搜索 |
| `/glossary` | CRUD | 术语库 |
| `/config` | GET/POST + `/test` | 配置 + 连通性测试 |

所有 SSE 端点使用 JSON 协议：`data: {"type":"chunk|done|error","text":"..."}`（ADR-005）。

---

## 数据库

SQLite 单文件 `data/reader.db`，WAL 模式 + 外键启用。当前 schema 版本 **v3**。

表：`papers`（带 tags）· `highlights` · `notes` · `chats` · `glossary` · `app_meta`

新字段通过 `db.MIGRATIONS` 幂等迁移。详见 `.claude/db-schema.md`。

---

## 测试

🧪 **测试规约（ADR-013）**：新增/修改功能必须配套测试，bug 修复先写失败测试。详见 `.claude/testing.md`。

```bash
# 后端（pytest + httpx TestClient + PyMuPDF 内存 PDF fixtures）
cd backend && pip install -r requirements-dev.txt
python -m pytest tests/

# 前端（Vitest + jsdom + @testing-library/react）
cd frontend && npm test
cd frontend && npm run test:watch  # 开发时 watch 模式
```

**当前基线**：后端 **152 tests** · 前端 **30 tests** · 总计 **182 tests** 全绿。

测试分布：
- `test_pdf_parser.py` · `test_papers.py` · `test_highlights.py` · `test_notes.py`
- `test_ai.py` · `test_config.py` · `test_tags.py` · `test_search.py`
- `test_summary.py` · `test_suggest.py` · `test_glossary.py` · `test_figures_and_vision.py`
- 前端：`app-store.test.tsx` · `useStream.test.ts` · `usePageVirtualization.test.ts` · `api.test.ts`

---

## 开发者手册

所有开发细节见 `.claude/` 目录。推荐阅读顺序：

1. `.claude/README.md` — 索引，按"当前任务"查该读哪个
2. `.claude/architecture.md` — 理解整体三层（router / service / repository）
3. `.claude/api-reference.md` — 所有端点规格
4. `.claude/testing.md` — 如何写测试 + fixtures + mock 约定
5. 按需阅读 backend-guide / frontend-guide / db-schema / ai-prompts

📋 **修改设计规则**（硬性）：
- 改 API → 同步更新 `.claude/api-reference.md` + 追加 `changelog.md`
- 改表结构 → 同步更新 `.claude/db-schema.md` + 加 `db.MIGRATIONS`
- 改提示词 → 同步更新 `.claude/ai-prompts.md`
- 做架构决策 → 新增 `.claude/decisions.md` 中的 ADR

---

## 架构亮点

- 🔴 **三层分层**（ADR-007）：router 仅做 HTTP 边界；service 负责业务；repository 单表 CRUD
- 🔴 **SSE JSON 协议**（ADR-005）：chunk 用 JSON 包裹避免换行破坏协议，支持 error/done 事件
- 🔴 **SQLite WAL + PRAGMA**：foreign_keys=ON + 显式级联删除
- 🔴 **高亮坐标归一化**（ADR-006）：CSS px 存储 at zoom=1，渲染时 × 当前 scale
- 🔴 **LLM 全部可 mock**（conftest 的 mock_llm / mock_llm_response），测试永不打真实 API
- 🔴 **HTTP 而非 Electron IPC**（ADR-012）：后端可独立跑，便于未来 Web / MCP 部署
- 🔴 **API Key 存储 chmod 600**（ADR-009，v1）

---

## 已知问题

- Windows 关闭 Electron 时 Python 子进程偶尔残留（见 `.claude/dev-tips.md#49`）— 代码已加 `taskkill /T /F` 但极端情况下仍可能遗漏
- 前端 main bundle ~700KB（含 pdfjs + KaTeX）— 未做 code-split，v1 可接受

---

## 版本

**活跃开发中**，主要里程碑：

- `cd90f5d` chore: 初始化项目（文档 + 测试规约）
- `f1e9d0b` feat(backend): v0.1 原型
- `9229545` feat: v0.1 前端 + Electron
- `fd8d2da` feat: 右键菜单 / 交互 / 缩放 / toast
- `d1ef078` feat: 快捷键 / 笔记编辑 / 面板折叠 / 高亮筛选
- `74005e5` feat: TOC / PDF 搜索 / 深色模式 / 阅读进度
- `8628c1c` test: 测试基线 + ADR-013
- `8f13e3e` feat: PDF 虚拟化 / 标签 / 跨论文搜索
- `1df6301` feat: 自动摘要 / AI 上下文 / KaTeX / minimap / 专注 / 章节解读
- `9453263` feat: 页码引用 / 智能建议 / `[n]` 预览 / 笔记模板 / 双语对照
- `13b79fc` feat: Figure + vision 门控 / PDF 内 `[n]` / 论文对比 / 术语库

---

## 许可

MIT
