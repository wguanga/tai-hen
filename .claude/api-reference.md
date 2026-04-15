# API Reference — 完整接口规范

> 本文是**权威 API 参考**。CLAUDE.md 只列概要，以本文为准。Base URL: `http://127.0.0.1:8000`

---

## 0. 通用约定

### 0.1 请求格式
- 所有 JSON 请求：`Content-Type: application/json`
- 文件上传：`multipart/form-data`
- ID 一律 UUID v4 字符串（不是整数）

### 0.2 响应格式

**成功**：HTTP 2xx，`Content-Type: application/json` 或 `text/event-stream`

**错误**：统一格式 🔴
```json
{
  "error": {
    "code": "PAPER_NOT_FOUND",
    "message": "论文不存在或已删除",
    "detail": {"paper_id": "xxx"}
  }
}
```

### 0.3 错误码表

| code | HTTP | 含义 |
|------|------|------|
| `VALIDATION_ERROR` | 422 | 请求体字段校验失败 |
| `PAPER_NOT_FOUND` | 404 | 论文不存在 |
| `HIGHLIGHT_NOT_FOUND` | 404 | 高亮不存在 |
| `NOTE_NOT_FOUND` | 404 | 笔记不存在 |
| `FILE_TOO_LARGE` | 413 | PDF 超过 100MB |
| `INVALID_PDF` | 400 | PyMuPDF 打不开 |
| `LLM_CONFIG_MISSING` | 400 | 未配置 API Key |
| `LLM_UPSTREAM_ERROR` | 502 | OpenAI/Anthropic 返回错误 |
| `LLM_RATE_LIMITED` | 429 | 上游限流 |
| `INTERNAL_ERROR` | 500 | 兜底 |

### 0.4 日期
- 🔴 全部 ISO8601 UTC：`2026-04-15T08:30:00.000Z`
- 前端用 `new Date(iso)` 转本地时区显示

---

## 1. Papers（论文管理）

### POST `/papers/upload`
上传 PDF。

**请求**：`multipart/form-data`
| 字段 | 类型 | 必填 | 说明 |
|-----|------|-----|------|
| `file` | File | ✓ | PDF，≤100MB |

**响应 200**：完整 Paper 对象
```json
{
  "id": "7c9e6b...",
  "title": "Attention Is All You Need",
  "authors": ["Ashish Vaswani", "Noam Shazeer"],
  "year": 2017,
  "file_path": "papers/7c9e6b.pdf",
  "total_pages": 15,
  "created_at": "2026-04-15T08:30:00.000Z"
}
```

**可能错误**：`FILE_TOO_LARGE`, `INVALID_PDF`

---

### GET `/papers`
列出所有论文，按 `created_at` 倒序。

**查询参数**（均可选）：
| 参数 | 类型 | 说明 |
|-----|------|------|
| `limit` | int | 默认 50，最大 200 |
| `offset` | int | 默认 0 |
| `q` | string | 标题模糊匹配（LIKE） |

**响应 200**：
```json
{
  "items": [ {...Paper} ],
  "total": 42
}
```

---

### GET `/papers/{id}`
单篇详情。

**响应 200**：Paper 对象  
**错误**：`PAPER_NOT_FOUND`

---

### GET `/papers/{id}/file` 🔴 **CLAUDE.md 未列但必须实现**
返回 PDF 二进制。支持 Range 请求（前端分片加载大文件）。

**请求头**（可选）：`Range: bytes=0-1023`

**响应**：
- 200：`Content-Type: application/pdf`，完整文件
- 206：`Content-Range: bytes 0-1023/102400`，分片
- 404：`PAPER_NOT_FOUND`

**实现要点**：用 FastAPI `FileResponse(path, media_type="application/pdf")`，自动处理 Range。

---

### DELETE `/papers/{id}`
删除论文及所有关联 highlights/notes/chats。级联删除通过外键 `ON DELETE CASCADE`。

**响应 204**：空体

---

## 2. Highlights（高亮）

### POST `/papers/{paper_id}/highlights`

**请求体**：
```json
{
  "text": "选中的原文（必填，长度 2-5000）",
  "color": "yellow",
  "page": 3,
  "position": {
    "x": 100, "y": 200,
    "width": 300, "height": 20,
    "rects": [
      {"x": 100, "y": 200, "width": 150, "height": 20},
      {"x": 100, "y": 222, "width": 180, "height": 20}
    ]
  },
  "note": null
}
```

**约束**：
- `color` ∈ `yellow | blue | green | purple` 🔴
- `rects` 至少 1 项
- 坐标单位：**相对该页容器 div 的 CSS 像素**（不是 PDF 原生坐标）

**响应 200**：完整 Highlight 对象（新增 `id`, `created_at`）

---

### GET `/papers/{paper_id}/highlights`

**查询参数**：
| 参数 | 说明 |
|-----|------|
| `page` | 可选，只返回该页 |
| `color` | 可选，过滤颜色 |

**响应 200**：
```json
{"items": [ {...Highlight} ]}
```

---

### PUT `/papers/{paper_id}/highlights/{id}`
只支持改 `color` 和 `note`。不支持改 `text` / `position`（那是另外画一个）。

**请求体**：
```json
{"color": "green", "note": "..."}
```

**响应 200**：更新后的 Highlight

---

### DELETE `/papers/{paper_id}/highlights/{id}`
级联删除该 highlight 下的 notes（`highlight_id` 字段）。

**响应 204**

---

## 3. Notes（笔记）

