# docs/ — 项目文档

> 项目的**工程文档**：架构、API、数据库、前后端指南、LLM 提示词、命名约定、开发技巧、ADR、变更日志。
>
> 根目录 `README.md` = 项目入口 · 本目录 = 展开说明。

---

## 文件清单

| 文件 | 内容 |
|------|------|
| `architecture.md` | 分层架构、进程边界、关键数据流、性能预算、安全边界 |
| `api-reference.md` | 完整 HTTP API 规范 + 错误码 + SSE 细节 |
| `db-schema.md` | 数据库 DDL、索引、WAL 配置、迁移策略 |
| `frontend-guide.md` | 组件树、状态管理、Hooks、虚拟化、性能策略 |
| `backend-guide.md` | 模块分层（router/service/repository）、错误处理、日志 |
| `ai-prompts.md` | 所有 LLM 系统提示词（集中版本化） |
| `conventions.md` | 命名、日期、ID、错误响应格式、导出模板、日志级别 |
| `dev-tips.md` | 启动命令、调试方法、常见坑 |
| `decisions.md` | 架构决策记录（ADR） |
| `changelog.md` | 设计变更日志 |

---

## 文档维护规则

| 改什么 | 同步更新 |
|-------|---------|
| HTTP API 增删改 | `api-reference.md` + `changelog.md` |
| DB 表结构 | `db-schema.md` + `backend/db.py` 迁移 |
| LLM 提示词 | `ai-prompts.md` + `changelog.md` |
| 前端组件/状态 | `frontend-guide.md` |
| 后端模块边界 | `backend-guide.md` |
| 命名/错误码规范 | `conventions.md` |
| 重要架构决定 | 新增 `decisions.md` 里一条 ADR |
| 任何改动 | **追 `changelog.md` 一行** |

---

## 优先级标记

文中会使用标记：
- 🔴 **必须**：不遵守会直接出 bug
- 🟡 **建议**：有更好的方式但不致命
- 🟢 **可选**：未来优化项，不影响 v1
