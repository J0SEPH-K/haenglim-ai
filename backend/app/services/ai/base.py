from abc import ABC, abstractmethod


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
