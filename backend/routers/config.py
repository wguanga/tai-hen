"""Config endpoints. Never return api_key in plaintext."""
import logging

from fastapi import APIRouter

from schemas import ConfigRead, ConfigWrite
from services.config_service import load_config, save_config

logger = logging.getLogger(__name__)
router = APIRouter(tags=["config"])


def _to_read(cfg: dict) -> ConfigRead:
    from services.llm_service import model_supports_vision
    provider = cfg.get("provider", "openai")
    effective_model = cfg.get("ollama_model" if provider == "ollama" else "model", "")
    return ConfigRead(
        provider=provider,
        model=cfg.get("model", "gpt-4o-mini"),
        has_api_key=bool(cfg.get("api_key")),
        base_url=cfg.get("base_url", ""),
        ollama_model=cfg.get("ollama_model", "qwen2.5:14b"),
        supports_vision=model_supports_vision(provider, effective_model),
    )


@router.get("", response_model=ConfigRead)
def get_config():
    return _to_read(load_config())


@router.post("", response_model=ConfigRead)
def set_config(body: ConfigWrite):
    saved = save_config(body.model_dump())
    return _to_read(saved)


@router.post("/test")
async def test_connection():
    """Test LLM connectivity with a minimal request."""
    config = load_config()
    provider = config.get("provider", "openai")
    api_key = config.get("api_key", "")

    if provider != "ollama" and not api_key:
        return {"ok": False, "message": "未配置 API Key"}

    try:
        if provider == "openai":
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=api_key, base_url=config.get("base_url") or None)
            await client.chat.completions.create(
                model=config.get("model", "gpt-4o-mini"),
                messages=[{"role": "user", "content": "Hi"}],
                max_tokens=1,
            )
        elif provider == "anthropic":
            import anthropic
            client = anthropic.AsyncAnthropic(api_key=api_key)
            await client.messages.create(
                model=config.get("model", "claude-sonnet-4-6"),
                max_tokens=1,
                messages=[{"role": "user", "content": "Hi"}],
            )
        elif provider == "ollama":
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key="ollama", base_url="http://localhost:11434/v1")
            await client.chat.completions.create(
                model=config.get("ollama_model", "qwen2.5:14b"),
                messages=[{"role": "user", "content": "Hi"}],
                max_tokens=1,
            )
        return {"ok": True, "message": f"{provider} 连接成功"}
    except Exception as e:
        logger.warning("config.test_failed provider=%s err=%s", provider, e)
        return {"ok": False, "message": str(e)[:200]}
