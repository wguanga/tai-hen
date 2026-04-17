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
        "2. 数学原理或算法逻辑（如适用，用 LaTeX：$...$ 行内，$$...$$ 独立公式）\n"
        "3. 在本文中的作用（用提供的上下文推断）\n"
        "4. 与相关技术的联系或对比\n"
        "\n"
        "🔴 引用原文时标注页码：(p.N) 或 > p.N: \"原文\"\n"
        "\n"
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
        "\n"
        "🔴 回答引用原文时必须标注页码，格式如下：\n"
        "- 短引用：在句末加 (p.N)\n"
        "- 长引用：使用 Markdown 引用块，首行写 > p.N:\n"
        "- 若引用多页：(p.3, p.5) 或分别标注\n"
        "\n"
        "其他规则：\n"
        "- 中文回答，保留关键英文术语\n"
        "- 不知道就说\"论文中未提及\"，不要编造\n"
        "- 单轮回答控制在 500 字内\n"
        "- 若用户的高亮/笔记上下文（由系统注入）和你的回答相关，优先基于这些内容，避免重复讲解"
    ),

    "compare_papers": (
        "你是学术论文对比分析助手。阅读多篇论文的摘要或开头文本，输出结构化对比报告。\n"
        "\n"
        "严格使用下列 Markdown 小节（缺一不可）：\n"
        "## 问题设定对比\n"
        "## 方法对比\n"
        "## 实验与结果对比\n"
        "## 相同点\n"
        "## 不同点\n"
        "## 综合评价 / 适用场景\n"
        "\n"
        "规则：\n"
        "- 用论文标题（前 30 字）而非「论文 1/2」来称呼各论文\n"
        "- 每节内用列表，每条 1-2 句\n"
        "- 引用论文原文时标注 (p.N)\n"
        "- 基于提供的文本，不编造数据\n"
        "- 总字数控制在 1500 字内，中文"
    ),

    "suggest_highlights": (
        "你是学术论文精读助手。阅读以下带页码标记的论文文本，从中挑出 5-10 个最值得用户高亮的句子，"
        "帮助读者快速抓住重点。\n"
        "\n"
        "分类规则（必须从中选一个）：\n"
        "- yellow（重要概念）：核心定义、关键术语首次出现的位置\n"
        "- blue（方法细节）：算法步骤、公式、模型结构的关键陈述\n"
        "- green（实验结论）：实验数字、效果对比、关键 ablation 结果\n"
        "- purple（不理解/需深究）：领域专有名词未解释、推导跳跃处\n"
        "\n"
        "🔴 输出格式：严格 JSON 数组，不要 Markdown 代码块包裹。示例：\n"
        '[{"page": 2, "color": "yellow", "text": "原文句子（保持英文原文，不翻译）", "reason": "为什么重点"}]\n'
        "\n"
        "要求：\n"
        "- text 必须是原文逐字节拷贝（后续要靠它定位高亮），不要改写/翻译/省略\n"
        "- text 长度控制在 15-200 字之间\n"
        "- 每个高亮都要写 1 句 reason（中文，为什么这句重要）\n"
        "- 尽量覆盖不同章节和不同颜色"
    ),
}


# Model vision capability detection. Models not listed → no vision.
VISION_MODEL_PREFIXES = {
    "openai": ("gpt-4o", "gpt-4-turbo", "gpt-4-vision", "o1", "o3"),
    "anthropic": ("claude-3-", "claude-3.5-", "claude-3-5-", "claude-4", "claude-sonnet-4", "claude-opus-4", "claude-haiku-4"),
    "ollama": ("llava", "bakllava", "moondream", "llama3.2-vision", "qwen2.5-vl", "qwen-vl"),
}


def model_supports_vision(provider: str, model: str) -> bool:
    """Return True if the given provider+model can accept images."""
    if not model:
        return False
    model_l = model.lower()
    prefixes = VISION_MODEL_PREFIXES.get(provider, ())
    return any(model_l.startswith(p) for p in prefixes)


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


async def stream_llm_with_image(image_bytes: bytes, text_prompt: str, system: str) -> AsyncGenerator[str, None]:
    """Stream an LLM response for a vision-capable model given an image + text."""
    import base64
    config = load_config()
    provider = config.get("provider", "openai")
    api_key = config.get("api_key", "")
    if provider != "ollama" and not api_key:
        raise LlmConfigMissing()

    b64 = base64.b64encode(image_bytes).decode("ascii")

    if provider == "openai":
        from openai import AsyncOpenAI
        try:
            client = AsyncOpenAI(api_key=api_key, base_url=config.get("base_url") or None)
            stream = await client.chat.completions.create(
                model=config.get("model", "gpt-4o-mini"),
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": [
                        {"type": "text", "text": text_prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
                    ]},
                ],
                stream=True,
            )
            async for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            raise LlmUpstreamError(str(e))

    elif provider == "anthropic":
        import anthropic
        try:
            client = anthropic.AsyncAnthropic(api_key=api_key)
            async with client.messages.stream(
                model=config.get("model", "claude-sonnet-4-6"),
                max_tokens=2048,
                system=system,
                messages=[{"role": "user", "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": b64}},
                    {"type": "text", "text": text_prompt},
                ]}],
            ) as stream:
                async for text in stream.text_stream:
                    yield text
        except Exception as e:
            raise LlmUpstreamError(str(e))

    elif provider == "ollama":
        from openai import AsyncOpenAI
        try:
            client = AsyncOpenAI(api_key="ollama", base_url="http://localhost:11434/v1")
            stream = await client.chat.completions.create(
                model=config.get("ollama_model", "llava"),
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": [
                        {"type": "text", "text": text_prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
                    ]},
                ],
                stream=True,
            )
            async for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
        except Exception as e:
            raise LlmUpstreamError(str(e))
    else:
        raise LlmUpstreamError(f"Unknown provider: {provider}")


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
