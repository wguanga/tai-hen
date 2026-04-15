# .claude/ — Paper Reader 开发手册索引

> 本目录是 `CLAUDE.md` 的**深度补充**，非重复。按需加载，节省 token。
>
> CLAUDE.md = 项目规格书（what 必须实现）；本目录 = 开发手册（how 高效实现、why 这样设计、pitfalls）。

---

## 按"我现在在做什么"选择要读的文件

| 正在做… | 先读 |
|--------|------|
| 第一次上手，理解全貌 | `architecture.md` |
| 写/改 API 端点 | `api-reference.md` + `backend-guide.md` |
| 写 SQL 或加表字段 | `db-schema.md` |
| 写 React 组件 / Hook | `frontend-guide.md` |
| 改 LLM 提示词或切换模型 | `ai-prompts.md` |
| 不知道某个命名/错误码怎么定 | `conventions.md` |
| 卡住了、要调试 | `dev-tips.md` |
| 想知道为什么选了某个技术 | `decisions.md` |
| 要修改设计 | 改对应文件 + 追加一条 `changelog.md` |

---

## 文件清单

| 文件 | 内容 | 何时更新 |
|------|------|---------|
| `README.md` | 本文件，索引 | 新增/删除文档时 |
| `architecture.md` | 分层架构、进程边界、关键数据流 | 重大设计变更 |
| `api-reference.md` | 完整 API 规范、错误码、SSE 细节 | 新增/修改端点 |
| `db-schema.md` | DDL、索引、WAL、常用查询、演进策略 | 改表结构 |
| `frontend-guide.md` | 组件树、状态管理、Hooks、性能策略 | 新增组件/全局状态 |
| `backend-guide.md` | 模块分层、Repository、错误处理、日志 | 改模块边界 |
| `ai-prompts.md` | 所有 LLM 系统提示词（集中版本化） | 每次改提示词 |
| `conventions.md` | 命名、错误格式、日期/ID 约定 | 补充新规范 |
| `dev-tips.md` | 启动命令、调试方法、常见坑 | 遇到新坑时 |
| `decisions.md` | ADR（架构决策记录） | 做出不可逆决策时 |
| `changelog.md` | 设计变更日志 | **每次改设计必填** |

---

## 使用约定（给未来的 Claude）

1. **不要在 `CLAUDE.md` 和本目录间复制内容**。若两边都写，以 `CLAUDE.md` 为准，本目录删除。
2. **改代码前先查 `decisions.md`**。若决策已记录，遵守；若要推翻，追加新 ADR 说明原因。
3. **改架构后**：更新相关文件 + 在 `changelog.md` 记一行（日期 + 改了什么 + 原因）。
4. **遇到新坑**：追加 `dev-tips.md`。下一次类似问题直接查，不要重走一遍。
5. **代码里不写"为什么这样做"的长注释**，写一行指向 `decisions.md#adr-xxx`。

---

## 优先级标记

文中会使用标记：
- 🔴 **必须**：不遵守会直接出 bug
- 🟡 **建议**：有更好的方式但不致命
- 🟢 **可选**：未来优化项，不影响 v1
