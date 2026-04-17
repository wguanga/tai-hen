# Dev Tips — 开发技巧与常见坑

> 遇到新坑就追加。下一次类似问题直接查，不要重新踩。

---

## 1. 启动命令速查

### 开发模式（推荐）
```bash
# 终端 1：后端
cd backend && uvicorn main:app --port 8000 --reload

# 终端 2：前端
cd frontend && npm run dev

# 终端 3：Electron（可选，纯 Web 可直接访问 5173）
npm run electron:dev
```

### 一键启动
```bash
npm run dev    # concurrently + wait-on 串起来
```

### 仅调试后端（curl 测试）
```bash
# 上传 PDF
curl -F "file=@test.pdf" http://127.0.0.1:8000/papers/upload

# 测 SSE
curl -N -X POST http://127.0.0.1:8000/ai/explain \
  -H "Content-Type: application/json" \
  -d '{"paper_id":"xxx","text":"...","level":"simple"}'
```

---

## 2. 调试 SSE 流

### 浏览器 DevTools
- Network → Fetch/XHR → 点开请求 → **EventStream** tab
- 直接显示每个 data: 事件，比看 raw response 方便

### 后端打日志
临时在 `sse_gen` 里加：
```python
print(f"[SSE] chunk={chunk!r}", flush=True)
```

### curl 实时查看
`curl -N`（不缓冲）+ `--no-buffer`。

---

## 3. 调试 SQLite

### 打开 DB 交互式
```bash
sqlite3 data/reader.db
.schema highlights
SELECT COUNT(*) FROM highlights;
.mode column
.headers on
SELECT id, page, color, substr(text,1,40) FROM highlights LIMIT 20;
```

### GUI：推荐 DB Browser for SQLite（免费）

### 诊断锁问题
```sql
PRAGMA journal_mode;       -- 应返回 'wal'
PRAGMA busy_timeout;        -- 应 >=5000
PRAGMA foreign_keys;        -- 应返回 1
```

若卡死：查后端是否有未关闭的 session。全部走 `with Session(engine)` 或 `Depends(get_session)`。

---

## 4. 常见坑 🔴

### 4.1 `PRAGMA foreign_keys` 默认关
SQLite 默认 FK 不生效！必须每次连接建立后 `PRAGMA foreign_keys=ON`。否则 `ON DELETE CASCADE` 无效。  
→ 见 `db-schema.md#1-pragma`

### 4.2 CORS 漏配置导致 SSE 失败
SSE 走 fetch 读流。若 `Access-Control-Allow-Origin` 不含 `http://localhost:5173` 或 `file://`，Chromium 直接断流无报错。  
→ 确认 `main.py` 的 CORSMiddleware `allow_origins` 列表正确

### 4.3 Electron file:// 下 fetch 失败
prod 打包后，`file://` 作为 origin 被视为 null。后端允许 `"*"` 或显式列 `"null"`。  
**或者** Electron main 注册 custom protocol（`app://`）避开。

### 4.4 react-pdf 字体缺失警告
pdfjs-dist worker 要正确指向。`vite.config.ts` 里：
```ts
import { pdfjs } from 'react-pdf';
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url
).toString();
```

### 4.5 PyMuPDF Windows 安装慢
国内用镜像：
```
pip install pymupdf -i https://pypi.tuna.tsinghua.edu.cn/simple
```

### 4.6 SSE chunk 含换行破坏协议
若 chunk 原样塞入 `data: {chunk}\n\n`，chunk 内的 `\n` 会被解析成分隔。  
→ `api-reference.md` 已改为 JSON 包裹，务必遵守。

### 4.7 高亮位置在缩放后错位
保存 rects 时除以 scale，渲染时乘回。  
→ `frontend-guide.md#43-缩放处理`

### 4.8 AI 响应 token 超限（summarize）
大 PDF 整篇塞不进 8K 模型。检查模型 context window，必要时截断或 map-reduce（先分段总结再汇总）。

### 4.9 Electron 子进程在 Windows kill 不干净
`pythonProcess.kill()` 在 Windows 只杀父进程。用 `tree-kill` 或：
```js
const { exec } = require('child_process');
exec(`taskkill /pid ${pythonProcess.pid} /T /F`);
```

