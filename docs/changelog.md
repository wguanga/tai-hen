# Design Changelog — 设计变更日志

> 🔴 **每次修改设计必填**。追加一行即可，老条目不改。格式：
>
> `YYYY-MM-DD · <文件> · <变更概要> · <原因/ADR 号>`

---

## 2026-04-17 · 文档布局重构：项目文档搬到 docs/，.claude/ 降级为 agent 本地工作区
- `docs/`（新）：所有项目文档（architecture / api-reference / db-schema / frontend-guide /
  backend-guide / ai-prompts / conventions / dev-tips / decisions / changelog）入版本库
- `.claude/`：gitignore；保留 `AGREEMENTS.md`（协作约定）+ `testing.md`（测试规约）+ `README.md`（agent 索引）
- `.gitignore`：`.claude/settings.local.json` 改为 `.claude/`（整目录忽略）
- `CLAUDE.md` / 根 `README.md`：所有 `.claude/*.md` 引用改为 `docs/*.md`
- `docs/README.md` 改写为纯项目文档索引；`.claude/README.md` 改写为 agent 索引（指向两边）
- 原因：用户希望项目交付物（docs）与 agent 工作笔记（.claude）分离
- 影响：其他人 clone 仓库得到干净文档；agent 协作仍完整在本地

## 2026-04-15 · 初始化 .claude/ 文档体系
- `README.md`：新建，索引 + 使用约定
- `architecture.md`：新建，分层架构 + 数据流 + 性能预算
- `api-reference.md`：新建，完整端点、错误码、SSE 协议（**JSON 包裹，与 CLAUDE.md 裸文本不同，见 ADR-005**）
- `db-schema.md`：新建，PRAGMA、索引、迁移、去重字段
- `frontend-guide.md`：新建，Context + useReducer 三 Store、虚拟化、useStream 修正版
- `backend-guide.md`：新建，router/service/repository 三层（见 ADR-007），lifespan（ADR-011）
- `ai-prompts.md`：新建，集中系统提示词，含反 injection 模板、token 预算
- `conventions.md`：新建，命名/日期/错误响应/导出模板
- `dev-tips.md`：新建，启动、SSE 调试、常见坑 11 条
- `decisions.md`：新建，ADR-001 至 ADR-012

## 2026-04-17 · 建立测试基线 + 硬性规约（ADR-013）
- `testing.md`：新建，完整测试规约 + fixture 说明 + mock 约定
- `README.md`：索引新增 testing.md 入口，文件清单加一行
- `decisions.md`：新增 ADR-013（新功能必须配套测试）
- `backend/tests/`：conftest + 6 文件，共 70 测试
- `frontend/src/**/*.test.ts(x)`：3 文件，共 25 测试
- `backend/repositories/paper_repo.py`：修复级联删除 bug（SQLModel 不生成 ON DELETE CASCADE，手工删子表）
- 原因：v0.1 阶段无测试，级联删除 bug 只在写第一条测试时才暴露。立规矩：以后新功能不带测试不算完工

## 2026-04-15 · 对 CLAUDE.md 的**补充/修订**（未改原文，以本目录为准）
| 主题 | CLAUDE.md 原版 | 本目录（以本目录为准） |
|------|---------------|-----------------------|
| SSE 格式 | `data: 纯文本\n\n` | `data: {"type":"chunk","text":"..."}\n\n`（ADR-005） |
| 后端分层 | router + service | router + service + repository（ADR-007） |
| PDF 文件服务 | 仅在"重要开发约定"提到 GET /papers/{id}/file | `api-reference.md#1` 完整规范，含 Range 支持 |
| 高亮缩放 | 未提及 | 存 scale=1 归一化，渲染 ×scale（ADR-006） |
| SQLite PRAGMA | 未提及 | WAL + foreign_keys=ON（🔴，见 db-schema.md） |
| 启动事件 | `@on_event("startup")` | `lifespan`（ADR-011） |
| 错误响应 | 未定义 | 统一 `{"error":{"code","message","detail"}}` |
| 去重 | 未考虑 | 上传 SHA256 去重（ADR-010） |
| API Key 安全 | 明文 config.json | v1 文件权限 600，v2 safeStorage（ADR-009） |
| 流式取消 | 未处理 | FastAPI `request.is_disconnected()` + 前端 AbortController |

---

## 变更模板

复制到上方新增段落：

```
## YYYY-MM-DD · <topic>
- `<file>`: <改了什么>（<why / ADR 号>）
```

例：

```
## 2026-05-20 · 支持 PDF 缩略图
- `db-schema.md`: papers 加 `thumbnail_path` 字段，schema_version→2（MIGRATIONS[2]）
- `api-reference.md`: 新增 GET /papers/{id}/thumbnail
- `backend-guide.md`: services/thumbnail_service.py 职责补录
- `decisions.md`: ADR-013 用 PyMuPDF `page.get_pixmap()` 生成 PNG
- 原因：列表页展示需要视觉区分
```
