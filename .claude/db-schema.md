# DB Schema — 数据库详解

> SQLite，单文件 `data/reader.db`，启用 WAL 模式。所有表由 `db.init_db()` 在启动时幂等创建。

---

## 1. PRAGMA（连接建立后必须执行）🔴

```sql
PRAGMA journal_mode = WAL;          -- reader 与 writer 不互相阻塞
PRAGMA synchronous = NORMAL;         -- WAL 模式下的安全点（FULL 太慢）
PRAGMA foreign_keys = ON;            -- 🔴 SQLite 默认关闭，必须显式开
PRAGMA busy_timeout = 5000;          -- 遇到锁等 5s 而不是立即失败
PRAGMA cache_size = -64000;          -- 64MB 页缓存
PRAGMA temp_store = MEMORY;
```

**实现**：在 SQLModel `create_engine` 时用 `connect_args={"check_same_thread": False}` 并挂 event listener：

```python
from sqlalchemy import event

@event.listens_for(engine, "connect")
def _set_pragmas(dbapi_conn, _):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    # ...
    cursor.close()
```

---

## 2. 完整 DDL

```sql
-- ========= papers =========
CREATE TABLE IF NOT EXISTS papers (
    id           TEXT PRIMARY KEY,              -- UUID v4
    title        TEXT NOT NULL,
    authors      TEXT NOT NULL DEFAULT '[]',    -- JSON array
    year         INTEGER,
    file_path    TEXT NOT NULL UNIQUE,          -- 相对 data/ 的路径
    total_pages  INTEGER NOT NULL,
    file_size    INTEGER,                       -- 字节数，便于显示
    file_hash    TEXT,                          -- SHA256，去重用
    created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_papers_created   ON papers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_papers_hash      ON papers(file_hash);
CREATE INDEX IF NOT EXISTS idx_papers_title     ON papers(title);  -- LIKE 用前缀扫描

-- ========= highlights =========
CREATE TABLE IF NOT EXISTS highlights (
    id          TEXT PRIMARY KEY,
    paper_id    TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    text        TEXT NOT NULL,
    color       TEXT NOT NULL CHECK(color IN ('yellow','blue','green','purple')),
    page        INTEGER NOT NULL,
    position    TEXT NOT NULL,                 -- JSON: {x,y,width,height,rects:[]}
    note        TEXT,
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_hl_paper_page    ON highlights(paper_id, page);
CREATE INDEX IF NOT EXISTS idx_hl_paper_color   ON highlights(paper_id, color);
CREATE INDEX IF NOT EXISTS idx_hl_created       ON highlights(paper_id, created_at);

-- ========= notes =========
CREATE TABLE IF NOT EXISTS notes (
    id            TEXT PRIMARY KEY,
    paper_id      TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    highlight_id  TEXT REFERENCES highlights(id) ON DELETE SET NULL,
    title         TEXT,
    content       TEXT NOT NULL,
    source        TEXT NOT NULL CHECK(source IN ('manual','ai_answer','ai_summary')),
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_paper      ON notes(paper_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_highlight  ON notes(highlight_id);

-- ========= chats =========
CREATE TABLE IF NOT EXISTS chats (
    id            TEXT PRIMARY KEY,
    paper_id      TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    highlight_id  TEXT REFERENCES highlights(id) ON DELETE SET NULL,
    role          TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
    content       TEXT NOT NULL,
    token_count   INTEGER,                     -- 可选，便于统计成本
    created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chats_paper      ON chats(paper_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chats_highlight  ON chats(highlight_id);

-- ========= app_meta（schema 版本） =========
CREATE TABLE IF NOT EXISTS app_meta (
    key    TEXT PRIMARY KEY,
    value  TEXT
);
INSERT OR IGNORE INTO app_meta(key, value) VALUES ('schema_version','1');
```

### 与 CLAUDE.md 差异 🟡
| 字段 | 为何新增 |
|------|---------|
| `papers.file_size`, `file_hash` | 去重、列表显示 |
| `notes.updated_at` | 支持编辑笔记 |
| `chats.token_count` | 统计成本 |
| `CHECK` 约束 | DB 层面防脏数据 |
| `ON DELETE CASCADE/SET NULL` | 删除论文自动清理 |
| `app_meta` 表 | schema 演进 |

