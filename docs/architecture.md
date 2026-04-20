# Architecture — 架构详解

> 本文描述**系统如何组合、数据如何流动、为何这样分层**。

---

## 1. 进程拓扑

```
┌─────────────────────────────────────────────────────────────┐
│  Electron Main Process (Node.js)                            │
│   - 启动/监控 Python 子进程                                  │
│   - 窗口、菜单、IPC                                          │
│   - 不访问业务逻辑                                           │
└─────┬───────────────────────────────────────┬───────────────┘
      │ spawn                                 │ loadURL
      ▼                                       ▼
┌──────────────────────┐         ┌──────────────────────────┐
│ Python Backend       │◀────────│ Renderer Process (Chrome)│
│ FastAPI @ :8000      │  HTTP   │ React + Vite @ :5173(dev)│
│ - routers/           │  + SSE  │ file:// (prod)           │
│ - services/          │         │                          │
│ - repositories/      │         │                          │
│ - models/            │         │                          │
└─────────┬────────────┘         └──────────────────────────┘
          │
          ▼
┌──────────────────────┐
│ data/                │
│  ├─ reader.db (WAL)  │
│  ├─ papers/*.pdf     │
│  └─ config.json      │
└──────────────────────┘
```

**关键点**
- 🔴 Electron Main **只做进程管理和窗口**，绝不做业务逻辑。业务全在 Python 后端。
- 🔴 Renderer 与 Backend 通过 HTTP + SSE 通信，**不走 IPC**。这样将来可以脱离 Electron 跑（纯 Web 模式也行）。
- 🟡 Python 子进程死了要能自动重启（见 `dev-tips.md#backend-crash`）。

---

## 2. 后端分层

```
backend/
├── main.py              ← FastAPI app 装配、中间件、启动钩子
├── db.py                ← 连接池、init_db()、get_session()
├── models.py            ← SQLModel 表定义（Paper, Highlight, Note, Chat）
├── schemas.py           ← Pydantic 请求/响应 DTO（与 models 分离！）
├── errors.py            ← 统一异常类 + 全局 handler
├── logging_conf.py      ← 结构化日志配置
├── routers/             ← HTTP 层：只做参数校验、调用 service、返回响应
│   ├── papers.py
│   ├── highlights.py
│   ├── notes.py
│   ├── ai.py
│   └── config.py
├── services/            ← 业务逻辑层：跨表操作、外部调用（LLM）
│   ├── pdf_parser.py
│   ├── llm_service.py
│   ├── note_service.py
│   └── export_service.py
└── repositories/        ← 数据访问层：单表 CRUD、复杂查询
    ├── paper_repo.py
    ├── highlight_repo.py
    ├── note_repo.py
    └── chat_repo.py
```

### 分层规则 🔴

| 层 | 可以调用 | 绝不调用 |
|----|---------|----------|
| router | service, schemas, errors | repository（必须经 service） |
| service | repository, other service, errors | FastAPI 装饰器、Request/Response |
| repository | models, db.get_session() | service, router |

**Why**：将来若要把后端换成 gRPC、CLI、MCP server，只需换 router 层，service/repository 不动。

---

## 3. 前端分层

```
frontend/src/
├── main.tsx             ← React root，挂载 App
├── App.tsx              ← 路由 + 顶层布局 + Provider
├── api.ts               ← 所有 HTTP 调用封装（🔴 组件不直接 fetch）
├── types.ts             ← 共享 TS 类型
├── store/               ← 全局状态（Context + useReducer）
│   ├── paper-store.tsx  ← 当前打开的论文、高亮列表
│   ├── ai-store.tsx     ← 对话历史、流式缓冲
│   └── ui-store.tsx     ← activeColor、选中的高亮等 UI 状态
├── hooks/
│   ├── useHighlight.ts
│   ├── useStream.ts
│   ├── useDebouncedSave.ts  ← 防抖保存工具
│   └── usePdfPage.ts        ← 页面级渲染控制
├── components/
│   ├── PdfReader.tsx
│   ├── AiPanel.tsx
│   ├── NotesPanel.tsx
│   ├── Toolbar.tsx
│   ├── ContextMenu.tsx
│   └── common/          ← 通用小组件（Button、Modal 等）
├── lib/                 ← 纯函数工具（无 React 依赖）
│   ├── markdown.ts      ← 渲染/解析 MD
│   ├── uuid.ts
│   └── color.ts
└── styles/
    └── globals.css      ← Tailwind 入口 + CSS 变量
```

### 分层规则 🔴

| 层 | 可以 | 不可以 |
|----|------|--------|
| components | 调 hooks、store、lib | 直接 fetch（走 api.ts） |
| hooks | 调 api.ts、lib、store | 渲染 JSX |
| store | 管状态、调 api.ts | 依赖 components |
| lib | 纯函数 | 调用 React API、有副作用 |

---

## 4. 关键数据流

