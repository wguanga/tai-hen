# Architecture Decision Records (ADR)

> 记录**做出时成本高、推翻成本高**的决策。日常选择（变量名、小工具库）不入档。
>
> 格式：编号 + 状态 + 日期 + 背景 + 决定 + 代价 + 代替方案。

---

## ADR-001 · 用 SQLite 而非 PostgreSQL
**状态**：Accepted · **日期**：2026-04-15

**背景**：单机本地应用，单用户。
**决定**：SQLite + WAL。
**代价**：
- 不支持真正并发写（单用户可接受）
- 全文搜索需额外 FTS5
**代替方案（已弃）**：
- Postgres：需另起进程、用户安装负担、性能过剩
- DuckDB：分析型，OLTP 不如 SQLite 成熟

---

## ADR-002 · FastAPI 而非 Django/Flask
**状态**：Accepted · **日期**：2026-04-15

**背景**：需要 async（LLM 流式）+ 轻量（打包体积）。
**决定**：FastAPI + uvicorn。
**代价**：生态比 Django 小，没有 admin 面板。
**代替方案**：
- Flask：同步为主，SSE 实现不优雅
- Django：过重，迁移系统对 SQLite 小项目冗余

---

## ADR-003 · react-pdf 而非自写 pdfjs-dist
**状态**：Accepted · **日期**：2026-04-15

**背景**：PDF 渲染是重头，避免重造。
**决定**：react-pdf 7+（基于 pdfjs-dist）。
**代价**：
- 版本升级偶尔 breaking
- 大 PDF 需自己做虚拟化（react-pdf 不自带）
**代替方案**：
- pdfjs-dist 直接用：需自己管 viewport / canvas 生命周期
- PDF.tron 商业 SDK：过重
- 原生 Chromium PDF viewer：无法插入高亮 overlay

---

## ADR-004 · SSE 而非 WebSocket
**状态**：Accepted · **日期**：2026-04-15

**背景**：LLM 流式是单向服务器→客户端。
**决定**：SSE（EventSource-兼容）。
**代价**：
- 浏览器 EventSource 不支持 POST；须用 fetch + ReadableStream
- 无内置重连逻辑
**代替方案**：
- WebSocket：全双工过剩；多一套协议
- 轮询：延迟大，不适合流式

---

## ADR-005 · SSE chunk 用 JSON 包裹
**状态**：Accepted · **日期**：2026-04-15

**背景**：CLAUDE.md 最初 `data: {纯文本}\n\n`。
**问题**：chunk 中的 `\n` 会破坏协议，且无法承载 metadata（done、error、token 统计）。
**决定**：`data: {"type":"chunk|done|error",...}\n\n`。
**代价**：每个事件多~20 字节。
**影响**：前端 `useStream.ts` 需解析 JSON（见 `frontend-guide.md#31`）。

---

## ADR-006 · 高亮坐标用 CSS px 存储，scale=1 归一化
**状态**：Accepted · **日期**：2026-04-15

**背景**：PDF 可缩放，位置需跨 scale 一致。
**决定**：
- 捕获时：`(clientRect.x - pageRect.x) / currentScale`
- 渲染时：`x * currentScale`
**代价**：每次渲染多一次乘法（可忽略）。
**代替方案（已弃）**：
- 存 PDF 原生坐标（72 DPI 点）：换算复杂
- 按 viewport px 存：换缩放错位

---

## ADR-007 · 分层：router / service / repository
**状态**：Accepted · **日期**：2026-04-15

**背景**：CLAUDE.md 里 service 直接操作 DB，耦合度高。
**决定**：加 repository 层，service 调 repo。
**代价**：文件数+，简单 CRUD 多一层转发。
**收益**：
- 单元测试 service 时可 mock repo
- 将来换 ORM（不太会）成本低
- 跨表事务集中在 service

---

## ADR-008 · 状态管理用 Context + useReducer，不引入 Redux/Zustand
**状态**：Accepted · **日期**：2026-04-15

**背景**：应用状态简单（3 个域）。
**决定**：三个 Provider（PaperStore / AiStore / UiStore）。
**代价**：
- 跨 Provider 选择性订阅需自己拆
- Context value 每次 new 对象会触发全树重渲 → 用 `useMemo` + 分片 Provider
**代替方案**：
- Redux Toolkit：模板代码多
- Zustand：增依赖；优势在 v1 用不上

---

## ADR-009 · API Key 存储：v1 明文 + 文件权限
**状态**：Accepted（临时） · **日期**：2026-04-15

**背景**：本地单用户，但明文总归有风险。
**决定**：
- **v1**：`data/config.json` 明文，文件权限 600（Windows 用 ACL）
- **v2**：切 Electron `safeStorage.encryptString()`（系统 keychain）
**代价**：v1 下被其他应用/脚本读到。
**缓解**：
- 启动时检查文件权限，不对则警告
- GET /config 不返回明文
- 日志脱敏（不 log api_key）

---

## ADR-010 · PDF 上传去重：SHA256
**状态**：Accepted · **日期**：2026-04-15

**背景**：用户可能重复上传同一 PDF。
**决定**：入库前算 SHA256，查 `papers.file_hash`，命中则返回旧记录 + 删新文件。
**代价**：100MB 文件计算哈希约 0.3s（一次性）。
**收益**：避免重复占空间，复用已有高亮/笔记。

---

## ADR-011 · FastAPI lifespan 而非 @on_event
**状态**：Accepted · **日期**：2026-04-15

**背景**：`@app.on_event("startup")` FastAPI 0.95 起已 deprecated。
**决定**：用 `@asynccontextmanager lifespan`。
**代价**：无。
**影响**：`backend/main.py` 启动逻辑走 `lifespan`。

---

## ADR-012 · HTTP 而非 Electron IPC
**状态**：Accepted · **日期**：2026-04-15

**背景**：Electron 提供 IPC，但前后端通过 HTTP + SSE 通信。
**决定**：坚持 HTTP。
**收益**：
- 后端可脱离 Electron 跑（纯 Web、CLI 调用、未来 MCP）
- DevTools 网络面板直观
- 与 Electron 升级解耦
**代价**：
- 本地 TCP 开销（忽略不计）
- 需绑端口（固定 8000；被占用要自动让步）

**后续（🟡 TODO）**：端口占用自动让步 + 把实际端口写入 `data/runtime.json` 给前端读。

---

## ADR 状态流转

- **Proposed**：草案，未采纳
- **Accepted**：当前有效
- **Superseded**：被 ADR-NNN 替代（保留历史）
- **Deprecated**：不再使用但未替代（罕见）

推翻某决策时：原 ADR 改 `Superseded by ADR-NNN`，新增 ADR 说明新选择。
