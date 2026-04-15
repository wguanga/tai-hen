# Paper Reader — Claude Code Project Specification

> 本地论文精读应用。单机运行，无需联网（除 LLM API 调用外）。
> 双击启动，Electron 壳 + Python 后端 + React 前端 + SQLite 存储。

---

## 项目目标

帮助用户高效精读学术论文 PDF，核心体验：
- 划词高亮（四色分类）
- 选中文字一键 AI 解释（流式输出）
- AI 回答一键存为笔记（关联到高亮原文）
- 右侧笔记面板汇总所有重点
- 导出 Markdown 阅读报告

---

## 目录结构

```
paper-reader/
├── CLAUDE.md                  ← 本文件
├── package.json               ← 根包（Electron + 脚本）
├── electron/
│   └── main.js                ← Electron 入口，启动 Python 子进程 + 打开窗口
├── frontend/                  ← React + Vite + TypeScript
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api.ts             ← 所有后端 API 调用封装
│       ├── components/
│       │   ├── PdfReader.tsx      ← PDF 渲染 + 划词高亮
│       │   ├── AiPanel.tsx        ← 流式问答 + 追问 + 存为笔记
│       │   ├── NotesPanel.tsx     ← 笔记列表 + 高亮汇总 + 导出
│       │   ├── Toolbar.tsx        ← 顶部工具栏（颜色选择、导出等）
│       │   └── ContextMenu.tsx    ← 右键菜单（高亮/解释/笔记）
│       ├── hooks/
│       │   ├── useHighlight.ts    ← 划词选中、颜色标记、持久化
│       │   └── useStream.ts       ← SSE 流式接收工具 hook
│       └── types.ts               ← 共享 TypeScript 类型
├── backend/                   ← Python FastAPI
│   ├── requirements.txt
│   ├── main.py                ← FastAPI app 入口，注册路由
│   ├── db.py                  ← SQLite 连接 + 建表
│   ├── models.py              ← SQLModel 数据模型
│   └── services/
│       ├── pdf_parser.py      ← PDF 解析（PyMuPDF）
│       ├── llm_service.py     ← LLM 统一接口（SSE 流式）
│       └── note_service.py    ← 高亮 + 笔记 CRUD
└── data/                      ← 运行时自动创建
    ├── reader.db              ← SQLite 单文件
    └── papers/                ← 上传的 PDF 存放目录
```

---

## 技术栈

| 层 | 技术 | 版本要求 |
|----|------|--------|
| 桌面壳 | Electron | 28+ |
| 前端框架 | React + TypeScript | React 18, TS 5 |
| 前端构建 | Vite | 5+ |
| CSS | Tailwind CSS | 3+ |
| PDF 渲染 | react-pdf (pdfjs-dist) | react-pdf 7+ |
| 后端框架 | Python FastAPI | 0.110+ |
| ORM | SQLModel | 0.14+ |
| PDF 解析 | PyMuPDF (fitz) | 1.23+ |
| LLM SDK | openai, anthropic | 最新 |
| 数据库 | SQLite（内置，零配置）| — |

---

## 数据库 Schema（SQLite）

文件路径：`data/reader.db`，应用启动时自动创建。

```sql
-- 论文
CREATE TABLE papers (
    id          TEXT PRIMARY KEY,   -- UUID
    title       TEXT NOT NULL,
    authors     TEXT,               -- JSON array string
    year        INTEGER,
    file_path   TEXT NOT NULL,      -- 相对路径，如 papers/xxx.pdf
    total_pages INTEGER,
    created_at  TEXT NOT NULL       -- ISO8601
);

-- 高亮
CREATE TABLE highlights (
    id          TEXT PRIMARY KEY,   -- UUID
    paper_id    TEXT NOT NULL REFERENCES papers(id),
    text        TEXT NOT NULL,      -- 高亮的原文内容
    color       TEXT NOT NULL,      -- 'yellow' | 'blue' | 'green' | 'purple'
    page        INTEGER NOT NULL,
    position    TEXT NOT NULL,      -- JSON: {x, y, width, height, rects:[]}
    note        TEXT,               -- 用户在高亮上的直接备注（可选）
    created_at  TEXT NOT NULL
);

-- 笔记（包括 AI 回答存入的笔记）
CREATE TABLE notes (
    id           TEXT PRIMARY KEY,  -- UUID
    paper_id     TEXT NOT NULL REFERENCES papers(id),
    highlight_id TEXT REFERENCES highlights(id),  -- NULL 表示独立笔记
    title        TEXT,              -- 笔记标题（AI 回答时自动提取）
    content      TEXT NOT NULL,     -- 笔记正文（Markdown）
    source       TEXT NOT NULL,     -- 'manual' | 'ai_answer' | 'ai_summary'
    created_at   TEXT NOT NULL
);

-- 对话历史（每篇论文独立）
CREATE TABLE chats (
    id           TEXT PRIMARY KEY,
    paper_id     TEXT NOT NULL REFERENCES papers(id),
    highlight_id TEXT REFERENCES highlights(id),  -- 关联触发对话的高亮
    role         TEXT NOT NULL,     -- 'user' | 'assistant'
    content      TEXT NOT NULL,
    created_at   TEXT NOT NULL
);
```

