import base64
import os
import uuid
import httpx
from openai import AsyncOpenAI
from app.services.ai.base import AIAdapter
from app.config import get_settings


class OpenAIAdapter(AIAdapter):
    def __init__(self, api_key: str):
        self.client = AsyncOpenAI(api_key=api_key)

    def supports_vision(self) -> bool:
        return True

    def supports_image_generation(self) -> bool:
        return True

    def supports_image_editing(self) -> bool:
        return True

    async def chat(self, messages: list[dict], model: str, options: dict | None = None) -> tuple[str, dict]:
        # Adaptive routing: if the user wants web search and the caller didn't
        # already pick a search-capable model, swap to gpt-4o-search-preview
        # within the same family. Keeps the chat-completions call otherwise identical.
        if options and options.get("web_search") and "search" not in (model or "").lower():
            model = "gpt-4o-search-preview"

        response = await self.client.chat.completions.create(
            model=model,
            messages=messages,
        )
        text = response.choices[0].message.content or ""
        usage = {
            "prompt_tokens": getattr(response.usage, "prompt_tokens", 0) or 0,
            "completion_tokens": getattr(response.usage, "completion_tokens", 0) or 0,
        } if getattr(response, "usage", None) else {"prompt_tokens": 0, "completion_tokens": 0}
        return text, usage

    async def stream_chat(self, messages, model, options=None, usage_out=None):
        if options and options.get("web_search") and "search" not in (model or "").lower():
            model = "gpt-4o-search-preview"

        stream = await self.client.chat.completions.create(
            model=model,
            messages=messages,
            stream=True,
            # Ask for a final usage-only chunk so token accounting still works.
            stream_options={"include_usage": True},
        )
        async for chunk in stream:
            if getattr(chunk, "usage", None) and usage_out is not None:
                usage_out["prompt_tokens"] = getattr(chunk.usage, "prompt_tokens", 0) or 0
                usage_out["completion_tokens"] = getattr(chunk.usage, "completion_tokens", 0) or 0
            if chunk.choices:
                delta = chunk.choices[0].delta
                if delta and delta.content:
                    yield delta.content

    async def generate_image(self, prompt: str, model: str, params: dict) -> str:
        style = params.get("style", "vivid")
        dalle_styles = {"vivid", "natural"}
        # Append non-native styles to the prompt
        if style and style not in dalle_styles:
            style_label = style.replace("-", " ")
            prompt = f"{prompt}, in {style_label} style"
            style = "vivid"

        # DALL-E only supports 3 sizes — map others to nearest
        size = params.get("size", "1024x1024")
        dalle_sizes = {"1024x1024", "1024x1792", "1792x1024"}
        if size not in dalle_sizes:
            w, h = map(int, size.split("x"))
            ratio = w / h
            if ratio > 1.2:
                size = "1792x1024"
            elif ratio < 0.8:
                size = "1024x1792"
            else:
                size = "1024x1024"

        response = await self.client.images.generate(
            model=model if "dall-e" in model.lower() else "dall-e-3",
            prompt=prompt,
            size=size,
            style=style,
            n=1,
        )
        return self._result_to_url(response)

    async def edit_image(self, prompt: str, source_image_paths: list[str], model: str, mask_path: str | None = None, params: dict | None = None) -> str:
        image_data = await self._read_file(source_image_paths[0])
        mask_data = await self._read_file(mask_path) if mask_path else None

        kwargs = {
            "model": "dall-e-2",
            "image": image_data,
            "prompt": prompt,
            "size": (params or {}).get("size", "1024x1024"),
            "n": 1,
        }
        if mask_data:
            kwargs["mask"] = mask_data

        response = await self.client.images.edit(**kwargs)
        return self._result_to_url(response)

    def _result_to_url(self, response) -> str:
        """Return a usable image reference from an images API response.

        Newer models (gpt-image-1) return base64 and reject `response_format`;
        dall-e-* may return a hosted URL. Handle both: pass a URL straight through,
        and persist base64 locally as /uploads/<name> so the caller can use it as-is.
        """
        item = response.data[0]
        url = getattr(item, "url", None)
        if url:
            return url
        b64 = getattr(item, "b64_json", None)
        if b64:
            settings = get_settings()
            filename = f"{uuid.uuid4().hex}.png"
            filepath = os.path.join(settings.UPLOAD_DIR, filename)
            with open(filepath, "wb") as f:
                f.write(base64.b64decode(b64))
            return f"/uploads/{filename}"
        raise Exception("OpenAI image API returned neither url nor b64_json")

    async def _read_file(self, path: str) -> bytes:
        if path.startswith("http"):
            async with httpx.AsyncClient() as client:
                resp = await client.get(path)
                return resp.content
        with open(path.lstrip("/"), "rb") as f:
            return f.read()