### POST `/papers/{paper_id}/notes`

```json
{
  "highlight_id": "xxx|null",
  "title": "可选，<=100 字",
  "content": "Markdown 正文",
  "source": "manual"
}
```

`source` ∈ `manual | ai_answer | ai_summary` 🔴

**响应 200**：Note 对象

---

### GET `/papers/{paper_id}/notes`

**查询参数**：
| 参数 | 说明 |
|-----|------|
| `highlight_id` | 过滤某高亮下的笔记 |
| `source` | 过滤来源 |

**响应 200**：`{"items": [...]}`

---

### PUT `/papers/{paper_id}/notes/{id}`
支持改 `title`, `content`。不改 `source`/`highlight_id`（那是另一条）。

---

### DELETE `/papers/{paper_id}/notes/{id}` → 204

---

### GET `/papers/{paper_id}/export`
导出 Markdown。

**查询参数**：
| 参数 | 说明 |
|-----|------|
| `include_ai` | 默认 true，是否包含 AI 回答 |
| `group_by` | `page`(默认) \| `color` |

**响应 200**：
```
Content-Type: text/markdown; charset=utf-8
Content-Disposition: attachment; filename="<title>-notes.md"
```

正文模板见 `.claude/conventions.md#export-template`。

---

## 4. AI（流式）

所有端点返回 `text/event-stream`。

### SSE 事件格式 🔴

```
data: {"type":"chunk","text":"计算"}

data: {"type":"chunk","text":"分三步"}

data: {"type":"done"}

```

**为何包 JSON？** 🟡  
CLAUDE.md 里写的是 `data: 计算\n\n` 裸文本。**改为 JSON 更稳**：
- chunk 里若含 `\n` 会破坏 SSE 协议
- 将来易扩展（error event、metadata 等）

前端 `useStream.ts` 对应改为：
```ts
const parsed = JSON.parse(line.slice(6));
if (parsed.type === 'done') { onDone(); return; }
if (parsed.type === 'error') { onError(parsed.message); return; }
if (parsed.type === 'chunk') onChunk(parsed.text);
```

### 错误事件
```
data: {"type":"error","code":"LLM_UPSTREAM_ERROR","message":"..."}

```

---

### POST `/ai/explain`
```json
{
  "paper_id": "...",
  "highlight_id": "...|null",
  "text": "选中原文",
  "context": "自动提取可不传，传了以请求为准",
  "level": "simple"
}
```
`level` ∈ `simple | technical`

**后端行为** 🟡：
- 若 `context` 未传，用 `pdf_parser.get_context_around()` 提取前后 300 字
- 保存请求到 `chats` 表（role=user），流完整响应后保存 assistant 消息

---

### POST `/ai/translate`
```json
{
  "paper_id": "...",
  "text": "要翻译的英文段落"
}
```

---

### POST `/ai/summarize`
```json
{"paper_id": "..."}
```
后端读整篇 PDF 文本（`pdf_parser.get_all_text`），分块喂给 LLM。
⚠️ 大 PDF 可能超 context 窗口，需截断或 map-reduce。

---

### POST `/ai/chat`
```json
{
  "paper_id": "...",
  "highlight_id": "...|null",
  "messages": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."},
    {"role": "user", "content": "当前问题"}
  ]
}
```
`messages` 由前端维护并传整个历史。后端**不从 DB 读历史**（避免前后不一致）。
但后端会**追加写 DB**：最后一条 user 和最终 assistant。

---

## 5. Config（配置）

### GET `/config`
**响应 200**：
```json
{
  "provider": "openai",
  "model": "gpt-4o",
  "has_api_key": true,
  "base_url": "",
  "ollama_model": "qwen2.5:14b"
}
```
🔴 **绝不返回 api_key 明文**，只返回 `has_api_key: bool`

---

### POST `/config`
**请求体**：
```json
{
  "provider": "openai",
  "model": "gpt-4o",
  "api_key": "sk-...",
  "base_url": "",
  "ollama_model": "qwen2.5:14b"
}
```
- `api_key` 仅在本次请求传；传空串不修改，传 null 清空
- 保存到 `data/config.json`，文件权限 600（Unix），Windows 用 ACL

---

## 6. 速率限制（v1 无需，记录意图）

🟢 v2 可加：每分钟 60 次 AI 请求、每上传 10 文件/分钟。用 `slowapi` 或自写 middleware。

---

## 7. 端点总表

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /papers/upload | 上传 |
| GET | /papers | 列表 |
| GET | /papers/{id} | 详情 |
| GET | /papers/{id}/file | PDF 二进制 |
| DELETE | /papers/{id} | 删除 |
| POST | /papers/{id}/highlights | 创建高亮 |
| GET | /papers/{id}/highlights | 高亮列表 |
| PUT | /papers/{id}/highlights/{hid} | 更新 |
| DELETE | /papers/{id}/highlights/{hid} | 删除 |
| POST | /papers/{id}/notes | 创建笔记 |
| GET | /papers/{id}/notes | 笔记列表 |
| PUT | /papers/{id}/notes/{nid} | 更新 |
| DELETE | /papers/{id}/notes/{nid} | 删除 |
| GET | /papers/{id}/export | 导出 MD |
| POST | /ai/explain | 解释（SSE） |
| POST | /ai/translate | 翻译（SSE） |
| POST | /ai/summarize | 总结（SSE） |
| POST | /ai/chat | 追问（SSE） |
| GET | /config | 获取配置 |
| POST | /config | 保存配置 |