### 4.1 划词 → AI 解释 → 保存笔记

```
User selects text
    │
    ▼
PdfReader 的 onMouseUp
    │
    ▼
useHighlight.captureSelection() ──────► 得到 {text, position}
    │
    ▼  右键 ContextMenu
    │  "AI 解释选中内容"
    ▼
1. POST /papers/{id}/highlights  ──► 保存高亮（返回 highlight.id）
2. POST /ai/explain (SSE)         ──► 流式 chunk
    │
    ▼
AiPanel 实时渲染（setState 每 chunk）
    │
    ▼  用户点"存为笔记"
    ▼
POST /papers/{id}/notes
  {highlight_id, content, source: "ai_answer"}
    │
    ▼
NotesPanel 通过 store 自动刷新
```

**性能注意** 🟡
- AI 流式响应时，每 chunk 触发 React 渲染。**合并 50ms 内的 chunk**（用 `useStream.ts` 内部 buffer）避免过度重渲。
- 高亮保存不要阻塞 UI：**先在前端显示（乐观更新）**，失败再回滚。

### 4.2 打开论文 → 加载页面 + 高亮

```
User clicks paper in list
    │
    ▼
GET /papers/{id}  (元数据)
GET /papers/{id}/highlights  (所有高亮)
GET /papers/{id}/file  (PDF 二进制，走 Range 请求支持大文件)
    │
    ▼
react-pdf 按需渲染当前页 ± 1 页（虚拟化）
    │
    ▼
高亮按 page 过滤，只给当前可见页渲染 overlay
```

**性能注意** 🔴
- 大 PDF（100+ 页）绝不全量渲染。react-pdf 的 `<Document>` 自带懒加载，但要配合 `IntersectionObserver` 精确控制 DOM 数量。
- 高亮列表按 page 分组存 `Map<page, Highlight[]>`，O(1) 查询当前页。

### 4.3 导出 Markdown

```
User clicks export
    │
    ▼
GET /papers/{id}/export
    │
    ├─ export_service 读 highlights + notes
    ├─ 按 page 升序、page 内按 y 坐标升序排序
    ├─ 按颜色分组标注
    └─ 拼装 Markdown 文本
    │
    ▼
Response: text/markdown
    │
    ▼
前端 Blob 下载
```

---

## 5. 并发与数据一致性

### 5.1 SQLite 并发
- 🔴 **启用 WAL 模式**：`PRAGMA journal_mode=WAL;`（见 `db-schema.md`）
- SQLite 同时只能一个 writer，但 WAL 下 reader 不阻塞 writer。本应用单用户，问题不大。
- 🟡 高亮连续创建：前端应**本地排队串行发送**，不要并发 POST（避免写锁抢占）。

### 5.2 AI 流式中断
- 用户关闭窗口 / 切换论文时，前端要 **abort 当前 SSE**（`AbortController`）
- 后端在 `async for chunk` 被取消时应捕获 `asyncio.CancelledError`，不要继续调用 LLM（浪费 token）

### 5.3 启动时序
- Electron main 启动 Python → **轮询** `/docs`（不用 `/health` 因为 FastAPI 默认有 `/docs`）
- 后端 init_db 在 startup 事件里**阻塞完成**后才开始接受请求
- 前端首次 `GET /papers` 失败要**重试 3 次**（应对慢启动）

---

## 6. 安全边界

| 风险 | 缓解 | 优先级 |
|------|------|--------|
| API Key 明文存盘 | v1: 文件权限 600；v2: Electron `safeStorage` / OS keychain | 🟡 v2 |
| PDF 恶意文件 | PyMuPDF 已经沙箱化，不执行；限制上传 100MB | 🔴 |
| SQL 注入 | SQLModel/SQLAlchemy 参数化，不拼 SQL | 🔴 |
| CORS | 仅允许 `localhost:5173` 和 `file://` | 🔴 |
| 路径遍历 | 文件名 UUID 化存储，不用用户上传名 | 🔴 |
| LLM prompt injection | 系统提示词 + 用户内容明确分离；不给 LLM 执行工具的权限 | 🟡 |

---

## 7. 性能预算

| 指标 | 目标 | 降级方案 |
|------|------|----------|
| PDF 首页渲染 | <1s（50 页内） | 显示 loading |
| 高亮保存 | <100ms | 乐观更新 + 后台重试 |
| AI 首 chunk | <2s | 显示"思考中..." |
| 导出 MD（200 高亮） | <500ms | — |
| 启动到首屏 | <3s | splash screen |

---

## 8. 待决定（Open Questions）

- [ ] 是否支持多选 PDF 批量上传？
- [ ] 是否支持 PDF 文本选中跨页？（当前设计单页）
- [ ] 是否支持高亮注释（highlight.note）的富文本？
- [ ] 是否需要全文搜索？（可加 SQLite FTS5）
- [ ] 云同步？（超出 v1 范围）

决定后挪到 `decisions.md`。
