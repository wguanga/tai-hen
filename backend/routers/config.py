"""Config endpoints. Never return api_key in plaintext."""
import logging
from typing import Literal, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from errors import LlmConfigMissing, LlmUpstreamError
from schemas import ConfigRead, ConfigWrite
from services.config_service import load_config, save_config

logger = logging.getLogger(__name__)
router = APIRouter(tags=["config"])


class ListModelsBody(BaseModel):
    provider: Optional[Literal["openai", "anthropic", "ollama"]] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None


def _clean_ascii_key(api_key: str) -> str:
    """Strip whitespace and ensure key is ASCII. HTTP headers only allow ASCII."""
    cleaned = (api_key or "").strip()
    try:
        cleaned.encode("ascii")
    except UnicodeEncodeError:
        raise LlmConfigMissing(
            "API Key 含非 ASCII 字符（复制时可能混入了中文或特殊符号）—— 请到服务商后台重新复制"
        )
    return cleaned


def _to_read(cfg: dict) -> ConfigRead:
    from services.llm_service import model_supports_vision, vision_source
    provider = cfg.get("provider", "openai")
    effective_model = cfg.get("ollama_model" if provider == "ollama" else "model", "")
    base_url = cfg.get("base_url", "")
    api_key = cfg.get("api_key", "") or ""
    preview = ("••••" + api_key[-4:]) if len(api_key) >= 4 else ("••••" if api_key else "")
    return ConfigRead(
        provider=provider,
        model=cfg.get("model", "gpt-4o-mini"),
        has_api_key=bool(api_key),
        api_key_preview=preview,
        base_url=base_url,
        ollama_model=cfg.get("ollama_model", "qwen2.5:14b"),
        supports_vision=model_supports_vision(provider, effective_model, base_url),
        vision_source=vision_source(provider, effective_model, base_url),
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
    raw_key = config.get("api_key", "")

    if provider != "ollama" and not raw_key:
        return {"ok": False, "message": "未配置 API Key"}

    if provider != "ollama":
        try:
            api_key = _clean_ascii_key(raw_key)
        except LlmConfigMissing as e:
            return {"ok": False, "message": e.message}
    else:
        api_key = "ollama"

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
        return {"ok": False, "message": _friendly_error(e)}


def _friendly_error(e: Exception) -> str:
    """Convert noisy SDK/HTTP errors to short Chinese hints when possible."""
    msg = str(e)
    low = msg.lower()
    if "401" in msg or "unauthorized" in low or "invalid api key" in low or "authentication" in low:
        return "API Key 无效或已过期 —— 请到服务商后台重新生成"
    if "404" in msg and "model" in low:
        return "模型名不存在 —— 点 '🔄 拉取可用模型' 看真实列表"
    if "429" in msg or "rate limit" in low:
        return "触发限流 —— 稍后重试，或检查服务商余额"
    if "timeout" in low or "timed out" in low:
        return "请求超时 —— 检查网络，或服务商是否需要代理"
    if "connection" in low and ("refused" in low or "reset" in low):
        return "连接失败 —— 检查 base_url 是否正确 / Ollama 是否启动"
    return msg[:200]


# 1x1 transparent PNG, base64-encoded. Smallest valid test image.
_TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lE"
    "QVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


@router.post("/probe-vision")
async def probe_vision(force: bool = False):
    """Send a tiny image to the current model to verify vision support.

    Results are cached permanently in data/vision_cache.json — cache is
    authoritative unless ?force=true is passed. Only DEFINITIVE outcomes
    (200 OK or vision-specific rejection) are cached; auth / network /
    rate-limit failures are NOT cached since they're transient.
    """
    from services import vision_cache_service

    config = load_config()
    provider = config.get("provider", "openai")
    base_url = config.get("base_url", "")
    raw_key = config.get("api_key", "")
    model = config.get("ollama_model" if provider == "ollama" else "model", "")

    if not model:
        return {"supports_vision": False, "source": "none", "message": "未配置模型名"}
    if provider != "ollama" and not raw_key:
        return {"supports_vision": False, "source": "none", "message": "未配置 API Key"}

    if not force:
        cached = vision_cache_service.get(provider, base_url, model)
        if cached is not None:
            verdict = "✓ 支持" if cached["supports_vision"] else "✗ 不支持"
            return {
                "supports_vision": cached["supports_vision"],
                "source": "cache",
                "message": f"{verdict}（已缓存 · {cached.get('probed_at', '')[:10]}）",
            }

    api_key = _clean_ascii_key(raw_key) if provider != "ollama" else "ollama"

    try:
        if provider in ("openai", "ollama"):
            from openai import AsyncOpenAI
            effective_url = (
                "http://localhost:11434/v1"
                if provider == "ollama"
                else (base_url or None)
            )
            client = AsyncOpenAI(api_key=api_key, base_url=effective_url, timeout=30)
            await client.chat.completions.create(
                model=model,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "ok"},
                        {"type": "image_url",
                         "image_url": {"url": f"data:image/png;base64,{_TINY_PNG_B64}"}},
                    ],
                }],
                max_tokens=1,
            )
            vision_cache_service.put(provider, base_url, model, True, "probe ok")
            return {"supports_vision": True, "source": "probe",
                    "message": f"✓ {model} 实测支持图像（已缓存）"}

        if provider == "anthropic":
            import anthropic
            client = anthropic.AsyncAnthropic(api_key=api_key)
            await client.messages.create(
                model=model,
                max_tokens=1,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "image",
                         "source": {"type": "base64", "media_type": "image/png",
                                    "data": _TINY_PNG_B64}},
                        {"type": "text", "text": "ok"},
                    ],
                }],
            )
            vision_cache_service.put(provider, base_url, model, True, "probe ok")
            return {"supports_vision": True, "source": "probe",
                    "message": f"✓ {model} 实测支持图像（已缓存）"}

        return {"supports_vision": False, "source": "none",
                "message": f"未知 provider: {provider}"}

    except Exception as e:
        msg = str(e)
        low = msg.lower()
        # Auth / model-name errors → TRANSIENT, don't cache, surface as error
        if "401" in msg or "unauthorized" in low or "authentication" in low:
            raise LlmUpstreamError("API Key 无效 —— 无法检测视觉能力")
        if "404" in msg and "model" in low:
            raise LlmUpstreamError(f"模型 {model} 不存在于此服务商")
        if "429" in msg or "rate limit" in low:
            raise LlmUpstreamError("触发限流 —— 稍后重试")
        if "timeout" in low or "timed out" in low:
            raise LlmUpstreamError("请求超时 —— 稍后重试，不缓存结果")
        if "connection" in low and ("refused" in low or "reset" in low):
            raise LlmUpstreamError("连接失败 —— 不缓存结果")
        # Content-filter rejection (gateways like 智谱 code 1301, OpenAI moderation, etc.)
        # The endpoint DID parse the image (to scan it) → model is multimodal-capable.
        # Cache as supported; note the filter event.
        content_filter_keys = (
            "contentfilter", "content filter", "敏感", "不安全", "sensitive",
            "moderation", "1301", "safety",
        )
        if any(k in low for k in content_filter_keys) or any(k in msg for k in ("敏感", "不安全")):
            logger.info("probe_vision.content_filter_but_multimodal model=%s err=%s", model, msg[:200])
            vision_cache_service.put(provider, base_url, model, True, "content-filter but multimodal")
            return {
                "supports_vision": True, "source": "probe",
                "message": f"✓ {model} 支持图像输入（内容过滤器拒了测试图，但接口识别为多模态；已缓存）",
            }
        # Vision-specific rejection: DEFINITIVE → cache as unsupported
        vision_keys = (
            "image", "vision", "multimodal", "unsupported",
            "content type", "content_type", "not support",
            "does not support", "image_url",
        )
        if any(k in low for k in vision_keys):
            logger.info("probe_vision.rejected model=%s err=%s", model, msg[:200])
            vision_cache_service.put(provider, base_url, model, False, msg[:200])
            return {"supports_vision": False, "source": "probe",
                    "message": f"✗ {model} 不支持图像（已缓存）"}
        logger.warning("probe_vision.unknown model=%s err=%s", model, msg[:200])
        raise LlmUpstreamError(_friendly_error(e))


