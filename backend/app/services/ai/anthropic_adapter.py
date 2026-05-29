import base64
import mimetypes
import httpx
from anthropic import AsyncAnthropic
from app.services.ai.base import AIAdapter


class AnthropicAdapter(AIAdapter):
    def __init__(self, api_key: str):
        self.client = AsyncAnthropic(api_key=api_key)

    def supports_vision(self) -> bool:
        return True

    def supports_image_generation(self) -> bool:
        return False

    def supports_image_editing(self) -> bool:
        return False

    def _build_kwargs(self, messages: list[dict], model: str, options: dict | None) -> dict:
        # Separate system messages from the rest
        system_text = ""
        chat_messages = []
        for msg in messages:
            if msg["role"] == "system":
                system_text += msg["content"] if isinstance(msg["content"], str) else ""
            else:
                chat_messages.append(msg)

        kwargs = {
            "model": model,
            "max_tokens": 4096,
            "messages": chat_messages,
        }
        if system_text:
            kwargs["system"] = system_text

        # Adaptive routing: attach Anthropic's server-side web_search tool when
        # the user's message implies they need fresh info. Safe to add on any
        # modern Claude — older models that reject it will surface a 400 that
        # bubbles up to the caller.
        if options and options.get("web_search"):
            kwargs["tools"] = [{
                "type": "web_search_20250305",
                "name": "web_search",
                "max_uses": 5,
            }]
        return kwargs

    async def chat(self, messages: list[dict], model: str, options: dict | None = None) -> tuple[str, dict]:
        kwargs = self._build_kwargs(messages, model, options)
        response = await self.client.messages.create(**kwargs)
        # When tools run, the model can emit multiple content blocks (tool_use,
        # tool_result, text). We only care about visible text blocks for the reply.
        text_parts = []
        for block in (response.content or []):
            if getattr(block, "type", None) == "text":
                text_parts.append(block.text or "")
        text = "".join(text_parts)
        usage = {
            "prompt_tokens": getattr(response.usage, "input_tokens", 0) or 0,
            "completion_tokens": getattr(response.usage, "output_tokens", 0) or 0,
        } if getattr(response, "usage", None) else {"prompt_tokens": 0, "completion_tokens": 0}
        return text, usage

    async def stream_chat(self, messages, model, options=None, usage_out=None):
        kwargs = self._build_kwargs(messages, model, options)
        async with self.client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                if text:
                    yield text
            final = await stream.get_final_message()
            if usage_out is not None and getattr(final, "usage", None):
                usage_out["prompt_tokens"] = getattr(final.usage, "input_tokens", 0) or 0
                usage_out["completion_tokens"] = getattr(final.usage, "output_tokens", 0) or 0

    async def generate_image(self, prompt: str, model: str, params: dict) -> str:
        raise NotImplementedError("Anthropic does not support image generation")

    async def edit_image(self, prompt: str, source_image_paths: list[str], model: str, mask_path: str | None = None, params: dict | None = None) -> str:
        raise NotImplementedError("Anthropic does not support image editing")


async def encode_image_for_anthropic(image_path: str) -> dict:
    """Encode an image file as a base64 content block for Anthropic's API."""
    if image_path.startswith("http"):
        async with httpx.AsyncClient() as client:
            resp = await client.get(image_path)
            data = resp.content
            media_type = resp.headers.get("content-type", "image/png")
    else:
        with open(image_path.lstrip("/"), "rb") as f:
            data = f.read()
        media_type = mimetypes.guess_type(image_path)[0] or "image/png"

    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": media_type,
            "data": base64.standard_b64encode(data).decode(),
        },
    }