---

## 3. SQLModel 定义要点

```python
# models.py
from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime
import uuid

def new_id() -> str:
    return str(uuid.uuid4())

def utcnow() -> str:
    return datetime.utcnow().isoformat(timespec="milliseconds") + "Z"

class Paper(SQLModel, table=True):
    __tablename__ = "papers"
    id: str = Field(default_factory=new_id, primary_key=True)
    title: str
    authors: str = "[]"             # JSON 串；Python 侧用 json.loads
    year: Optional[int] = None
    file_path: str = Field(unique=True)
    total_pages: int
    file_size: Optional[int] = None
    file_hash: Optional[str] = None
    created_at: str = Field(default_factory=utcnow)
```

🔴 **authors 用 TEXT+JSON 而不是关联表**：单用户本地应用，查询维度简单，join 不值得。

🟡 若将来要按作者搜索，可加 FTS5 虚拟表。

---

## 4. 常用查询

### 4.1 列表（带笔记数）
```sql
SELECT
  p.*,
  (SELECT COUNT(*) FROM notes WHERE paper_id = p.id) AS note_count,
  (SELECT COUNT(*) FROM highlights WHERE paper_id = p.id) AS hl_count
FROM papers p
ORDER BY p.created_at DESC
LIMIT ? OFFSET ?;
```

### 4.2 某页的所有高亮（按 y 升序便于渲染）
```sql
SELECT * FROM highlights
WHERE paper_id = ? AND page = ?
ORDER BY json_extract(position, '$.y');
```

### 4.3 某高亮的所有 AI 解释
```sql
SELECT n.*
FROM notes n
WHERE n.highlight_id = ? AND n.source IN ('ai_answer', 'ai_summary')
ORDER BY n.created_at;
```

### 4.4 导出用：高亮 + 关联笔记
```sql
SELECT h.*, n.id as note_id, n.content as note_content, n.source as note_source
FROM highlights h
LEFT JOIN notes n ON n.highlight_id = h.id
WHERE h.paper_id = ?
ORDER BY h.page, json_extract(h.position, '$.y');
```

---

## 5. 去重策略（file_hash）🟡

上传时计算 SHA256：
```python
import hashlib
def sha256_of(path: str) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()
```

插入前先查 `SELECT id FROM papers WHERE file_hash=?`，若存在直接返回旧 paper 并删除新上传的临时文件。

---

## 6. 演进策略（迁移）

### 为什么不用 Alembic
- 单文件 SQLite + 单用户，迁移频率极低
- 大部分变更是**加列**，用 `ALTER TABLE ... ADD COLUMN`
- 复杂变更直接重建表（对用户数据量小）

### 迁移模板
`db.py` 中按 `app_meta.schema_version` 跑递增脚本：
```python
MIGRATIONS = {
    2: [
        "ALTER TABLE papers ADD COLUMN tags TEXT DEFAULT '[]'",
    ],
    3: [
        "CREATE INDEX IF NOT EXISTS idx_notes_source ON notes(source)",
    ],
}

def migrate(conn):
    current = int(conn.execute("SELECT value FROM app_meta WHERE key='schema_version'").fetchone()[0])
    for version in sorted(MIGRATIONS):
        if version > current:
            for sql in MIGRATIONS[version]:
                conn.execute(sql)
            conn.execute("UPDATE app_meta SET value=? WHERE key='schema_version'", (str(version),))
    conn.commit()
```

🔴 **每次改 DDL**：`app_meta.schema_version` +1，追加 `MIGRATIONS[n]`，同步改 `models.py`。

---

## 7. 备份与恢复

🟢 v2 功能：
- 定期 `VACUUM INTO 'backups/reader-YYYYMMDD.db'`
- 导出所有表为 JSON zip（便于跨机迁移）

v1 用户自行复制 `data/` 目录即可。

---

## 8. 性能注意

| 场景 | 措施 |
|------|------|
| 高亮批量插入 | 单事务包住，避免每次 fsync |
| 大 chat 历史 | `chats` 表按 `paper_id` 分区扫描；考虑软删除旧对话 |
| 全文搜索（未来） | FTS5 虚拟表，MATCH 查询 |
| VACUUM | 删除大量数据后手动跑；WAL 下不会自动回收 |