---

## 后端 API（FastAPI，运行在 localhost:8000）

### 论文管理

```
POST   /papers/upload          上传 PDF，返回 paper 对象
GET    /papers                 列出所有论文
GET    /papers/{id}            获取单篇论文详情
DELETE /papers/{id}            删除论文及相关数据
```

**POST /papers/upload**
- 接收 `multipart/form-data`，字段名 `file`
- 用 PyMuPDF 提取 title/authors/pages
- 保存文件到 `data/papers/{uuid}.pdf`
- 插入 papers 表，返回完整 paper 对象

### 高亮管理

```
POST   /papers/{id}/highlights          创建高亮
GET    /papers/{id}/highlights          获取该论文所有高亮
PUT    /papers/{id}/highlights/{hid}    更新高亮（颜色/备注）
DELETE /papers/{id}/highlights/{hid}   删除高亮
```

**POST /papers/{id}/highlights** 请求体：
```json
{
  "text": "选中的原文",
  "color": "yellow",
  "page": 3,
  "position": {"x": 100, "y": 200, "width": 300, "height": 20, "rects": []}
}
```

### 笔记管理

```
POST   /papers/{id}/notes         创建笔记
GET    /papers/{id}/notes         获取所有笔记（可 ?highlight_id= 过滤）
PUT    /papers/{id}/notes/{nid}   更新笔记
DELETE /papers/{id}/notes/{nid}   删除笔记
GET    /papers/{id}/export        导出为 Markdown（返回文本）
```

**GET /papers/{id}/export** 返回：
```
Content-Type: text/markdown
# {论文标题} — 阅读笔记

## 摘要
...

## 高亮与笔记

### 第 N 页
> [黄色高亮] 原文内容
**笔记：** AI 解释或手动备注

...

导出时间：2024-01-01
```

### AI 服务（SSE 流式）

```
POST /ai/explain     解释选中文字（SSE）
POST /ai/translate   翻译段落（SSE）
POST /ai/summarize   总结整篇论文（SSE）
POST /ai/chat        追问对话（SSE，带历史）
```

**POST /ai/explain** 请求体：
```json
{
  "paper_id": "uuid",
  "text": "选中的原文片段",
  "context": "该段上下文（前后各200字）",
  "level": "simple"   // "simple" | "technical"
}
```

所有 AI 接口均返回 SSE（Server-Sent Events）：
```
Content-Type: text/event-stream

data: 计算\n\n
data: 分三步\n\n
data: [DONE]\n\n
```

**POST /ai/chat** 请求体：
```json
{
  "paper_id": "uuid",
  "highlight_id": "uuid-or-null",
  "messages": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."},
    {"role": "user", "content": "当前问题"}
  ]
}
```

### 配置

```
GET  /config         获取当前配置（不含 API key 明文）
POST /config         保存配置
```

配置文件存 `data/config.json`：
```json
{
  "provider": "openai",
  "model": "gpt-4o",
  "api_key": "sk-...",
  "base_url": "",
  "ollama_model": "qwen2.5:14b"
}
```
支持 provider: `openai` | `anthropic` | `ollama`

---

## 后端核心实现

### `backend/services/llm_service.py`

