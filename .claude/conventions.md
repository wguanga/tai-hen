# Conventions — 命名与格式约定

> 遇到命名/格式困惑先查本文。没有覆盖的场景按主流语言惯例（PEP8 / Airbnb TS）。

---

## 1. 标识符命名

### Python
| 对象 | 规则 | 例 |
|------|------|-----|
| 文件/模块 | snake_case | `pdf_parser.py` |
| 类 | PascalCase | `PaperRepo` |
| 函数/变量 | snake_case | `get_context_around` |
| 常量 | UPPER_SNAKE | `MAX_SIZE` |
| 私有 | 前缀 `_` | `_set_pragmas` |

### TypeScript
| 对象 | 规则 | 例 |
|------|------|-----|
| 组件文件 | PascalCase.tsx | `AiPanel.tsx` |
| Hook 文件 | useXxx.ts | `useStream.ts` |
| 非组件 TS | kebab-case | `paper-store.tsx`（Provider 组件也算） |
| 类型 | PascalCase | `HighlightColor` |
| 常量 | UPPER_SNAKE | `COLOR_HEX` |
| 函数/变量 | camelCase | `captureSelection` |

🟡 Tailwind 类名：按功能分组，自上而下（布局→盒模型→排版→颜色→状态）：
```tsx
className="flex items-center gap-2 px-3 py-1 text-sm text-gray-700 hover:bg-gray-100"
```

---

## 2. ID 与日期

- 🔴 主键**全部 UUID v4 字符串**，不用自增整数
- 🔴 时间戳**全部 ISO8601 UTC 毫秒**：`2026-04-15T08:30:00.000Z`
- 前端显示时转本地：`new Date(iso).toLocaleString()`
- 后端生成：`datetime.utcnow().isoformat(timespec="milliseconds") + "Z"`

---

## 3. 错误响应格式 🔴

后端 JSON：
```json
{"error": {"code": "PAPER_NOT_FOUND", "message": "...", "detail": {...}}}
```
前端捕获：
```ts
class ApiError extends Error {
  constructor(public code: string, message: string, public detail?: any) { super(message); }
}
```
错误码清单见 `api-reference.md#03-错误码表`。

---

## 4. Git 提交（如果用 git）

```
<type>(<scope>): <subject>

<body>
```

type ∈ `feat | fix | refactor | docs | style | test | chore | perf`

例：
```
feat(ai): add streaming cancellation on client disconnect
fix(highlight): restore position after zoom change
docs(.claude): update db-schema with WAL notes
```

---

## 5. 导出 Markdown 模板 🔴

`GET /papers/{id}/export` 返回：

```markdown
# {paper.title}

> 作者：{authors.join(", ")}  |  年份：{year}  |  页数：{total_pages}
> 导出时间：{now ISO}

---

## 摘要笔记
{若有 source=ai_summary 的笔记，放在这里}

---

## 高亮与笔记

### 第 {page} 页

> 🟨 **重要概念** [{hl.created_at}]
> {highlight.text}
>
> **笔记：** {note.content}
>
> ---
>
> 🟦 **方法细节** ...

### 第 {page+1} 页
...

---

## 独立笔记
{source=manual 且 highlight_id=NULL 的笔记}

---

*本文件由 Paper Reader 自动生成*
```

颜色 emoji 映射：
- yellow → 🟨
- blue → 🟦
- green → 🟩
- purple → 🟪

排序：page 升序，page 内按 `position.y` 升序。

---

## 6. 文件头

**禁止**添加装饰性文件头（作者、版权等）。代码应自解释。

仅允许：
- 复杂模块首行一句话职责描述（`"""PDF 元数据提取与文本上下文。"""`）
- 永远**不写**"此文件由 xxx 生成"类注释（除非是构建工具输出）

---

## 7. 注释规则 🔴

默认不写注释。仅当下列情况写：
- 非显而易见的 WHY（约束、陷阱、外部依赖的怪癖）
- 引用某个 ADR：`# See .claude/decisions.md#adr-003`
- 临时 `# TODO(v2): ...` 必须带人名/版本标签

不写：
- 解释 WHAT（代码已说明）
- 历史性说明（"原来用的是 X，现在改为 Y"）
- 反复出现的 docstring 模板

---

## 8. 日志级别

| 级别 | 用途 |
|------|------|
| DEBUG | 详细追踪，默认不输出 |
| INFO | 业务流转（上传成功、高亮创建） |
| WARNING | 可恢复的异常（LLM 重试、配置回退） |
| ERROR | 不可恢复（未知异常 handler 捕获） |

```python
logger.info("paper.uploaded id=%s pages=%d", paper.id, paper.total_pages)
```
🟡 用 `%s` 占位符而不是 f-string，避免未采样时字符串拼接开销。

---

## 9. 路径与 URL

- 后端**相对路径**：都相对于项目根 `D:/study/code/paper/`，通过 `os.getcwd()` 或 `Path(__file__).parent.parent` 锚定
- 文件存储：`data/papers/{uuid}.pdf`
- 配置：`data/config.json`
- DB：`data/reader.db`
- 日志：`data/logs/app.log`

🔴 **不要硬编码绝对路径**（除了 Electron main 里的 window url）

---

## 10. 环境变量

v1 避免使用环境变量，所有配置走 `data/config.json`。

仅允许：
- `DATA_DIR`：测试时重定向数据目录
- `NODE_ENV` / `PAPER_READER_ENV`：区分 dev / prod（影响日志级别、Electron loadURL）