### 4.10 react-pdf 首次渲染 blob URL 失效
若 `file={blobUrl}`，useMemo 稳定 URL，否则每次 render 重新创建 blob url → react-pdf 误判更换文档。

### 4.11 IntersectionObserver + 内联 ref 导致无限 re-render 🔴
**症状**：打开 4+ 页的 PDF 后整个页面白屏，控制台 "Too many re-renders"。

**根因链**：
1. JSX 里 `ref={(el) => registerPage(n, el)}` 是**每次 render 新函数**
2. React 在 ref 回调身份变化时：先用 `null` 调旧的（卸载），再用 el 调新的（挂载）
3. `registerPage` 收到 null 就 unobserve，再收到 el 就 observe
4. IntersectionObserver spec：**每次 `observe(newTarget)` 都会发送一次初始 intersection 通知**（即使元素本来就可见）
5. 通知触发 `setRenderedPages(new Set(...))`（永远返回新引用）
6. state 变 → re-render → 新 ref 函数 → 回到步骤 2 → 无限循环 → React 崩溃

**修复要点**：
- 提供 **stable per-key** ref 回调（`useRef<Map>` 缓存每个 pageNum 的回调）
- `registerPage` 对相同 element 做 no-op
- `setState` 的 reducer 在内容不变时返回原引用

修复见 `frontend/src/hooks/usePageVirtualization.ts` 的 `getPageRef`/`setsEqual`。
回归测试在 `usePageVirtualization.test.ts` 的 "stability" describe 块。

---

## 5. 性能检查

### 后端慢查询
```python
# 临时加在 db.py
import time
@event.listens_for(engine, "before_cursor_execute")
def bce(conn, cursor, stmt, params, ctx, executemany):
    ctx._t = time.perf_counter()

@event.listens_for(engine, "after_cursor_execute")
def ace(conn, cursor, stmt, params, ctx, executemany):
    dur = time.perf_counter() - ctx._t
    if dur > 0.05:
        logger.warning("slow sql %.3fs: %s", dur, stmt[:200])
```

### 前端渲染性能
- Chrome DevTools → Performance → 录制一次划词 + AI 流式
- React Profiler 检查 `<PdfReader>` 不应因 AI 响应重渲

---

## 6. Prompt Regression 测试

每次改系统提示词前后，用固定样本对比输出。

```bash
# scripts/prompt_eval.py
INPUTS = [
    {"key": "explain_simple", "text": "softmax 函数", "expected_keywords": ["归一化", "概率"]},
    ...
]
# 跑一遍，人工 diff 输出
```

---

## 7. 清理与重置

### 清数据（保留配置）
```bash
rm data/reader.db data/reader.db-wal data/reader.db-shm
rm -r data/papers
```

### 完全重置
```bash
rm -r data/
```
下次启动自动重建。

---

## 8. 打包（electron-builder）

```bash
npm run build        # 前端产出 frontend/dist
npm run package      # electron-builder 产出 release/
```

Windows 打包需：
- Python 需内嵌（python-portable）或提示用户安装
- 🟡 v1 可先要求用户本机有 Python 3.11+

更省心：v2 改用 **pyinstaller** 把后端打成单文件 exe，Electron 直接 spawn。

---

## 9. 调试 Electron 主进程

```bash
electron --inspect-brk=9229 .
```
Chrome 打开 `chrome://inspect` → Configure → 加 `localhost:9229`。

---

## 10. Backend crash 自动重启

`electron/main.js`：
```js
pythonProcess.on('exit', (code) => {
  if (!app.isQuitting) {
    console.warn('[backend] exited code', code, 'restarting');
    setTimeout(startBackend, 1000);
  }
});
```

连续失败 3 次→弹窗提示用户。

---

## 11. 与 Claude Code 协作的技巧 🟡

- 修改设计时：**让 Claude 同时改 `docs/` 对应文件 + `docs/changelog.md`**
- 要跨多文件改：先让 Claude 读 `docs/README.md` 决定要读哪些
- 要生成新端点：贴 `docs/api-reference.md` + `docs/backend-guide.md` 给 Claude
- 要改提示词：只贴 `docs/ai-prompts.md` 足够
- 测试约定和协作约定在 `.claude/testing.md` / `.claude/AGREEMENTS.md`（本地，不入版本库）
