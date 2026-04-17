# Frontend Guide — 前端开发指南

> 技术栈：React 18 + TypeScript 5 + Vite 5 + Tailwind 3 + react-pdf 7。

---

## 1. 组件树

```
<App>
  <PaperStoreProvider>
    <AiStoreProvider>
      <UiStoreProvider>
        ├── <Toolbar />                    // 顶部 40px
        ├── <div className="main-grid">
        │     ├── <PdfReader>              // 左侧
        │     │     ├── <PdfPage>          // 逐页渲染（虚拟化）
        │     │     │     └── <HighlightOverlay />
        │     │     └── <ContextMenu />    // Portal
        │     └── <div className="right">
        │           ├── <AiPanel />        // 右上，flex:1
        │           └── <NotesPanel />     // 右下，固定 220px
        └── <ChatInputBar />               // 底部 52px
```

---

## 2. 状态管理（Context + useReducer）

**不用 Redux / Zustand**：应用规模小，三个 Context 够用。

### 2.1 PaperStore — 论文与高亮

```ts
// store/paper-store.tsx
interface PaperState {
  current: Paper | null;           // 当前打开的论文
  list: Paper[];                   // 论文列表
  highlights: Highlight[];         // 当前论文的所有高亮
  notes: Note[];                   // 当前论文的所有笔记
  highlightByPage: Map<number, Highlight[]>;  // 🟡 派生，加速查询
}

type PaperAction =
  | { type: 'OPEN_PAPER', paper: Paper, highlights: Highlight[], notes: Note[] }
  | { type: 'ADD_HIGHLIGHT', highlight: Highlight }
  | { type: 'UPDATE_HIGHLIGHT', id: string, patch: Partial<Highlight> }
  | { type: 'REMOVE_HIGHLIGHT', id: string }
  | { type: 'ADD_NOTE', note: Note }
  | ...;
```

🔴 `highlightByPage` 在 reducer 里维护，不要在组件里每次重建。

### 2.2 AiStore — 对话

```ts
interface AiState {
  messages: ChatMessage[];         // 当前会话历史
  streaming: boolean;
  buffer: string;                  // 流式累积 buffer
  activeHighlightId: string | null; // 触发当前会话的高亮
}
```

🔴 切换论文时**清空 AiStore**，对话不跨论文。

### 2.3 UiStore — 纯 UI 状态

```ts
interface UiState {
  activeColor: HighlightColor;     // Toolbar 选中的颜色
  contextMenu: { x: number; y: number; text: string } | null;
  currentPage: number;             // 当前可视页
  zoom: number;                    // PDF 缩放 0.5-3
  settingsOpen: boolean;
}
```

---

## 3. Hooks 清单

| Hook | 职责 | 依赖 |
|------|------|------|
| `useHighlight` | 捕获选区、保存/渲染高亮 | PaperStore |
| `useStream` | 通用 SSE 流 | — |
| `useDebouncedSave` | 节流保存（高亮 note 编辑） | — |
| `usePdfPage` | 按页渲染、滚动监听 | UiStore |
| `useKeyboardShortcuts` | 全局快捷键 | UiStore |
| `useClickOutside` | ContextMenu 关闭检测 | — |

### 3.1 useStream（修正版）🔴

CLAUDE.md 里的版本处理裸文本 chunk。按 `api-reference.md` 约定的 JSON 协议修正：

```ts
// hooks/useStream.ts
export async function streamSSE(
  url: string,
  body: object,
  handlers: {
    onChunk: (text: string) => void;
    onDone: () => void;
    onError?: (code: string, message: string) => void;
    signal?: AbortSignal;
  }
) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: handlers.signal,
  });
  if (!res.ok) {
    handlers.onError?.('HTTP_ERROR', `${res.status}`);
    return;
  }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const evt = JSON.parse(line.slice(6));
          if (evt.type === 'chunk') handlers.onChunk(evt.text);
          else if (evt.type === 'done') { handlers.onDone(); return; }
          else if (evt.type === 'error') handlers.onError?.(evt.code, evt.message);
        } catch { /* 跳过畸形行 */ }
      }
    }
    handlers.onDone();
  } catch (e: any) {
    if (e.name !== 'AbortError') handlers.onError?.('NETWORK_ERROR', e.message);
  }
}
```

🔴 **始终通过 `AbortController`** 调用，切换论文/关闭窗口时 abort。

### 3.2 useDebouncedSave

```ts
export function useDebouncedSave<T>(
  value: T,
  save: (v: T) => Promise<void>,
  delay = 500
) {
  const timer = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(value), delay);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [value]);
}
```

用于：编辑高亮 `note` 字段、编辑笔记正文。

---

## 4. PDF 渲染策略

### 4.1 虚拟化（大 PDF 必做）🔴

react-pdf 的 `<Document>` 可直接渲染所有页但会 OOM。自行实现：

```tsx
function PdfReader({ paperId }) {
  const [visiblePages, setVisiblePages] = useState([1]);
  // IntersectionObserver 监听每个 <PdfPage> 占位符
  // 进入视口才渲染真实 <Page>，离开后可降级为占位
}
```

实现要点：
- 每页容器先渲染空 div（高度按比例估算或第一页渲染后拿到）
- IntersectionObserver `rootMargin: "500px"` 提前加载
- 只保留当前 ± 2 页的实际 canvas，其余卸载

