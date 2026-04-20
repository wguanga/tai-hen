"""Cache of (provider, base_url, model) → supports_vision.

Model capability is invariant, so probe results can be persisted indefinitely.
Only DEFINITIVE outcomes are cached — transient failures (auth / rate-limit /
network) are NOT stored.
"""
import json
from datetime import datetime, timezone
from pathlib import Path

CACHE_PATH = Path("data/vision_cache.json")


def _key(provider: str, base_url: str, model: str) -> str:
    return f"{provider}::{base_url or ''}::{model}"


def _load() -> dict:
    if not CACHE_PATH.exists():
        return {}
    try:
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def get(provider: str, base_url: str, model: str) -> dict | None:
    return _load().get(_key(provider, base_url, model))


def put(provider: str, base_url: str, model: str, supports_vision: bool, note: str = "") -> None:
    cache = _load()
    cache[_key(provider, base_url, model)] = {
        "supports_vision": supports_vision,
        "probed_at": datetime.now(timezone.utc).isoformat(),
        "note": note,
    }
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(
        json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8"
    )