```python
import json
from pathlib import Path
from typing import AsyncGenerator

CONFIG_PATH = Path("data/config.json")

def get_config() -> dict:
    if CONFIG_PATH.exists():
        return json.loads(CONFIG_PATH.read_text())
    return {"provider": "openai", "model": "gpt-4o", "api_key": ""}

SYSTEM_PROMPTS = {
    "explain_simple": """你是一个学术论文阅读助手。用简洁易懂的语言（无需专业背景也能理解）解释用户选中的内容。
回答控制在200字以内，先给出核心含义，再给一个生活化的类比。""",

    "explain_technical": """你是一个专业的学术论文解读助手。详细解释用户选中的技术内容，包括：
1. 核心定义与含义
2. 数学原理或算法逻辑（如适用）
3. 在本文中的作用
4. 与相关技术的联系
用中文回答，保留关键英文术语。""",

    "translate": """将以下学术论文段落翻译成中文。要求：
- 保留专业术语的英文原文（首次出现时在括号内注明中文）
- 保留公式符号不翻译
- 保持学术语气
- 保留 [n] 格式的引用编号""",

    "summarize": """请对这篇论文生成结构化阅读笔记，包括：
1. 一句话核心贡献
2. 解决的问题（背景）
3. 主要方法（3-5条）
4. 关键实验结论（3-5条）
5. 局限性或未来工作
用Markdown格式输出。""",

    "chat": """你是一个论文精读助手。用户正在阅读一篇学术论文，根据对话历史和提供的上下文回答问题。
用中文回答，保留关键英文术语。回答要准确、具体，可以追问以确认理解。"""
}

async def stream_llm(messages: list, system: str) -> AsyncGenerator[str, None]:
    config = get_config()
    provider = config.get("provider", "openai")

    if provider == "openai":
        from openai import AsyncOpenAI
        client = AsyncOpenAI(
            api_key=config["api_key"],
            base_url=config.get("base_url") or None
        )
        stream = await client.chat.completions.create(
            model=config.get("model", "gpt-4o"),
            messages=[{"role": "system", "content": system}] + messages,
            stream=True
        )
        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    elif provider == "anthropic":
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=config["api_key"])
        async with client.messages.stream(
            model=config.get("model", "claude-3-5-sonnet-20241022"),
            max_tokens=2048,
            system=system,
            messages=messages
        ) as stream:
            async for text in stream.text_stream:
                yield text

    elif provider == "ollama":
        from openai import AsyncOpenAI
        client = AsyncOpenAI(
            api_key="ollama",
            base_url="http://localhost:11434/v1"
        )
        stream = await client.chat.completions.create(
            model=config.get("ollama_model", "qwen2.5:14b"),
            messages=[{"role": "system", "content": system}] + messages,
            stream=True
        )
        async for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
```

### `backend/services/pdf_parser.py`

```python
import fitz  # PyMuPDF
import re
from pathlib import Path

def extract_metadata(pdf_path: str) -> dict:
    """从 PDF 提取元数据"""
    doc = fitz.open(pdf_path)
    meta = doc.metadata
    
    title = meta.get("title", "")
    if not title:
        # 尝试从第一页提取最大字体文字作为标题
        page = doc[0]
        blocks = page.get_text("dict")["blocks"]
        max_size = 0
        for block in blocks:
            if block.get("type") == 0:
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        if span["size"] > max_size:
                            max_size = span["size"]
                            title = span["text"].strip()
    
    authors_raw = meta.get("author", "")
    authors = [a.strip() for a in re.split(r"[,;]", authors_raw) if a.strip()]
    
    return {
        "title": title or Path(pdf_path).stem,
        "authors": authors,
        "total_pages": len(doc),
    }

def get_page_text(pdf_path: str, page_num: int) -> str:
    """获取指定页的文本内容（用于 AI 上下文）"""
    doc = fitz.open(pdf_path)
    if page_num < 1 or page_num > len(doc):
        return ""
    page = doc[page_num - 1]
    return page.get_text()

def get_context_around(pdf_path: str, page_num: int, target_text: str, window: int = 300) -> str:
    """获取目标文字周围 window 字符的上下文"""
    text = get_page_text(pdf_path, page_num)
    idx = text.find(target_text)
    if idx == -1:
        return text[:600]  # fallback: 返回页面前600字
    start = max(0, idx - window)
    end = min(len(text), idx + len(target_text) + window)
    return text[start:end]
```

### `backend/main.py` 结构

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import uvicorn

