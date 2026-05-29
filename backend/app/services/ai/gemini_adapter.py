import asyncio
import base64
import mimetypes
import os
import uuid
import httpx
from google import genai
from google.genai import types
from app.services.ai.base import AIAdapter
from app.config import get_settings


class GeminiAdapter(AIAdapter):
    def __init__(self, api_key: str):
        self.client = genai.Client(api_key=api_key)

    def supports_vision(self) -> bool:
        return True

    def supports_image_generation(self) -> bool:
        return True

    def supports_image_editing(self) -> bool:
        return True

    async def _to_contents(self, messages: list[dict]) -> list:
        """Convert OpenAI-style messages into Gemini Content objects."""
        contents = []
        for msg in messages:
            role = "user" if msg["role"] in ("user", "system") else "model"
            content = msg["content"]

            if isinstance(content, list):
                parts = []
                for part in content:
                    if isinstance(part, str):
                        parts.append(types.Part.from_text(text=part))
                    elif isinstance(part, dict) and part.get("type") == "text":
                        parts.append(types.Part.from_text(text=part["text"]))
                    elif isinstance(part, dict) and part.get("type") == "image_url":
                        image_bytes, mime = await self._load_image_bytes(part["image_url"]["url"])
                        parts.append(types.Part.from_bytes(data=image_bytes, mime_type=mime))
                contents.append(types.Content(role=role, parts=parts))
            else:
                contents.append(types.Content(role=role, parts=[types.Part.from_text(text=content)]))
        return contents

    def _chat_config(self, options: dict | None):
        # Adaptive routing: enable Gemini's built-in google_search tool when the
        # user asks for web info. Only wired for 2.x models; on older ones the
        # SDK raises and the error bubbles up to the caller as usual.
        if options and options.get("web_search"):
            return types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
            )
        return None

    async def chat(self, messages: list[dict], model: str, options: dict | None = None) -> tuple[str, dict]:
        contents = await self._to_contents(messages)
        gen_config = self._chat_config(options)

        response = await asyncio.to_thread(
            lambda: self.client.models.generate_content(model=model, contents=contents, config=gen_config)
        )
        text = response.text or ""
        meta = getattr(response, "usage_metadata", None)
        usage = {
            "prompt_tokens": getattr(meta, "prompt_token_count", 0) or 0,
            "completion_tokens": getattr(meta, "candidates_token_count", 0) or 0,
        } if meta else {"prompt_tokens": 0, "completion_tokens": 0}
        return text, usage

    async def stream_chat(self, messages, model, options=None, usage_out=None):
        # The genai SDK's streaming generator is synchronous, so run it in a worker
        # thread and bridge chunks back to the event loop through a queue.
        contents = await self._to_contents(messages)
        gen_config = self._chat_config(options)

        queue: asyncio.Queue = asyncio.Queue()
        loop = asyncio.get_running_loop()
        SENTINEL = object()

        def _produce():
            try:
                for chunk in self.client.models.generate_content_stream(
                    model=model, contents=contents, config=gen_config
                ):
                    txt = getattr(chunk, "text", None)
                    meta = getattr(chunk, "usage_metadata", None)
                    loop.call_soon_threadsafe(queue.put_nowait, (txt, meta))
            except Exception as e:  # surface provider errors to the consumer
                loop.call_soon_threadsafe(queue.put_nowait, (e, None))
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, (SENTINEL, None))

        producer = asyncio.create_task(asyncio.to_thread(_produce))
        try:
            while True:
                item, meta = await queue.get()
                if item is SENTINEL:
                    break
                if isinstance(item, Exception):
                    raise item
                if meta is not None and usage_out is not None:
                    usage_out["prompt_tokens"] = getattr(meta, "prompt_token_count", 0) or 0
                    usage_out["completion_tokens"] = getattr(meta, "candidates_token_count", 0) or 0
                if item:
                    yield item
        finally:
            await producer

    async def generate_image(self, prompt: str, model: str, params: dict) -> str:
        """Generate an image using Gemini's image generation capability."""
        size = params.get("size", "1024x1024")
        style = params.get("style", "")

        # Append style to prompt
        if style and style not in ("vivid", "natural", ""):
            style_label = style.replace("-", " ")
            prompt = f"{prompt}, in {style_label} style"

        # Map size to aspect ratio
        aspect_ratio = "1:1"
        if size:
            w, h = size.split("x")
            w, h = int(w), int(h)
            if w > h:
                aspect_ratio = "16:9"
            elif h > w:
                aspect_ratio = "9:16"

        # Use Imagen API for imagen models, generate_content for gemini models
        if "imagen" in model:
            return await self._generate_with_imagen(prompt, model, aspect_ratio)
        else:
            return await self._generate_with_gemini(prompt, model, size)

    async def _generate_with_imagen(self, prompt: str, model: str, aspect_ratio: str) -> str:
        """Use the dedicated Imagen API."""
        config = types.GenerateImagesConfig(
            number_of_images=1,
            aspect_ratio=aspect_ratio,
        )
        response = await asyncio.to_thread(
            lambda: self.client.models.generate_images(model=model, prompt=prompt, config=config)
        )
        if not response.generated_images:
            raise Exception("Imagen returned no images")
        image_data = response.generated_images[0].image.image_bytes
        filename = f"{uuid.uuid4().hex}.png"
        settings = get_settings()
        filepath = os.path.join(settings.UPLOAD_DIR, filename)
        with open(filepath, "wb") as f:
            f.write(image_data)
        return f"/uploads/{filename}"

    async def _generate_with_gemini(self, prompt: str, model: str, size: str) -> str:
        """Use generate_content with response_modalities for Gemini image models."""
        aspect_prompt = ""
        if size:
            w, h = size.split("x")
            w, h = int(w), int(h)
            if w == h:
                aspect_prompt = " (square 1:1 aspect ratio)"
            elif w > h:
                aspect_prompt = " (landscape, wider than tall)"
            else:
                aspect_prompt = " (portrait, taller than wide)"

        gen_config = types.GenerateContentConfig(response_modalities=["TEXT", "IMAGE"])
        try:
            response = await asyncio.wait_for(
                asyncio.to_thread(
                    lambda: self.client.models.generate_content(
                        model=model,
                        contents=prompt + aspect_prompt,
                        config=gen_config,
                    )
                ),
                timeout=120,
            )
        except asyncio.TimeoutError:
            raise Exception(f"Image generation timed out after 120s. The model '{model}' may be slow or unavailable. Try using imagen-4.0-generate-001 instead.")
        return self._extract_and_save_image(response)

    async def edit_image(self, prompt: str, source_image_paths: list[str], model: str, mask_path: str | None = None, params: dict | None = None) -> str:
        """Edit an image using Gemini's image editing capability."""
        contents = []
        for path in source_image_paths:
            image_bytes, mime = await self._load_image_bytes(path)
            contents.append(types.Part.from_bytes(data=image_bytes, mime_type=mime))
        contents.append(types.Part.from_text(text=prompt))

        gen_config = types.GenerateContentConfig(response_modalities=["TEXT", "IMAGE"])
        response = await asyncio.to_thread(
            lambda: self.client.models.generate_content(model=model, contents=contents, config=gen_config)
        )

        return self._extract_and_save_image(response)

    def _extract_and_save_image(self, response) -> str:
        """Extract image from Gemini response and save locally."""
        if not response.candidates:
            raise Exception(f"Gemini returned no candidates. Response: {response}")
        candidate = response.candidates[0]
        if not candidate.content or not candidate.content.parts:
            # Check for safety block or other issues
            finish_reason = getattr(candidate, 'finish_reason', None)
            raise Exception(f"Gemini returned no content parts. Finish reason: {finish_reason}")
        for part in candidate.content.parts:
            if part.inline_data and part.inline_data.mime_type and part.inline_data.mime_type.startswith("image/"):
                image_data = part.inline_data.data
                ext_map = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
                ext = ext_map.get(part.inline_data.mime_type, ".png")
                filename = f"{uuid.uuid4().hex}{ext}"
                settings = get_settings()
                filepath = os.path.join(settings.UPLOAD_DIR, filename)
                with open(filepath, "wb") as f:
                    f.write(image_data)
                return f"/uploads/{filename}"
        # If we get here, response had parts but no images — maybe text only
        text_parts = [p.text for p in candidate.content.parts if hasattr(p, 'text') and p.text]
        raise Exception(f"No image in response. Text response: {'; '.join(text_parts)[:200]}")

    async def _load_image_bytes(self, url: str) -> tuple[bytes, str]:
        if url.startswith("http"):
            async with httpx.AsyncClient() as client:
                resp = await client.get(url)
                mime = resp.headers.get("content-type", "image/png")
                return resp.content, mime
        with open(url.lstrip("/"), "rb") as f:
            data = f.read()
        mime = mimetypes.guess_type(url)[0] or "image/png"
        return data, mime
