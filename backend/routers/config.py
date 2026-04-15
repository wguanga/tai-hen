"""Config endpoints. Never return api_key in plaintext."""
from fastapi import APIRouter

from schemas import ConfigRead, ConfigWrite
from services.config_service import load_config, save_config

router = APIRouter(tags=["config"])


def _to_read(cfg: dict) -> ConfigRead:
    return ConfigRead(
        provider=cfg.get("provider", "openai"),
        model=cfg.get("model", "gpt-4o-mini"),
        has_api_key=bool(cfg.get("api_key")),
        base_url=cfg.get("base_url", ""),
        ollama_model=cfg.get("ollama_model", "qwen2.5:14b"),
    )


@router.get("", response_model=ConfigRead)
def get_config():
    return _to_read(load_config())


@router.post("", response_model=ConfigRead)
def set_config(body: ConfigWrite):
    saved = save_config(body.model_dump())
    return _to_read(saved)