app = FastAPI(title="Paper Reader API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "file://"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由模块
from routers import papers, highlights, notes, ai, config as config_router
app.include_router(papers.router, prefix="/papers")
app.include_router(highlights.router, prefix="/papers")
app.include_router(notes.router, prefix="/papers")
app.include_router(ai.router, prefix="/ai")
app.include_router(config_router.router, prefix="/config")

@app.on_event("startup")
async def startup():
    from db import init_db
    init_db()

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
```

### SSE 响应格式（所有 AI 接口统一）

```python
async def sse_generator(text_stream):
    async for chunk in text_stream:
        yield f"data: {chunk}\n\n"
    yield "data: [DONE]\n\n"

# 路由中使用：
return StreamingResponse(
    sse_generator(stream_llm(messages, system_prompt)),
    media_type="text/event-stream",
    headers={"X-Accel-Buffering": "no"}  # 关键：禁止 Nginx 缓冲
)
```

---

## 前端核心实现

### `frontend/src/types.ts`

```typescript
export type HighlightColor = 'yellow' | 'blue' | 'green' | 'purple';

export const COLOR_LABELS: Record<HighlightColor, string> = {
  yellow: '重要概念',
  blue:   '方法细节',
  green:  '实验结论',
  purple: '不理解',
};

export const COLOR_HEX: Record<HighlightColor, string> = {
  yellow: '#FDE68A',
  blue:   '#BAE6FD',
  green:  '#BBF7D0',
  purple: '#E9D5FF',
};

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  file_path: string;
  total_pages: number;
  created_at: string;
}

export interface Highlight {
  id: string;
  paper_id: string;
  text: string;
  color: HighlightColor;
  page: number;
  position: HighlightPosition;
  note?: string;
  created_at: string;
}

export interface HighlightPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  rects: Array<{x: number; y: number; width: number; height: number}>;
}

export interface Note {
  id: string;
  paper_id: string;
  highlight_id?: string;
  title?: string;
  content: string;
  source: 'manual' | 'ai_answer' | 'ai_summary';
  created_at: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
```

### `frontend/src/hooks/useStream.ts`

```typescript
export async function streamSSE(
  url: string,
  body: object,
  onChunk: (chunk: string) => void,
  onDone: () => void
) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') { onDone(); return; }
        onChunk(data);
      }
    }
  }
  onDone();
}
```

### `frontend/src/hooks/useHighlight.ts`

```typescript
// 核心职责：
// 1. 监听 mouseup 事件，获取 window.getSelection()
// 2. 用 Range.getClientRects() 获取精确位置
// 3. 调用 POST /papers/{id}/highlights 保存
// 4. 在 PDF 页面 overlay 上渲染高亮 div（绝对定位，颜色透明覆盖）

import { useState, useCallback } from 'react';
import type { Highlight, HighlightColor, HighlightPosition } from '../types';