@router.post("/models")
async def list_models(body: ListModelsBody):
    """Fetch real available models for a provider.

    Accepts optional overrides (provider/base_url/api_key) so the user
    can preview models before saving. Falls back to saved config.
    """
    saved = load_config()
    provider = body.provider or saved.get("provider", "openai")
    base_url = body.base_url if body.base_url is not None else saved.get("base_url", "")
    raw_key = body.api_key or saved.get("api_key", "")

    if provider != "ollama" and not raw_key:
        raise LlmConfigMissing("未配置 API Key — 先填入 key 再刷新")

    api_key = _clean_ascii_key(raw_key) if provider != "ollama" else ""

    try:
        if provider == "openai":
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=api_key, base_url=base_url or None, timeout=20)
            page = await client.models.list()
            ids = sorted({m.id for m in page.data})
            return {"models": ids}

        if provider == "anthropic":
            import httpx
            async with httpx.AsyncClient(timeout=20) as hc:
                r = await hc.get(
                    "https://api.anthropic.com/v1/models",
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                    },
                )
                r.raise_for_status()
                return {"models": [m["id"] for m in r.json().get("data", [])]}

        if provider == "ollama":
            import httpx
            async with httpx.AsyncClient(timeout=10) as hc:
                r = await hc.get("http://localhost:11434/api/tags")
                r.raise_for_status()
                return {"models": [m["name"] for m in r.json().get("models", [])]}

        return {"models": []}
    except LlmConfigMissing:
        raise
    except Exception as e:
        logger.warning("config.list_models_failed provider=%s err=%s", provider, e)
        raise LlmUpstreamError(_friendly_error(e))
