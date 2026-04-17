"""Unified LLM streaming. Prompts are centralized in .claude/ai-prompts.md."""
from typing import AsyncGenerator, Iterable

from errors import LlmConfigMissing, LlmUpstreamError
from services.config_service import load_config


SYSTEM_PROMPTS = {
    "explain_simple": (
        "你是一个学术论文阅读助手。用简洁易懂的语言解释用户选中的内容。\n"
        "规则：\n"
        "- 回答控制在 200 字以内\n"
        "- 先给出核心含义（一句话）\n"
        "- 再给一个生活化的类比\n"
        "- 保留关键英文术语，首次出现时括号内给中文\n"
        "- 不要展开数学推导\n"
        "输出格式：\n核心含义：...\n类比：..."
    ),
    "explain_technical": (
        "你是一个专业的学术论文解读助手。详细解释用户选中的技术内容。\n"
        "覆盖：\n"
        "1. 核心定义与含义\n"
        "2. 数学原理或算法逻辑（如适用）\n"
        "3. 在本文中的作用（用提供的上下文推断）\n"
        "4. 与相关技术的联系或对比\n"
        "风格：中文回答，保留关键英文术语，400-800 字，不要编造论文没提及的内容。"
    ),
    "translate": (
        "将以下学术论文段落翻译成中文。要求：\n"
        "- 保留专业术语的英文原文，首次出现时括号内注明中文译法\n"
        "- 保留公式符号不翻译\n"
        "- 保留 [n] 格式的引用编号\n"
        "- 保持学术语气"
    ),
    "summarize": (
        "请对这篇论文生成结构化阅读笔记。严格使用如下 Markdown 二级标题，缺一不可：\n"
        "## 一句话核心贡献\n（1-2 句，抓本质）\n\n"
        "## 解决的问题\n（背景 + 现有方法不足，3-5 句）\n\n"
        "## 主要方法\n（3-5 个要点，每个 1-2 句，可用列表）\n\n"
        "## 关键实验结论\n（3-5 条，含关键数字，可用列表）\n\n"
        "## 局限性与未来工作\n（2-4 条）\n\n"
        "## 关键术语\n（本文提出或反复使用的 3-8 个术语，每个一句话解释）\n\n"
        "约束：\n"
        "- 全部基于提供的论文文本，不编造数字或实验\n"
        "- 保留关键英文术语\n"
        "- 总字数控制在 1500 字内\n"
        "- 文本可能含 [truncated] 标记表示截断"
    ),
    "chat": (
        "你是一个论文精读助手。根据对话历史和提供的上下文回答问题。\n"
        "中文回答，保留关键英文术语。引用论文片段时用 > 引用块。\n"
        "不知道就说\"论文中未提及\"，不要编造。单轮回答控制在 500 字内。"
    ),
}


async def stream_llm(messages: list[dict], system: str) -> AsyncGenerator[str, None]:
    config = load_config()
    provider = config.get("provider", "openai")
    api_key = config.get("api_key", "")

    if provider != "ollama" and not api_key:
        raise LlmConfigMissing()

    if provider == "openai":
        async for chunk in _stream_openai(messages, system, config):
            yield chunk
    elif provider == "anthropic":
        async for chunk in _stream_anthropic(messages, system, config):
            yield chunk
    elif provider == "ollama":
        async for chunk in _stream_ollama(messages, system, config):
            yield chunk
    else:
        raise LlmUpstreamError(f"Unknown provider: {provider}")


async def _stream_openai(messages, system, config):
    from openai import AsyncOpenAI
    try:
        client = AsyncOpenAI(
            api_key=config["api_key"],
            base_url=config.get("base_url") or None,
        )
        stream = await client.chat.completions.create(
            model=config.get("model", "gpt-4o-mini"),
            messages=[{"role": "system", "content": system}] + list(messages),
            stream=True,
        )
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    except Exception as e:
        raise LlmUpstreamError(str(e))


async def _stream_anthropic(messages, system, config):
    import anthropic
    try:
        client = anthropic.AsyncAnthropic(api_key=config["api_key"])
        async with client.messages.stream(
            model=config.get("model", "claude-sonnet-4-6"),
            max_tokens=2048,
            system=system,
            messages=list(messages),
        ) as stream:
            async for text in stream.text_stream:
                yield text
    except Exception as e:
        raise LlmUpstreamError(str(e))


async def _stream_ollama(messages, system, config):
    from openai import AsyncOpenAI
    try:
        client = AsyncOpenAI(
            api_key="ollama",
            base_url="http://localhost:11434/v1",
        )
        stream = await client.chat.completions.create(
            model=config.get("ollama_model", "qwen2.5:14b"),
            messages=[{"role": "system", "content": system}] + list(messages),
            stream=True,
        )
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    except Exception as e:
        raise LlmUpstreamError(str(e))
