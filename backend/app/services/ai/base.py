from abc import ABC, abstractmethod
from typing import AsyncIterator


Usage = dict  # {"prompt_tokens": int, "completion_tokens": int}


class AIAdapter(ABC):
    @abstractmethod
    async def chat(self, messages: list[dict], model: str, options: dict | None = None) -> tuple[str, Usage]:
        """Send chat messages and return (assistant text, usage).

        usage is a dict with at least the keys "prompt_tokens" and "completion_tokens".
        When the provider does not report usage, return zeros.

        `options` is an adaptive-routing dict populated by `services.ai.routing`.
        Recognized keys:
        - "web_search": bool — caller wants live web-search grounding. Adapters
          should either swap to a search-capable sibling model or attach the
          provider's native web-search tool. Silently ignore when unsupported.
        """
        ...

    async def stream_chat(
        self,
        messages: list[dict],
        model: str,
        options: dict | None = None,
        usage_out: dict | None = None,
    ) -> AsyncIterator[str]:
        """Yield assistant text deltas as they are generated.

        `usage_out`, when provided, is mutated in place with "prompt_tokens" and
        "completion_tokens" once known — most providers only report usage at the
        end of the stream, so read it after the generator is exhausted.

        Default implementation falls back to the non-streaming `chat()` and yields
        the whole answer in one chunk, so adapters that don't override still work.
        """
        text, usage = await self.chat(messages, model, options)
        if usage_out is not None:
            usage_out.update(usage)
        if text:
            yield text

    @abstractmethod
    async def generate_image(self, prompt: str, model: str, params: dict) -> str:
        """Generate an image from prompt. Returns URL or base64 data."""
        ...

    @abstractmethod
    async def edit_image(self, prompt: str, source_image_paths: list[str], model: str, mask_path: str | None = None, params: dict | None = None) -> str:
        """Edit an image. Returns URL or base64 data."""
        ...

    def supports_vision(self) -> bool:
        return False

    def supports_image_generation(self) -> bool:
        return False

    def supports_image_editing(self) -> bool:
        return False
