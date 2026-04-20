# 苔痕 · tai-hen

> 本地学术论文精读应用 — 双击启动，AI 辅助划词、高亮、笔记、摘要、图表解读、术语积累、引用查证，外加一只陪你读的苔苔 🌱。
>
> Electron 壳 · Python FastAPI 后端 · React + TypeScript 前端 · SQLite 存储。

[![CI](https://github.com/wguanga/tai-hen/actions/workflows/ci.yml/badge.svg)](https://github.com/wguanga/tai-hen/actions/workflows/ci.yml)

---

## 功能总览

### 📄 PDF 阅读
- react-pdf 渲染，50%–300% 缩放、`Ctrl`+滚轮缩放、`Space` / `PgUp/Dn` / `Ctrl+Home/End` 翻页
- **虚拟化**：IntersectionObserver 按需渲染 ±2 页，100+ 页论文也不卡
- **PDF 目录（TOC）**侧栏，当前章节高亮，点击跳转
- **PDF 全文搜索**（`Ctrl+F`）：匹配高亮、上下翻跳
- **专注模式**（`F11`）：隐藏所有面板全屏阅读
- **深色模式 · 时段环境光 · 萤火虫 · 星座图**（可关）
- **拖拽上传 PDF** / **arXiv URL 导入**（粘贴 abs 或 pdf 链接即可）
- **断点续读**：空欢迎页上一次阅读到哪就提示从哪续
- **多开标签**：最近打开的论文以 chrome 风格标签条并列切换

### 🎨 高亮系统
- 四色分类：黄（重要概念）· 蓝（方法细节）· 绿（实验结论）· 紫（不理解）
- 精确坐标存储（多行选中、缩放跟随）
- 点击高亮菜单：**改色 / 复制原文 / 查看笔记 / 加入术语库 / AI 重解 / 删除**
- 按颜色筛选、**滚动条 minimap** 一览全文高亮分布
- **智能延伸选择**：`⇔句 / ⇔段` 一键把划选范围扩到整句 / 整段
- **AI 挑重点 ✨**：一键让 AI 读全文建议 5-10 处关键句（带页码 + 颜色 + 理由）

### 📝 笔记系统
- 6 种**模板**一键插入：核心贡献 / 方法细节 / 实验结论 / 疑问 / 对比 / 批注
- Markdown + **KaTeX 数学公式**渲染（`$x^2$`、`$$\sum$$`）
- 显示关联的高亮原文 + 相对时间戳
- 按时间 / 页码排序切换，inline 编辑
- **跨论文笔记搜索**（`Ctrl+Shift+F`）：关键词高亮 + 一键跳转
- **AI 整理成稿**：多条零散笔记一键合并成结构化读书报告
- **AI 自动格式化**：把草稿笔记规整化、补缺项

### 🤖 AI 能力（三档预算分层 · 可逐功能开关）
- **结构化自动摘要**：核心贡献 / 解决问题 / 方法 / 实验结论 / 局限 / 关键术语
- **AI 上下文注入**：chat 自动携带摘要 + 所有高亮 + 手动笔记
- **章节级解读 📖**：TOC 每项一键 AI 读本节生成要点
- **双语对照悬浮**：选中段落下方浮出翻译
- **悬停翻译** · **起步提问卡片** · **90s 困惑求助** · **图表 AR 标签**
- **2 分钟音频导读** · **陪读模式**（读前提问 + 读后检验打分）
- **图表 AI 解读 📊**：PyMuPDF 抽 Figure/Table + caption，vision 模型解读
- **论文对比 ⚖️**：勾选 2-5 篇 AI 产出结构化对比报告
- **语义化搜索**：自然语言查段落（非关键字匹配）
- **引用 `[n]` 悬浮 + arXiv 一键入库**：AI 回答和 PDF 文本层的 `[12]` 都点得动；点进去能在 arXiv 查同名论文并 1-click 导入
- AI 回答**强制标注页码**：`(p.N)` 或 `> p.N: "原文"`
- SSE 流式，支持 OpenAI / Anthropic / Ollama / 任意 OpenAI 兼容网关；AbortController 可中断
- 设置页 **API 连通性测试 + vision 能力探测**

### 📖 术语库 Glossary
- 摘要生成时自动解析「关键术语」小节入库
- 高亮菜单「加入术语库」手动添加
- 全局术语库窗口：模糊搜索、编辑、删除、按来源标记
- **跨论文术语悬浮**：你在任一论文记下的定义，在所有论文的文本层自动下划线 + 悬停显示

### 🌿 陪读苔苔（RPG 元素 / 可关）
- 滚动条上的小生物，随你阅读进度爬行，8 种表情、逐级进化
- **49 个成就分 9 类**：📖 阅读 · 🖍️ 标注 · ✏️ 笔记 · 🤖 AI · 🔥 坚持 · 🌿 苔苔 · 🧭 探索 · 🌙 时辰 · 🎁 彩蛋
- XP / 等级表（Lv 1-20），"完成整书"动画 + 里程碑 toast
- 每篇论文有自选随身挂饰；读完一本苔苔换新装
- **连击** / 阅读热力 / 每日学习 ring

### 📤 导出
- Markdown 按页排序、按颜色分组，含高亮 + 关联笔记 + AI 摘要

### 🏷️ 论文管理
- **标签系统**：内联编辑，按标签过滤
- 列表搜索（标题/作者）
- 左 / 右侧栏可折叠 + 拖拽调整宽度
- **命令面板**（`Ctrl+K`）：自然语言驱动所有动作
- **书签狗耳朵** / 悬浮页码胶囊 / 选区浮动工具栏

### ⌨️ 快捷键

| 键 | 动作 |
|---|---|
| `1 / 2 / 3 / 4` | 切换高亮颜色（黄/蓝/绿/紫） |
| `E` | 对选中文字触发 AI 解释 |
| `T` | 翻译（在 AI 面板） |
| `N` | 添加手动笔记 |
| `Space` / `PgDn` | 向下翻一屏 |
| `Shift+Space` / `PgUp` | 向上翻一屏 |
| `Ctrl+Home / End` | 跳到文首 / 文末 |
| `Ctrl + 滚轮` | 缩放（0.5× ↔ 3×） |
| `Ctrl+S` | 导出 Markdown |
| `Ctrl+F` | PDF 内搜索 |
| `Ctrl+Shift+F` | 跨论文笔记搜索 |
| `Ctrl+K` | 命令面板 |
| `?` | 快捷键帮助 |
| `F11` | 专注模式 |
| `Esc` | 关闭弹窗/退出专注 |

---

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面壳 | Electron 28+ |
| 前端 | React 18 + TypeScript 5 + Vite 5 + Tailwind 3 |
| PDF 渲染 | react-pdf (pdfjs-dist) · 含 cMap / standard_fonts（CJK 字体） |
| Markdown | react-markdown + remark-math + rehype-katex |
| 后端 | Python 3.11+ · FastAPI · SQLModel · PyMuPDF · httpx |
| 数据库 | SQLite (WAL 模式) |
| AI | OpenAI / Anthropic / Ollama / OpenAI 兼容网关（均支持 vision） |
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

> 本仓库未提交 `package-lock.json`（跨 OS 协作时平台特定 optional-deps 会频繁重写 lock 文件，产生大量噪声 diff）。请直接依赖 `package.json` 里的 semver 范围；需要锁死某个依赖请在 `package.json` 里写精确版本。

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
- 查看**视觉能力**徽章（✓/✗）决定是否能用图表解读
- 用 `🧠 AI 档位`（保守 / 平衡 / 慷慨）控制每次启用多少 AI 功能

或手工编辑 `data/config.json`（应用首次启动自动生成）。

---

## 目录结构

```
tai-hen/
├── README.md
├── .github/workflows/ci.yml   ← GitHub Actions CI
├── docs/                      ← 项目文档（索引在 docs/README.md）
│   ├── architecture.md · api-reference.md · db-schema.md
│   ├── frontend-guide.md · backend-guide.md · ai-prompts.md
│   ├── conventions.md · dev-tips.md
│   ├── decisions.md (ADR) · changelog.md
├── package.json               ← Electron + 脚本
├── electron/main.js           ← Electron 入口（管理 Python 子进程）
├── frontend/                  ← React + Vite
│   └── src/
│       ├── App.tsx · api.ts · types.ts
│       ├── store/app-store.tsx
│       ├── hooks/  (useStream · useHighlight · useKeyboard ·
│       │           usePageVirtualization · usePdfCitations ·
│       │           useAIPrefs · useAppStats · useOpenTabs · ...)
│       └── components/ (Toolbar · PdfReader · AiPanel · NotesPanel ·
│                        SummaryPanel · FiguresPanel · PaperList ·
│                        PaperTabs · CitationPopover · ContextMenu ·
│                        ComparePapersModal · GlossaryModal · GlossaryHover ·
│                        MilestonesWall · ReadingCompanion · AudioTour ·
│                        CommandPalette · Taitai · ... )
├── backend/                   ← FastAPI
│   ├── main.py · db.py · models.py · schemas.py · errors.py
│   ├── services/  (pdf_parser · llm_service · paper_service ·
│   │               export_service · config_service · arxiv_search ·
│   │               vision_cache_service · ...)
│   ├── repositories/ (paper_repo · highlight_repo · note_repo ·
│   │                   chat_repo · glossary_repo)
│   ├── routers/ (papers · highlights · notes · ai · config ·
│   │             search · glossary)
│   ├── pytest.ini
│   └── tests/  (12 test modules, 154 cases)
└── data/                      ← 运行时自动创建（.gitignore）
    ├── reader.db (+ -wal, -shm)
    ├── papers/                ← PDF 文件
    ├── logs/
    └── config.json
```

---

## API 速查

完整 API 文档见 `docs/api-reference.md`，主要端点概览：

| Prefix | 端点 | 说明 |
|--------|------|------|
| `/papers` | POST `/upload` · POST `/import_url` | 上传 PDF / arXiv URL 导入 |
| `/papers` | POST `/search_arxiv` | 参考文献 → arXiv 候选 |
| `/papers` | GET `?q=&tag=` · GET/DELETE `/{id}` · PUT `/{id}` | 列表 / 详情 / 更新 / 删除 |
| `/papers` | GET `/{id}/file` · `/outline` · `/search` · `/references` | PDF 二进制 / 目录 / 搜索 / 参考文献 |
| `/papers` | GET `/{id}/figures` + `/{xref}.png` | 图表清单 / 图像 |
| `/papers` | GET/POST `/{id}/summary` · GET `/{id}/export` | 摘要 / Markdown 导出 |
| `/papers` | GET `/tags` | 聚合所有标签 |
| `/papers/{id}/highlights` | CRUD | 高亮 |
| `/papers/{id}/notes` | CRUD | 笔记 |
| `/ai` | POST `/explain` · `/translate` · `/summarize` · `/chat` | 流式 SSE |
| `/ai` | POST `/explain_section` · `/explain_figure` · `/compare_papers` | 章节 / 图表 / 对比 |
| `/ai` | POST `/suggest_highlights` · `/suggest_questions` · `/tag_highlight` · `/confusion_help` | 建议 / 标签 / 求助 |
| `/ai` | POST `/interpret_command` · `/quick_translate` · `/semantic_search` | 命令面板 / 快翻 / 语义搜索 |
| `/ai` | POST `/compile_notes` · `/format_note` | 笔记整理 / 格式化 |
| `/ai` | POST `/reading_questions` · `/check_answer` | 陪读提问 / 打分 |
| `/search/notes` | GET `?q=` | 跨论文笔记搜索 |
| `/glossary` | CRUD | 术语库 |
| `/config` | GET/POST + `/test` | 配置 + 连通性测试 |

所有 SSE 端点使用 JSON 协议：`data: {"type":"chunk|status|done|error","text":"..."}`（ADR-005）。

---

## 数据库

SQLite 单文件 `data/reader.db`，WAL 模式 + 外键启用。表：`papers`（带 tags）· `highlights` · `notes` · `chats` · `glossary` · `app_meta`。新字段通过 `db.MIGRATIONS` 幂等迁移。详见 `docs/db-schema.md`。

---

## 测试

🧪 **测试规约（ADR-013）**：新增 / 修改功能必须配套测试，bug 修复先写失败测试。

```bash
# 后端（pytest + httpx TestClient + PyMuPDF 内存 PDF fixtures）
cd backend && pip install -r requirements-dev.txt
python -m pytest tests/

# 前端（Vitest + jsdom + @testing-library/react）
cd frontend && npm test
```

**当前基线**：后端 **154 tests** · 前端 **38 tests** · 总计 **192 tests** 全绿。

CI 同时跑这两个套件 + tsc 类型检查 + Vite build（见 `.github/workflows/ci.yml`）。

---

## 开发者手册

所有开发细节见 `docs/` 目录。推荐阅读顺序：

1. `docs/README.md` — 索引
2. `docs/architecture.md` — 理解整体三层（router / service / repository）
3. `docs/api-reference.md` — 所有端点规格
4. 按需阅读 `backend-guide.md` / `frontend-guide.md` / `db-schema.md` / `ai-prompts.md`

📋 **修改规范**（硬性）：
- 改 API → 同步更新 `docs/api-reference.md` + 追加 `docs/changelog.md`
- 改表结构 → 同步更新 `docs/db-schema.md` + 加 `db.MIGRATIONS`
- 改提示词 → 同步更新 `docs/ai-prompts.md`
- 做架构决策 → 新增 `docs/decisions.md` 中的 ADR

---

## 架构亮点

- 🔴 **三层分层**（ADR-007）：router 仅做 HTTP 边界；service 负责业务；repository 单表 CRUD
- 🔴 **SSE JSON 协议**（ADR-005）：chunk 用 JSON 包裹避免换行破坏协议，支持 error / status / done 事件
- 🔴 **SQLite WAL + 外键级联**
- 🔴 **高亮坐标归一化**（ADR-006）：CSS px 存储 at zoom=1，渲染时 × 当前 scale
- 🔴 **LLM 全部可 mock**（conftest 的 mock_llm / mock_llm_response），测试永不打真实 API
- 🔴 **HTTP 而非 Electron IPC**（ADR-012）：后端可独立跑，便于未来 Web / MCP 部署
- 🔴 **反向 .gitignore（whitelist）**：根目录 `*` + 每个子目录自己的白名单，新增 artefact 必须显式许可
- 🔴 **AI 功能三档预算**（保守 / 平衡 / 慷慨）+ 逐功能开关，避免无意中炸 token

---

## 许可

MIT
