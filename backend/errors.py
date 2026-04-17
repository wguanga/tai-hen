"""Unified application exceptions. See .claude/api-reference.md#03-错误码表."""


class AppError(Exception):
    code: str = "INTERNAL_ERROR"
    http: int = 500

    def __init__(self, message: str = "", detail: dict | None = None):
        self.message = message or self.__doc__ or "Application error"
        self.detail = detail or {}
        super().__init__(self.message)


class PaperNotFound(AppError):
    """论文不存在或已删除"""
    code = "PAPER_NOT_FOUND"
    http = 404


class HighlightNotFound(AppError):
    """高亮不存在"""
    code = "HIGHLIGHT_NOT_FOUND"
    http = 404


class NoteNotFound(AppError):
    """笔记不存在"""
    code = "NOTE_NOT_FOUND"
    http = 404


class FileTooLarge(AppError):
    """PDF 文件超过 100MB"""
    code = "FILE_TOO_LARGE"
    http = 413


class InvalidPdf(AppError):
    """无法解析 PDF，文件可能已损坏"""
    code = "INVALID_PDF"
    http = 400


class LlmConfigMissing(AppError):
    """未配置 LLM API Key，请先在设置中填写"""
    code = "LLM_CONFIG_MISSING"
    http = 400


class LlmUpstreamError(AppError):
    """LLM 服务返回错误"""
    code = "LLM_UPSTREAM_ERROR"
    http = 502


class LlmRateLimited(AppError):
    """LLM 服务限流，请稍后重试"""
    code = "LLM_RATE_LIMITED"
    http = 429


class LlmVisionNotSupported(AppError):
    """当前配置的模型不支持图像输入"""
    code = "LLM_VISION_NOT_SUPPORTED"
    http = 400
