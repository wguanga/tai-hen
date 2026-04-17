# Testing — 测试规约

> 🔴 **硬性约定**：新增/修改任何功能都必须同步写测试。PR/commit 不带测试等同未完成。
>
> 对应 ADR-013（新增于 2026-04-17）。

---

## 为什么

1. **防退化**：论文阅读是线性、长时间的工作流。任何一个核心操作坏掉都会打断流程
2. **防重犯**：发现的 bug 必须先写失败测试再修，避免复发
3. **作为规格**：测试 = 可执行规格。比注释更可靠

---

## 什么必须写测试

| 模块类型 | 必测 | 非必测 |
|---------|------|--------|
| 后端 service | ✓ 核心逻辑 + 边界 | 纯转发到 repository 的薄层 |
| 后端 router | ✓ 状态码 + 响应体 + 错误码 | —— |
| 后端 repository | 🟡 复杂查询 | CRUD 单表 basic |
| PDF / LLM 集成 | ✓ 用 fixture / mock | —— |
| 前端 reducer / pure fn | ✓ 全 action 覆盖 | —— |
| 前端 hook | ✓ 有状态/副作用的 | —— |
| 前端 api wrapper | ✓ 错误解析路径 | —— |
| 前端组件 | 🟡 关键交互（upload / highlight / chat） | 纯展示组件 |

---

## 目录结构

### 后端
```
backend/
├── pytest.ini
├── requirements-dev.txt
└── tests/
    ├── __init__.py
    ├── conftest.py          ← 全局 fixture（isolated_data, client, uploaded_paper, mock_llm…）
    ├── test_pdf_parser.py
    ├── test_papers.py
    ├── test_highlights.py
    ├── test_notes.py
    ├── test_ai.py
    └── test_config.py
```

### 前端
```
frontend/
├── vitest.config.ts
└── src/
    ├── test/setup.ts
    ├── store/app-store.test.tsx
    ├── hooks/useStream.test.ts
    └── api.test.ts
```

---

## 命令

```bash
# 后端全部
cd backend && python -m pytest tests/ -v

# 后端某一文件
python -m pytest tests/test_pdf_parser.py -v

# 后端某个用例
python -m pytest tests/test_papers.py::TestUpload::test_upload_pdf_creates_paper -v

# 前端全部
cd frontend && npm test

# 前端 watch
cd frontend && npm run test:watch
```

---

## 写测试的规矩 🔴

### 1. 测试文件就放在被测模块旁边（前端）或 tests/（后端）
前端约定：`foo.ts` 的测试是同级 `foo.test.ts` / `foo.test.tsx`。
后端约定：全部集中在 `backend/tests/`。

### 2. 用 fixture 而不是复制样板
创建论文、高亮等请用现成 fixture：`client`, `uploaded_paper`, `make_hl`, `mock_llm`。  
新 fixture 一律加到 `conftest.py`，不在单个测试里定义。

### 3. 测试行为而不是实现
✅ `test_list_filters_by_color` — 测表现  
❌ `test_list_calls_exec_with_where_clause` — 测实现

### 4. 命名：test_{场景}_{期望}
```python
def test_upload_duplicate_returns_existing(...): ...
def test_create_highlight_rejects_invalid_color(...): ...
def test_export_groups_summary_separately(...): ...
```

### 5. 一个 bug → 一个回归测试 🔴
发现 bug：**先**写失败测试 → 再改代码 → 测试转绿。
提交信息写：`fix(X): ... + regression test`。

### 6. 每次加功能，先看相邻测试能否类比扩展
复用 fixture + 加几个 case 比从头写快。

---

## Mock 约定

### LLM（AI 接口测试必 mock，绝不打真实 API）🔴

```python
# conftest.py 的 mock_llm fixture：
# - 替换 stream_llm 为固定生成器
# - 同时 patch routers.ai 的导入引用（避免 python 模块捕获）
def test_xxx(client, mock_llm):
    r = client.post("/ai/explain", ...)
    # mock_llm 是 ["Hello", " ", "world", "."] 的 chunks
```

### 前端 fetch
```ts
(globalThis as any).fetch = vi.fn().mockResolvedValue(
  new Response(JSON.stringify({...}), { status: 200 }),
);
// 记得 afterEach(() => vi.restoreAllMocks());
```

### 不要 mock 的
- 数据库（SQLite 够快，用 tmp_path 隔离）
- PyMuPDF（它很快，fixture 里构造内存 PDF 即可）
- 本地文件系统（用 monkeypatch.chdir 到 tmp_path）

---

## 已知警告

### SQLAlchemy "table already defined"
每个 `client` fixture 会 reload 模块 → metadata 重新注册表 → SQLAlchemy 警告。
`pytest.ini` 已配置 `filterwarnings = ignore::sqlalchemy.exc.SAWarning` 过滤。
不是 bug，只是 reload 的副作用。

### 为什么每次测试都 reload 而不是 session-scoped client
SQLite 单文件 + 配置单文件的测试必须隔离 `cwd`。Session-scoped 会泄漏数据到下个测试。
代价：每次 reload 约 60ms。70 个测试全跑约 6 秒，可接受。

---

## CI（未来）🟢

建议 GitHub Actions：
```yaml
- run: cd backend && pip install -r requirements-dev.txt && pytest tests/
- run: cd frontend && npm ci && npm test && npm run build
```

v1 无 CI，全靠本地跑。提交前必须绿灯。

---

## 常见坑

| 症状 | 原因 | 解决 |
|------|------|------|
| `Table 'papers' is already defined` | metadata 污染 | conftest 中 `SQLModel.metadata.clear()` 后再 reload |
| `FOREIGN KEY constraint failed` 删除时 | PRAGMA foreign_keys=ON 下 SQLModel 不自动 cascade | 在 repo.delete 里显式删子表 |
| `httpx.ReadError` on SSE | TestClient 不支持 chunked SSE 流式吗 | 实测支持；改用 `r.text` 拿全量再解析 |
| `vitest` 找不到 `describe/it` 类型 | tsconfig 缺 `"types":["vitest/globals"]` | 见 tsconfig.json |

---

## 当前覆盖

**后端**：70 tests，覆盖 pdf_parser / papers / highlights / notes / export / config / ai
**前端**：25 tests，覆盖 app-store reducer / useStream / api wrapper

**未覆盖（后续补）**：
- 前端组件交互（Toolbar 上传、PdfReader 右键菜单、NoteInput 保存）
- 后端 repository 层单独测试（目前通过 router 间接覆盖）
- 前端 useKeyboard / useHighlight hook