export function useHighlight(paperId: string, pageRef: React.RefObject<HTMLDivElement>) {
  const [activeColor, setActiveColor] = useState<HighlightColor>('yellow');
  const [highlights, setHighlights] = useState<Highlight[]>([]);

  const captureSelection = useCallback((): {text: string; position: HighlightPosition} | null => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return null;
    const text = selection.toString().trim();
    if (!text || text.length < 2) return null;

    const range = selection.getRangeAt(0);
    const pageRect = pageRef.current?.getBoundingClientRect();
    if (!pageRect) return null;

    const clientRects = Array.from(range.getClientRects());
    const rects = clientRects.map(r => ({
      x: r.left - pageRect.left,
      y: r.top - pageRect.top,
      width: r.width,
      height: r.height,
    }));

    const xs = rects.map(r => r.x);
    const ys = rects.map(r => r.y);
    return {
      text,
      position: {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...rects.map(r => r.x + r.width)) - Math.min(...xs),
        height: Math.max(...rects.map(r => r.y + r.height)) - Math.min(...ys),
        rects,
      }
    };
  }, [pageRef]);

  const saveHighlight = useCallback(async (page: number, color?: HighlightColor) => {
    const captured = captureSelection();
    if (!captured) return null;
    
    const res = await fetch(`http://localhost:8000/papers/${paperId}/highlights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...captured, page, color: color ?? activeColor }),
    });
    const highlight: Highlight = await res.json();
    setHighlights(prev => [...prev, highlight]);
    window.getSelection()?.removeAllRanges();
    return highlight;
  }, [paperId, activeColor, captureSelection]);

  return { activeColor, setActiveColor, highlights, setHighlights, saveHighlight, captureSelection };
}
```

### `frontend/src/components/AiPanel.tsx` 结构

```typescript
// Props
interface AiPanelProps {
  paperId: string;
  activeHighlight?: Highlight;   // 当前触发解释的高亮
  onSaveNote: (note: Omit<Note, 'id' | 'created_at'>) => void;
}

// 状态
const [messages, setMessages] = useState<ChatMessage[]>([]);
const [streaming, setStreaming] = useState(false);
const [currentResponse, setCurrentResponse] = useState('');

// 发送消息
async function sendMessage(userText: string) {
  setStreaming(true);
  setCurrentResponse('');
  
  const newMessages = [...messages, { role: 'user', content: userText }];
  setMessages(newMessages);

  let fullResponse = '';
  await streamSSE(
    'http://localhost:8000/ai/chat',
    {
      paper_id: paperId,
      highlight_id: activeHighlight?.id,
      messages: newMessages,
    },
    (chunk) => {
      fullResponse += chunk;
      setCurrentResponse(fullResponse);
    },
    () => {
      setMessages(prev => [...prev, { role: 'assistant', content: fullResponse }]);
      setCurrentResponse('');
      setStreaming(false);
    }
  );
}

// 存为笔记按钮
function saveLastAnswer() {
  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant');
  if (!lastAssistant) return;
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  onSaveNote({
    paper_id: paperId,
    highlight_id: activeHighlight?.id,
    title: lastUser?.content.slice(0, 40),
    content: lastAssistant.content,
    source: 'ai_answer',
  });
}
```

### `frontend/src/components/NotesPanel.tsx` 结构

```typescript
// 展示所有笔记，按创建时间倒序
// 每条笔记显示：
//   - 颜色左边框（对应关联高亮的颜色）
//   - 标题（粗体）
//   - 内容（Markdown 渲染，用 react-markdown）
//   - 来源标签（AI 回答 / 手动 / AI 摘要）
//   - 关联原文片段（如果有 highlight_id）
//   - 删除按钮

// 导出按钮：调用 GET /papers/{id}/export，用 Blob 下载
async function exportNotes() {
  const res = await fetch(`http://localhost:8000/papers/${paperId}/export`);
  const text = await res.text();
  const blob = new Blob([text], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${paperTitle}-阅读笔记.md`;
  a.click();
  URL.revokeObjectURL(url);
}
```

---

## 布局结构（App.tsx）

```
┌─────────────────────────────────────────────────────┐
│  Toolbar（高亮颜色选择 · 生成笔记 · 导出 MD）          │  40px
├──────────────────────────────┬──────────────────────┤
│                              │ AiPanel（问答流式）    │
│   PdfReader                  │                      │
│   （PDF 渲染 + 高亮 overlay）  ├──────────────────────┤
│                              │ NotesPanel（笔记列表） │
│   左侧：flex: 1.1             │ 右侧：flex: 0.9       │
│                              │ 右侧上下各占 ~60/40   │
└──────────────────────────────┴──────────────────────┘
│  底部输入栏（追问 input + 发送）                        │  52px
└─────────────────────────────────────────────────────┘
```

高度分配：
- Toolbar：40px（固定）
- 主体区：`calc(100vh - 92px)`（剩余高度，flex）
- 底部输入栏：52px（固定）
- AiPanel 和 NotesPanel 上下分栏：AiPanel `flex: 1`（overflow-y: auto），NotesPanel `height: 220px`（固定，overflow-y: auto）

---

## ContextMenu 行为规范

1. 用户在 PDF 区域选中文字后右键，弹出 ContextMenu（绝对定位在鼠标位置）
2. 菜单选项：
   - **AI 解释选中内容** → 调用 POST /ai/explain，结果出现在 AiPanel，同时保存高亮（默认颜色）
   - **高亮：重要概念（黄）** → 只保存高亮，不触发 AI
   - **高亮：方法细节（蓝）** → 同上
   - **高亮：实验结论（绿）** → 同上
   - **高亮：不理解（紫）** → 保存高亮 + 自动触发 AI 解释
   - **添加手动笔记** → 弹出 inline textarea，输入后保存为 `source: 'manual'` 笔记
3. 点击菜单外任意区域关闭菜单
4. ContextMenu 用 React Portal 渲染到 `document.body`，避免被 overflow:hidden 裁切

---

## 高亮渲染方式

PDF 用 `react-pdf` 渲染，每页是一个 `<div style="position:relative">`。

高亮通过**绝对定位 div**覆盖在 PDF 页面上：
```tsx
// 每个高亮 rect 渲染一个 div
{highlight.position.rects.map((rect, i) => (
  <div
    key={i}
    style={{
      position: 'absolute',
      left: rect.x,
      top: rect.y,
      width: rect.width,
      height: rect.height,
      background: COLOR_HEX[highlight.color],
      opacity: 0.4,
      pointerEvents: 'none',  // 不阻止 PDF 文字选中
      borderRadius: 2,
    }}
  />
))}
```

高亮 div 有 `pointer-events: none`，不影响用户继续选择文字。

---

## Electron 入口（electron/main.js）

```javascript
const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

let pythonProcess = null;

function startBackend() {
  const backendPath = path.join(__dirname, '../backend');
  pythonProcess = spawn('python', ['-m', 'uvicorn', 'main:app', '--port', '8000'], {
    cwd: backendPath,
    stdio: 'pipe',
  });
  pythonProcess.stderr.on('data', d => console.log('[backend]', d.toString()));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',   // macOS 沉浸式
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  // 等待后端就绪（轮询 /docs）
  const waitForBackend = () => {
    fetch('http://localhost:8000/docs')
      .then(() => {
        const isDev = process.env.NODE_ENV === 'development';
        win.loadURL(isDev ? 'http://localhost:5173' : `file://${path.join(__dirname, '../frontend/dist/index.html')}`);
      })
      .catch(() => setTimeout(waitForBackend, 300));
  };
  waitForBackend();
}

