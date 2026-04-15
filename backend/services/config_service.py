"""Load/save config. See .claude/decisions.md#adr-009."""
import json
from pathlib import Path

CONFIG_PATH = Path("data/config.json")

DEFAULTS = {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "api_key": "",
    "base_url": "",
    "ollama_model": "qwen2.5:14b",
}


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        return dict(DEFAULTS)
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        merged = dict(DEFAULTS)
        merged.update(data)
        return merged
    except (json.JSONDecodeError, OSError):
        return dict(DEFAULTS)


def save_config(payload: dict) -> dict:
    current = load_config()
    for key in ("provider", "model", "base_url", "ollama_model"):
        if key in payload and payload[key] is not None:
            current[key] = payload[key]
    if "api_key" in payload:
        ak = payload["api_key"]
        if ak is None:
            current["api_key"] = ""
        elif ak != "":
            current["api_key"] = ak

    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(current, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        CONFIG_PATH.chmod(0o600)
    except OSError:
        pass
    return current