### 4.2 高亮 overlay

每页容器 `position: relative`，高亮 div 绝对定位：
```tsx
<div className="pdf-page" ref={pageRef}>
  <Page pageNumber={n} />
  {highlightByPage.get(n)?.map(h =>
    h.position.rects.map((r, i) => (
      <div key={`${h.id}-${i}`}
           className="highlight-rect"
           data-hl={h.id}
           style={{
             position: 'absolute',
             left: r.x, top: r.y,
             width: r.width, height: r.height,
             background: COLOR_HEX[h.color],
             opacity: 0.4,
             pointerEvents: 'none',
             borderRadius: 2,
           }}/>
    ))
  )}
</div>
```

🔴 `pointerEvents: 'none'` 是**关键**，否则高亮会吃掉用户二次选择的 mousedown。

### 4.3 缩放处理

🟡 react-pdf 支持 `scale` prop。缩放后**位置需重新计算**吗？**不需要**，因为 overlay 和 PDF 同处 `position:relative` 容器，容器整体按 scale 变大，overlay 跟着等比放大（前提是 `rects` 用 CSS 像素，而 scale=1 时捕获）。

⚠️ **但要保存时记录 scale**？否则下次以不同 scale 打开，位置会错位。

**方案**：保存 rects 时除以当前 scale，渲染时乘回当前 scale。
```ts
// 保存时
rects: clientRects.map(r => ({
  x: (r.left - pageRect.left) / currentScale,
  // ...
}))
// 渲染时
style={{ left: r.x * currentScale, ... }}
```

---

## 5. ContextMenu（Portal）

```tsx
// components/ContextMenu.tsx
import { createPortal } from 'react-dom';

export function ContextMenu({ x, y, items, onClose }) {
  useClickOutside(ref, onClose);
  useEffect(() => {
    window.addEventListener('scroll', onClose, true);
    return () => window.removeEventListener('scroll', onClose, true);
  }, []);
  return createPortal(
    <ul ref={ref} style={{ position:'fixed', left:x, top:y, zIndex:1000 }}>
      {items.map(i => <li onClick={i.onClick}>{i.label}</li>)}
    </ul>,
    document.body
  );
}
```

🔴 监听滚动关闭，否则菜单会"飘"。

菜单项清单见 CLAUDE.md 的 "ContextMenu 行为规范"。

---

## 6. 乐观更新模式 🟡

**创建高亮**（用户期待即时反馈）：
```ts
async function addHighlight(hl) {
  const tempId = `tmp-${Date.now()}`;
  dispatch({ type:'ADD_HIGHLIGHT', highlight:{...hl, id:tempId}});
  try {
    const saved = await api.createHighlight(paperId, hl);
    dispatch({ type:'REPLACE_HIGHLIGHT', tempId, highlight:saved });
  } catch (e) {
    dispatch({ type:'REMOVE_HIGHLIGHT', id:tempId });
    toast.error('保存失败');
  }
}
```

---

## 7. api.ts 封装模板

```ts
// api.ts
const BASE = 'http://127.0.0.1:8000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(err.error?.code ?? 'UNKNOWN', err.error?.message ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  listPapers: () => request<{items: Paper[]}>('/papers'),
  getPaper: (id: string) => request<Paper>(`/papers/${id}`),
  uploadPaper: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return request<Paper>('/papers/upload', { method:'POST', body:fd, headers:{} });
  },
  createHighlight: (paperId, body) => request<Highlight>(`/papers/${paperId}/highlights`, { method:'POST', body: JSON.stringify(body) }),
  // ...
};

export class ApiError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
```

🔴 **组件永远不要直接 fetch**，全部走 `api.*`。

---

## 8. 样式约定（Tailwind）

- 🔴 禁止使用 `style={{}}` 硬编码颜色/间距，除了**高亮 overlay 这种 runtime 动态**的场景
- 全局色板在 `tailwind.config.js`：
  ```js
  colors: {
    hl: {
      yellow: '#FDE68A',
      blue: '#BAE6FD',
      green: '#BBF7D0',
      purple: '#E9D5FF',
    }
  }
  ```
- 组件顶部用 `const cls = { root: '...', header: '...' }` 收敛类名，不散落

---

## 9. 键盘快捷键

| 键 | 动作 |
|----|------|
| `1/2/3/4` | 切换高亮颜色（黄/蓝/绿/紫） |
| `E` | 对选中文字触发 AI 解释 |
| `N` | 加手动笔记（弹 textarea） |
| `Ctrl/Cmd + S` | 导出 MD |
| `Esc` | 关闭 ContextMenu / Settings |
| `Ctrl/Cmd + K` | 聚焦搜索（v2） |

在 `useKeyboardShortcuts` 中统一注册，避免散落。

---

## 10. 性能自检清单 🔴

部署前检查：
- [ ] React DevTools Profiler 看高亮操作无跨组件重渲
- [ ] Chromium Task Manager 看 Renderer 内存不超 500MB（50 页 PDF）
- [ ] AI 流式时 CPU 不持续 100%
- [ ] 关闭论文后对应 highlight DOM 清空
- [ ] 连续快速划词 10 次，不丢 highlight