app.whenReady().then(() => {
  startBackend();
  setTimeout(createWindow, 500);
});

app.on('window-all-closed', () => {
  pythonProcess?.kill();
  app.quit();
});
```

---

## 根 package.json

```json
{
  "name": "paper-reader",
  "version": "0.1.0",
  "main": "electron/main.js",
  "scripts": {
    "dev:frontend": "cd frontend && npm run dev",
    "dev:backend": "cd backend && uvicorn main:app --port 8000 --reload",
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\" \"wait-on http://localhost:5173 && electron .\"",
    "build": "cd frontend && npm run build",
    "package": "npm run build && electron-builder"
  },
  "devDependencies": {
    "concurrently": "^8.0.0",
    "wait-on": "^7.0.0",
    "electron": "^28.0.0",
    "electron-builder": "^24.0.0"
  }
}
```

---

## backend/requirements.txt

```
fastapi==0.110.0
uvicorn[standard]==0.27.0
sqlmodel==0.0.14
pymupdf==1.23.8
python-multipart==0.0.9
openai==1.12.0
anthropic==0.18.0
aiofiles==23.2.1
```

---

## 开发启动顺序

```bash
# 1. 安装后端依赖
cd backend && pip install -r requirements.txt

# 2. 安装前端依赖
cd frontend && npm install

# 3. 安装根依赖
npm install

# 4. 启动开发模式（同时启动三者）
npm run dev
```

首次运行会在项目根目录创建 `data/` 文件夹和 `reader.db`。

---

## 配置页面（Settings）

提供一个简单的 Settings 页面（可从 Toolbar 右上角进入），配置：
- LLM Provider 选择（OpenAI / Anthropic / Ollama）
- API Key 输入（password 类型 input）
- Model 名称
- Ollama 本地模型名（仅 Ollama 时显示）
- 保存后调 POST /config

---

## 重要开发约定

1. **所有 API 请求统一在 `frontend/src/api.ts` 封装**，组件不直接写 fetch
2. **所有数据库操作通过 SQLModel**，不写裸 SQL（除建表外）
3. **SSE 流式一律用 `useStream.ts` 的 `streamSSE` 函数**，不在组件内写 EventSource
4. **高亮位置坐标相对于当前页面 div**，保存时记录 page 编号，渲染时按 page 过滤
5. **PDF 文件不复制**，`file_path` 存绝对路径，通过 `GET /papers/{id}/file` 接口用 FileResponse 返回给前端
6. **导出 Markdown 时**，按页码排序，黄/蓝/绿/紫分别用不同的 blockquote 前缀标注

---

## 第一步：建议开发顺序

1. `backend/db.py` + `backend/models.py` — 建表
2. `backend/services/pdf_parser.py` — PDF 解析
3. `backend/routers/papers.py` — 上传 + 列表接口
4. `frontend` 基础框架 — App 布局 + PDF 渲染（react-pdf）
5. `backend/services/llm_service.py` + `backend/routers/ai.py` — LLM 流式
6. `frontend/hooks/useHighlight.ts` + 高亮 overlay 渲染
7. `frontend/components/AiPanel.tsx` — 流式问答
8. `frontend/components/NotesPanel.tsx` — 笔记管理
9. `backend/routers/notes.py` — 笔记导出接口
10. `electron/main.js` — 打包桌面应用

---

*此文件由 Claude 生成，供 Claude Code 本地 agent 直接理解并开发。*
