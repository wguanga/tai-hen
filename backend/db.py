"""SQLite engine + init + migrations. See .claude/db-schema.md."""
from pathlib import Path
from sqlalchemy import event
from sqlmodel import SQLModel, Session, create_engine

DATA_DIR = Path("data")
DB_PATH = DATA_DIR / "reader.db"

DATA_DIR.mkdir(parents=True, exist_ok=True)
(DATA_DIR / "papers").mkdir(exist_ok=True)
(DATA_DIR / "logs").mkdir(exist_ok=True)

engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
    echo=False,
)


@event.listens_for(engine, "connect")
def _set_pragmas(dbapi_conn, _):
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA synchronous=NORMAL")
    cur.execute("PRAGMA foreign_keys=ON")
    cur.execute("PRAGMA busy_timeout=5000")
    cur.execute("PRAGMA cache_size=-64000")
    cur.execute("PRAGMA temp_store=MEMORY")
    cur.close()


MIGRATIONS: dict[int, list[str]] = {
    # 1 → already created by SQLModel.metadata.create_all
}


def init_db() -> None:
    import models  # noqa: F401 ensure tables registered
    SQLModel.metadata.create_all(engine)
    with engine.begin() as conn:
        conn.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)"
        )
        conn.exec_driver_sql(
            "INSERT OR IGNORE INTO app_meta(key, value) VALUES ('schema_version', '1')"
        )
        row = conn.exec_driver_sql(
            "SELECT value FROM app_meta WHERE key='schema_version'"
        ).fetchone()
        current = int(row[0]) if row else 1
        for version in sorted(MIGRATIONS):
            if version > current:
                for sql in MIGRATIONS[version]:
                    conn.exec_driver_sql(sql)
                conn.exec_driver_sql(
                    "UPDATE app_meta SET value=? WHERE key='schema_version'",
                    (str(version),),
                )


def get_session():
    with Session(engine) as s:
        yield s
