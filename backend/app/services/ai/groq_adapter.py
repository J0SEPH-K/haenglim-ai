import base64
import mimetypes
import httpx
from groq import AsyncGroq
from app.services.ai.base import AIAdapter


class GroqAdapter(AIAdapter):
    def __init__(self, api_key: str):
        self.client = AsyncGroq(api_key=api_key)

    def supports_vision(self) -> bool:
        return True

    def supports_image_generation(self) -> bool:
        return False

    def supports_image_editing(self) -> bool:
        return False

    async def _convert_messages(self, messages: list[dict]) -> list[dict]:
        # Convert image URLs to base64 data URLs for Groq vision
        converted = []
        for msg in messages:
            content = msg.get("content")
            if isinstance(content, list):
                new_parts = []
                for part in content:
                    if isinstance(part, dict) and part.get("type") == "image_url":
                        url = part["image_url"]["url"]
                        data_url = await self._to_data_url(url)
                        new_parts.append({"type": "image_url", "image_url": {"url": data_url}})
                    else:
                        new_parts.append(part)
                converted.append({"role": msg["role"], "content": new_parts})
            else:
                converted.append(msg)
        return converted

    async def chat(self, messages: list[dict], model: str, options: dict | None = None) -> tuple[str, dict]:
        # Groq has no first-party web-search surface today, so `options` is
        # intentionally ignored — the model just answers as normal.
        converted = await self._convert_messages(messages)
        response = await self.client.chat.completions.create(
            model=model,
            messages=converted,
        )
        text = response.choices[0].message.content or ""
        usage = {
            "prompt_tokens": getattr(response.usage, "prompt_tokens", 0) or 0,
            "completion_tokens": getattr(response.usage, "completion_tokens", 0) or 0,
        } if getattr(response, "usage", None) else {"prompt_tokens": 0, "completion_tokens": 0}
        return text, usage

    async def stream_chat(self, messages, model, options=None, usage_out=None):
        converted = await self._convert_messages(messages)
        stream = await self.client.chat.completions.create(
            model=model,
            messages=converted,
            stream=True,
            stream_options={"include_usage": True},
        )
        async for chunk in stream:
            if getattr(chunk, "usage", None) and usage_out is not None:
                usage_out["prompt_tokens"] = getattr(chunk.usage, "prompt_tokens", 0) or 0
                usage_out["completion_tokens"] = getattr(chunk.usage, "completion_tokens", 0) or 0
            if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    async def generate_image(self, prompt: str, model: str, params: dict) -> str:
        raise NotImplementedError("Groq does not support image generation")

    async def edit_image(self, prompt: str, source_image_paths: list[str], model: str, mask_path: str | None = None, params: dict | None = None) -> str:
        raise NotImplementedError("Groq does not support image editing")

    async def _to_data_url(self, url: str) -> str:
        """Convert a local or remote URL to a base64 data URL."""
        if url.startswith("data:"):
            return url
        if url.startswith("/uploads/"):
            path = url.lstrip("/")
            with open(path, "rb") as f:
                data = f.read()
            mime = mimetypes.guess_type(path)[0] or "image/png"
        else:
            async with httpx.AsyncClient() as client:
                resp = await client.get(url)
                data = resp.content
                mime = resp.headers.get("content-type", "image/png")
        b64 = base64.b64encode(data).decode()
        return f"data:{mime};base64,{b64}"
