import os
import uuid
import asyncio
import httpx
import json
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from app.config import get_settings
from app.database import get_db
from app.models.models import User, Conversation, Message, MessageRole, ConversationMode, AIProvider
from app.schemas.messages import ChatRequest, ImageGenerateRequest, ImageEditRequest, MessageOut
from app.services.ai.factory import get_adapter
from app.services.ai.anthropic_adapter import encode_image_for_anthropic
from app.services.ai.routing import detect_chat_options, resolve_chat_model, resolve_image_model
from app.utils.dependencies import get_current_user
from app.utils.document import extract_text, DOCUMENT_EXTENSIONS

router = APIRouter()


def _get_conversation(conversation_id: int, user: User, db: Session) -> Conversation:
    conv = db.query(Conversation).options(
        joinedload(Conversation.ai_provider),
        joinedload(Conversation.messages),
    ).filter(Conversation.id == conversation_id, Conversation.user_id == user.id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


def _message_to_out(msg: Message) -> MessageOut:
    return MessageOut(
        id=msg.id,
        conversation_id=msg.conversation_id,
        role=msg.role,
        text=msg.text,
        image_url=msg.image_url,
        message_type=msg.message_type,
        image_params=msg.image_params,
        created_at=msg.created_at,
    )


async def _build_chat_messages(conv: Conversation, new_text: str | None, new_image_urls: list[str] | None, provider: AIProvider = None, document_text: str | None = None) -> list[dict]:
    """Build message list in OpenAI-compatible format for the AI adapter."""
    messages = []
    provider_type = provider.provider_type if provider else (conv.ai_provider.provider_type if conv.ai_provider else "openai")

    KOREAN_INSTRUCTION = "기본 응답 언어는 한국어입니다. 단, 사용자가 다른 언어로 질문하거나 다른 언어로 답변을 요청한 경우 해당 언어로 답변하세요."

    # Default system prompt: respond in Korean unless user specifies otherwise
    messages.append({"role": "system", "content": KOREAN_INSTRUCTION})

    # For history messages, strip images to avoid exceeding model limits.
    # Only the new user message will include actual image data.
    for msg in conv.messages:
        if msg.role == "system":
            messages.append({"role": "system", "content": msg.text or ""})
        elif msg.image_url:
            # Convert image messages to text-only in history
            num_images = len(msg.image_params.get("image_urls", [msg.image_url])) if msg.image_params and "image_urls" in (msg.image_params or {}) else 1
            text_parts = []
            if msg.text:
                text_parts.append(msg.text)
            text_parts.append(f"[이미지 {num_images}장 첨부됨]")
            messages.append({"role": msg.role, "content": " ".join(text_parts)})
        else:
            messages.append({"role": msg.role, "content": msg.text or ""})

    # Build the new user message text
    user_text = new_text or ""

    # Append document content if present
    if document_text:
        user_text = f"{user_text}\n\n--- 첨부 문서 내용 ---\n{document_text}" if user_text else f"--- 첨부 문서 내용 ---\n{document_text}"

    if new_image_urls:
        user_text = f"{user_text}\n\n({KOREAN_INSTRUCTION})" if user_text else f"({KOREAN_INSTRUCTION})"

    if new_image_urls and provider_type == "anthropic":
        content = []
        for url in new_image_urls:
            img_block = await encode_image_for_anthropic(url)
            content.append(img_block)
        content.append({"type": "text", "text": user_text})
        messages.append({"role": "user", "content": content})
    elif new_image_urls:
        content = []
        for url in new_image_urls:
            content.append({"type": "image_url", "image_url": {"url": url}})
        content.append({"type": "text", "text": user_text})
        messages.append({"role": "user", "content": content})
    elif user_text:
        messages.append({"role": "user", "content": user_text})

    return messages


@router.post("/{conversation_id}/messages", response_model=dict)
async def send_message(
    conversation_id: int,
    body: ChatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Collect image URLs from both fields for backwards compatibility
    image_urls = body.image_urls or []
    if body.image_url and body.image_url not in image_urls:
        image_urls.insert(0, body.image_url)

    # Extract document text if documents are attached
    documents = body.documents or []
    document_text_parts = []
    document_names = []
    settings = get_settings()
    for doc in documents:
        doc_path = os.path.join(settings.UPLOAD_DIR, doc.url.replace("/uploads/", "")) if doc.url.startswith("/uploads/") else doc.url
        text = extract_text(doc_path)
        if text:
            document_text_parts.append(f"[{doc.original_name}]\n{text}")
            document_names.append(doc.original_name)
    document_text = "\n\n".join(document_text_parts) if document_text_parts else None

    if not body.text and not image_urls and not documents:
        raise HTTPException(status_code=400, detail="Message must have text, image, or document")

    conv = _get_conversation(conversation_id, user, db)

    # Resolve provider: per-message provider takes precedence, then conversation's default
    provider = None
    if body.ai_provider_id:
        provider = db.query(AIProvider).filter(AIProvider.id == body.ai_provider_id, AIProvider.enabled == True).first()
        if not provider:
            raise HTTPException(status_code=400, detail="AI provider not found or disabled")
    elif conv.ai_provider:
        provider = conv.ai_provider
    else:
        raise HTTPException(status_code=400, detail="No AI provider specified")

    adapter = get_adapter(provider)

    is_first_message = len(conv.messages) == 0

    # Save user message (first image as image_url, all stored in image_params)
    has_images = len(image_urls) > 0
    msg_params = {}
    if has_images:
        msg_params["image_urls"] = image_urls
    if document_names:
        msg_params["documents"] = [{"url": d.url, "name": d.original_name, "thumbnail_url": d.thumbnail_url, "page_count": d.page_count} for d in documents]

    user_msg = Message(
        conversation_id=conv.id,
        role="user",
        text=body.text,
        image_url=image_urls[0] if has_images else None,
        message_type="document" if documents and not has_images else ("image_input" if has_images else "text"),
        image_params=msg_params if msg_params else None,
    )
    db.add(user_msg)
    db.flush()

    # Build message history and call AI
    chat_messages = await _build_chat_messages(conv, body.text, image_urls if has_images else None, provider, document_text)
    try:
        # Adaptive routing: the user's model pick is a hint, not a hard constraint.
        # Per-message override > admin-stored default > per-provider-type fallback.
        model_id = resolve_chat_model(provider.provider_type, body.model_override or provider.model_id)
        # Inspect the prompt for intents (web search, etc.) so each adapter can
        # swap models or attach native tools without the user knowing model names.
        chat_options = detect_chat_options(body.text)
        response_text, usage = await adapter.chat(chat_messages, model_id, chat_options)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=502, detail=f"AI provider error: {str(e)}")

    # Save assistant response
    assistant_msg = Message(
        conversation_id=conv.id,
        role="assistant",
        text=response_text,
        message_type="text",
        ai_provider_id=provider.id,
        model_id=model_id,
        prompt_tokens=usage.get("prompt_tokens", 0),
        completion_tokens=usage.get("completion_tokens", 0),
    )
    db.add(assistant_msg)
    db.commit()
    db.refresh(user_msg)
    db.refresh(assistant_msg)

    # Generate smart title from first exchange
    if is_first_message:
        try:
            title_prompt = [
                {"role": "system", "content": "사용자와 AI의 첫 대화를 보고, 이 대화의 주제를 한국어로 짧게 요약해 제목을 만들어주세요. 제목만 출력하세요. 10자 이내로 간결하게."},
                {"role": "user", "content": f"사용자: {body.text or '(이미지)'}\n\nAI: {response_text[:500]}"},
            ]
            title, _ = await adapter.chat(title_prompt, model_id)
            title = title.strip().strip('"').strip("'").strip()[:100]
            if title:
                conv.title = title
                db.commit()
        except Exception:
            pass  # Keep default title if generation fails

    return {
        "user_message": _message_to_out(user_msg),
        "assistant_message": _message_to_out(assistant_msg),
    }


def _title_prompt(user_text: str | None, response_text: str) -> list[dict]:
    return [
        {"role": "system", "content": "사용자와 AI의 첫 대화를 보고, 이 대화의 주제를 한국어로 짧게 요약해 제목을 만들어주세요. 제목만 출력하세요. 10자 이내로 간결하게."},
        {"role": "user", "content": f"사용자: {user_text or '(이미지)'}\n\nAI: {response_text[:500]}"},
    ]


@router.post("/{conversation_id}/messages/stream")
async def send_message_stream(
    conversation_id: int,
    body: ChatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Streaming variant of send_message.

    All validation + the user-message save happen up front (so HTTP errors are real
    status codes). Once the response body starts, we emit newline-delimited JSON
    events: {"type":"delta","text":...} per token, then {"type":"done", ...} with the
    saved messages, then optionally {"type":"title", ...} for first-message titles, or
    {"type":"error", ...} if the provider fails mid-stream.
    """
    # Collect image URLs from both fields for backwards compatibility
    image_urls = body.image_urls or []
    if body.image_url and body.image_url not in image_urls:
        image_urls.insert(0, body.image_url)

    # Extract document text if documents are attached
    documents = body.documents or []
    document_text_parts = []
    document_names = []
    settings = get_settings()
    for doc in documents:
        doc_path = os.path.join(settings.UPLOAD_DIR, doc.url.replace("/uploads/", "")) if doc.url.startswith("/uploads/") else doc.url
        text = extract_text(doc_path)
        if text:
            document_text_parts.append(f"[{doc.original_name}]\n{text}")
            document_names.append(doc.original_name)
    document_text = "\n\n".join(document_text_parts) if document_text_parts else None

    if not body.text and not image_urls and not documents:
        raise HTTPException(status_code=400, detail="Message must have text, image, or document")

    conv = _get_conversation(conversation_id, user, db)

    provider = None
    if body.ai_provider_id:
        provider = db.query(AIProvider).filter(AIProvider.id == body.ai_provider_id, AIProvider.enabled == True).first()
        if not provider:
            raise HTTPException(status_code=400, detail="AI provider not found or disabled")
    elif conv.ai_provider:
        provider = conv.ai_provider
    else:
        raise HTTPException(status_code=400, detail="No AI provider specified")

    adapter = get_adapter(provider)
    is_first_message = len(conv.messages) == 0

    has_images = len(image_urls) > 0
    msg_params: dict = {}
    if has_images:
        msg_params["image_urls"] = image_urls
    if document_names:
        msg_params["documents"] = [{"url": d.url, "name": d.original_name, "thumbnail_url": d.thumbnail_url, "page_count": d.page_count} for d in documents]

    user_msg = Message(
        conversation_id=conv.id,
        role="user",
        text=body.text,
        image_url=image_urls[0] if has_images else None,
        message_type="document" if documents and not has_images else ("image_input" if has_images else "text"),
        image_params=msg_params if msg_params else None,
    )
    db.add(user_msg)
    db.flush()

    chat_messages = await _build_chat_messages(conv, body.text, image_urls if has_images else None, provider, document_text)
    model_id = resolve_chat_model(provider.provider_type, body.model_override or provider.model_id)
    chat_options = detect_chat_options(body.text)

    async def event_stream():
        usage_out: dict = {}
        parts: list[str] = []
        try:
            async for delta in adapter.stream_chat(chat_messages, model_id, chat_options, usage_out):
                parts.append(delta)
                yield json.dumps({"type": "delta", "text": delta}, ensure_ascii=False) + "\n"
        except Exception as e:
            db.rollback()
            yield json.dumps({"type": "error", "detail": f"AI provider error: {str(e)}"}, ensure_ascii=False) + "\n"
            return

        response_text = "".join(parts)
        assistant_msg = Message(
            conversation_id=conv.id,
            role="assistant",
            text=response_text,
            message_type="text",
            ai_provider_id=provider.id,
            model_id=model_id,
            prompt_tokens=usage_out.get("prompt_tokens", 0),
            completion_tokens=usage_out.get("completion_tokens", 0),
        )
        db.add(assistant_msg)
        db.commit()
        db.refresh(user_msg)
        db.refresh(assistant_msg)

        yield json.dumps({
            "type": "done",
            "user_message": _message_to_out(user_msg).model_dump(mode="json"),
            "assistant_message": _message_to_out(assistant_msg).model_dump(mode="json"),
        }, ensure_ascii=False) + "\n"

        # Title generation runs after the answer is fully streamed, so it never
        # delays the visible response; the sidebar title just pops in a moment later.
        if is_first_message:
            try:
                title, _ = await adapter.chat(_title_prompt(body.text, response_text), model_id)
                title = title.strip().strip('"').strip("'").strip()[:100]
                if title:
                    conv.title = title
                    db.commit()
                    yield json.dumps({"type": "title", "title": title, "conversation_id": conv.id}, ensure_ascii=False) + "\n"
            except Exception:
                pass

    return StreamingResponse(
        event_stream(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/{conversation_id}/generate-image")
async def generate_image(
    conversation_id: int,
    body: ImageGenerateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conv = _get_conversation(conversation_id, user, db)
    if conv.mode != ConversationMode.image:
        raise HTTPException(status_code=400, detail="Conversation is not in image mode")

    # Resolve provider: per-request override or conversation default
    provider = None
    if body.ai_provider_id:
        provider = db.query(AIProvider).filter(AIProvider.id == body.ai_provider_id, AIProvider.enabled == True).first()
        if not provider:
            raise HTTPException(status_code=400, detail="AI provider not found or disabled")
    elif conv.ai_provider:
        provider = conv.ai_provider
    else:
        raise HTTPException(status_code=400, detail="No AI provider specified")

    adapter = get_adapter(provider)
    if not adapter.supports_image_generation():
        raise HTTPException(status_code=400, detail="This AI provider does not support image generation. Please select an image model (e.g. gpt-image-1, dall-e-3).")

    variations = max(1, min(body.variations, 4))
    params = {"size": body.size, "style": body.style}

    # Step 1: Resolve prompts per variation.
    # - ai_enhance on: rewrite each variation via chat model.
    # - ai_enhance off, variations > 1: still ask chat model for distinct variations so we don't
    #   generate N identical images.
    # - ai_enhance off, variations == 1: use the raw prompt.
    if body.ai_enhance or variations > 1:
        chat_candidates = _chat_provider_candidates(db, provider)
        prompts = await _generate_prompt_variations(chat_candidates, body.prompt, variations)
    else:
        prompts = [body.prompt]

    is_first_message = len(conv.messages) == 0

    # Save user prompt message
    user_params: dict[str, Any] = {}
    if variations > 1:
        user_params["variations"] = variations
    if body.ai_enhance:
        user_params["ai_enhance"] = True
    user_msg = Message(
        conversation_id=conv.id,
        role="user",
        text=body.prompt,
        message_type="text",
        image_params=user_params or None,
    )
    db.add(user_msg)
    db.flush()

    # Step 2: Generate images in parallel
    async def _gen_one(enhanced_prompt: str) -> tuple[str, str]:
        """Generate one image and return (local_url, enhanced_prompt)."""
        gen_model_id = resolve_image_model(provider.provider_type, body.model_override or provider.model_id)
        image_url = await adapter.generate_image(enhanced_prompt, gen_model_id, params)
        # If adapter already saved the image locally (e.g. Gemini), use as-is; otherwise download it.
        local_url = image_url if image_url.startswith("/uploads/") else await _save_remote_image(image_url)
        return local_url, enhanced_prompt

    try:
        results = await asyncio.gather(*[_gen_one(p) for p in prompts])
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=502, detail=f"Image generation error: {str(e)}")

    # Step 3: Save all generated images as assistant messages
    assistant_msgs = []
    for i, (local_url, enhanced_prompt) in enumerate(results):
        msg_params = {**params}
        if body.ai_enhance:
            msg_params["enhanced_prompt"] = enhanced_prompt
        if len(results) > 1:
            msg_params["variation_index"] = i + 1
            msg_params["variation_total"] = len(results)

        assistant_msg = Message(
            conversation_id=conv.id,
            role="assistant",
            text=None,
            image_url=local_url,
            message_type="image_generated",
            image_params=msg_params,
        )
        db.add(assistant_msg)
        assistant_msgs.append(assistant_msg)

    db.commit()
    for msg in assistant_msgs:
        db.refresh(msg)

    # Generate smart title from first prompt
    if is_first_message:
        try:
            title_prompt = [
                {"role": "system", "content": "사용자가 AI 이미지 생성에 사용한 프롬프트를 보고, 이 이미지의 주제를 한국어로 짧게 요약해 제목을 만들어주세요. 제목만 출력하세요. 10자 이내로 간결하게."},
                {"role": "user", "content": body.prompt},
            ]
            title = await _chat_with_fallback(_chat_provider_candidates(db, provider), title_prompt)
            title = title.strip().strip('"').strip("'").strip()[:100]
            if title:
                conv.title = title
                db.commit()
        except Exception:
            pass

    # Return single message for backwards compat, or list for variations
    if len(assistant_msgs) == 1:
        return _message_to_out(assistant_msgs[0])
    return [_message_to_out(m) for m in assistant_msgs]


_TEXT_FALLBACK_MODEL = {
    "openai": "gpt-4o-mini",
    "anthropic": "claude-3-5-haiku-latest",
    "gemini": "gemini-2.5-flash",
    "groq": "llama-3.3-70b-versatile",
}


def _is_image_only_model(model_id: str) -> bool:
    m = model_id.lower()
    return "imagen" in m or "image" in m or m.startswith("dall-e")


def _chat_provider_candidates(db: Session, current_provider: AIProvider) -> list[tuple]:
    """Build an ordered list of (adapter, model_id) candidates for prompt enhancement.

    Order: current provider if it can chat, then every other enabled chat-capable provider
    (openai > anthropic > gemini > groq), then a known text-model fallback on the current
    provider's API key. Used so transient failures on the first candidate can be retried on
    the next one.
    """
    priority = {"openai": 0, "anthropic": 1, "gemini": 2, "groq": 3}
    candidates: list[tuple] = []
    seen: set[tuple[int, str]] = set()

    def add(provider: AIProvider, model: str):
        # Fall back to the per-provider-type default when the provider has no
        # admin-assigned model (common now that the admin UI no longer sets one).
        model = resolve_chat_model(provider.provider_type, model)
        if not model:
            return
        key = (provider.id, model)
        if key in seen:
            return
        seen.add(key)
        candidates.append((get_adapter(provider), model))

    if not _is_image_only_model(current_provider.model_id or ""):
        add(current_provider, current_provider.model_id)

    others = db.query(AIProvider).filter(
        AIProvider.enabled == True,
        AIProvider.id != current_provider.id,
    ).all()
    others.sort(key=lambda p: priority.get(p.provider_type, 99))
    for p in others:
        if not _is_image_only_model(p.model_id or ""):
            add(p, p.model_id)

    # Last resort: reuse current provider's API key with a known sibling text model
    fallback_model = _TEXT_FALLBACK_MODEL.get(current_provider.provider_type)
    if fallback_model:
        add(current_provider, fallback_model)

    if not candidates:
        # Nothing usable — return current provider raw so the caller fails loudly
        candidates.append((get_adapter(current_provider), current_provider.model_id or ""))
    return candidates


def _find_chat_provider(db: Session, current_provider: AIProvider) -> tuple:
    """Back-compat: return the top chat candidate."""
    return _chat_provider_candidates(db, current_provider)[0]


_TRANSIENT_HINTS = ("503", "529", "overload", "unavailable", "rate limit", "timeout", "try again")


async def _chat_with_fallback(candidates: list[tuple], messages: list[dict]) -> str:
    """Try each (adapter, model) candidate in order, with one quick retry on transient errors.

    Moves on to the next configured chat provider when the current one hits 503/rate-limit.
    Raises the last exception if every candidate fails.
    """
    import logging
    logger = logging.getLogger("ai_enhance")
    last_exc: Exception | None = None
    for idx, (adapter, model_id) in enumerate(candidates):
        for attempt in range(2):
            try:
                logger.info(f"AI enhance attempt: candidate {idx+1}/{len(candidates)} model='{model_id}' retry={attempt}")
                text, _ = await adapter.chat(messages, model_id)
                return text
            except Exception as e:
                last_exc = e
                msg = str(e).lower()
                transient = any(h in msg for h in _TRANSIENT_HINTS)
                if not transient:
                    logger.warning(f"AI enhance non-transient error on '{model_id}': {e}. Moving to next candidate")
                    break  # non-transient — don't retry same candidate, try next
                if attempt == 0 and idx < len(candidates) - 1:
                    logger.warning(f"AI enhance transient on '{model_id}': {e}. Trying next candidate")
                    break  # try next candidate immediately
                if attempt == 0:
                    # Last candidate — give it one retry with a short backoff
                    logger.warning(f"AI enhance transient on last candidate '{model_id}': {e}. Retrying in 2s")
                    await asyncio.sleep(2.0)
                    continue
    assert last_exc is not None
    raise last_exc


async def _generate_prompt_variations(candidates: list[tuple], user_prompt: str, count: int) -> list[str]:
    """Use the chat AI to rewrite a user's image prompt into enhanced variations."""
    import logging
    import re
    logger = logging.getLogger("ai_enhance")

    is_korean = bool(re.search(r'[\uac00-\ud7a3]', user_prompt))
    lang_instruction = (
        "Write the enhanced prompt in Korean (한국어), matching the language of the original prompt. "
        if is_korean
        else ""
    )

    # Use a single user message (no system message) to maximize compatibility across models
    if count == 1:
        instruction = (
            f"You are an expert image prompt engineer. Rewrite the following image generation prompt "
            f"into a single enhanced version. Add specifics about composition, lighting, style, colors, "
            f"and mood while preserving the original intent. {lang_instruction}"
            f"Return ONLY the enhanced prompt, nothing else.\n\n"
            f"Original prompt: {user_prompt}"
        )
    else:
        instruction = (
            f"You are an expert image prompt engineer. Rewrite the following image generation prompt "
            f"into exactly {count} different enhanced versions. Each version should emphasize different aspects "
            f"(composition, lighting, mood, style, camera angle, etc.) while staying true to the original intent. "
            f"{lang_instruction}\n\n"
            f"Original prompt: {user_prompt}\n\n"
            f"Return ONLY a JSON array of {count} strings, no explanation. Example: [\"prompt 1\", \"prompt 2\"]"
        )

    messages = [
        {"role": "user", "content": instruction},
    ]

    logger.info(f"AI enhance: {len(candidates)} candidate(s) for prompt rewrite (count={count})")

    try:
        response = await _chat_with_fallback(candidates, messages)
        response = response.strip()
        logger.info(f"AI enhance response (first 300 chars): {response[:300]}")

        if count == 1:
            # Strip markdown code blocks if present
            result = re.sub(r'^```[a-z]*\n?|\n?```$', '', response).strip().strip('"').strip("'")
            if result and len(result) > 10:
                logger.info(f"AI enhance success: single prompt rewritten")
                return [result]
        else:
            # Try to extract JSON array — handle markdown code blocks
            cleaned = re.sub(r'^```[a-z]*\n?|\n?```$', '', response).strip()
            # Find the JSON array in the response
            match = re.search(r'\[.*\]', cleaned, re.DOTALL)
            if match:
                parsed = json.loads(match.group())
                if isinstance(parsed, list) and len(parsed) >= 1:
                    results = [str(p).strip() for p in parsed[:count]]
                    logger.info(f"AI enhance success: {len(results)} variations generated")
                    return results
    except Exception as e:
        logger.error(f"AI enhance failed: {type(e).__name__}: {e}")

    # Fallback: return original prompt
    logger.warning(f"AI enhance fallback: returning original prompt")
    return [user_prompt] * count


async def _generate_edit_prompt(candidates: list[tuple], user_prompt: str) -> str | None:
    """Rewrite a user's image EDIT instruction into a clearer, more specific edit prompt."""
    import logging
    import re
    logger = logging.getLogger("ai_enhance")

    is_korean = bool(re.search(r'[\uac00-\ud7a3]', user_prompt))
    lang_instruction = (
        "Write the rewritten instruction in Korean (한국어), matching the language of the original. "
        if is_korean
        else ""
    )

    instruction = (
        "You are an expert image-editing prompt engineer. Rewrite the following image EDIT instruction "
        "so it is clearer, more specific, and easier for an image model to apply. Preserve the user's "
        "intent exactly — do NOT invent new subjects or change the scene beyond what was asked. "
        "Clarify which parts of the source image should change vs. stay the same, and add concrete "
        f"details about style, color, lighting, or composition only when clearly implied. {lang_instruction}"
        "Return ONLY the rewritten instruction, nothing else.\n\n"
        f"Original edit instruction: {user_prompt}"
    )

    try:
        response = await _chat_with_fallback(candidates, [{"role": "user", "content": instruction}])
        cleaned = re.sub(r'^```[a-z]*\n?|\n?```$', '', response.strip()).strip().strip('"').strip("'")
        if cleaned and len(cleaned) > 3:
            logger.info("AI enhance (edit): prompt rewritten")
            return cleaned
    except Exception as e:
        logger.error(f"AI enhance (edit) failed: {type(e).__name__}: {e}")
    return None


@router.post("/{conversation_id}/edit-image", response_model=MessageOut)
async def edit_image(
    conversation_id: int,
    body: ImageEditRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conv = _get_conversation(conversation_id, user, db)
    if conv.mode != ConversationMode.image:
        raise HTTPException(status_code=400, detail="Conversation is not in image mode")

    adapter = get_adapter(conv.ai_provider)
    if not adapter.supports_image_editing():
        raise HTTPException(status_code=400, detail="This AI provider does not support image editing")

    # Resolve local file paths
    source_urls = body.source_image_urls or ([body.source_image_url] if body.source_image_url else [])
    if not source_urls:
        raise HTTPException(status_code=400, detail="At least one source image is required")
    if len(source_urls) > 5:
        raise HTTPException(status_code=400, detail="Up to 5 source images are supported")
    source_paths = [_resolve_upload_path(u) for u in source_urls]
    mask_path = _resolve_upload_path(body.mask_image_url) if body.mask_image_url else None

    is_first_message = len(conv.messages) == 0

    # Optionally rewrite the edit prompt via a chat-capable model
    enhanced_prompt = body.prompt
    if body.ai_enhance:
        rewritten = await _generate_edit_prompt(_chat_provider_candidates(db, conv.ai_provider), body.prompt)
        if rewritten:
            enhanced_prompt = rewritten

    user_params = {}
    if len(source_urls) > 1:
        user_params["source_urls"] = source_urls
    if body.ai_enhance:
        user_params["ai_enhance"] = True

    user_msg = Message(
        conversation_id=conv.id,
        role="user",
        text=body.prompt,
        image_url=source_urls[0],
        message_type="image_input",
        image_params=user_params or None,
    )
    db.add(user_msg)
    db.flush()

    try:
        edit_model_id = resolve_image_model(conv.ai_provider.provider_type, conv.ai_provider.model_id)
        image_url = await adapter.edit_image(enhanced_prompt, source_paths, edit_model_id, mask_path)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=502, detail=f"Image editing error: {str(e)}")

    local_url = image_url if image_url.startswith("/uploads/") else await _save_remote_image(image_url)

    assistant_params = {"sources": source_urls, "mask": body.mask_image_url}
    if body.ai_enhance and enhanced_prompt != body.prompt:
        assistant_params["enhanced_prompt"] = enhanced_prompt

    assistant_msg = Message(
        conversation_id=conv.id,
        role="assistant",
        text=None,
        image_url=local_url,
        message_type="image_edited",
        image_params=assistant_params,
    )
    db.add(assistant_msg)
    db.commit()
    db.refresh(assistant_msg)

    # Generate smart title from first edit prompt
    if is_first_message:
        try:
            title_prompt = [
                {"role": "system", "content": "사용자가 AI 이미지 편집에 사용한 프롬프트를 보고, 이 편집 작업의 주제를 한국어로 짧게 요약해 제목을 만들어주세요. 제목만 출력하세요. 10자 이내로 간결하게."},
                {"role": "user", "content": body.prompt},
            ]
            title = await _chat_with_fallback(_chat_provider_candidates(db, conv.ai_provider), title_prompt)
            title = title.strip().strip('"').strip("'").strip()[:100]
            if title:
                conv.title = title
                db.commit()
        except Exception:
            pass

    return _message_to_out(assistant_msg)


def _resolve_upload_path(url: str) -> str:
    """Resolve a client-provided image reference to a local file path or a pass-through URL.

    Accepts /uploads/<name> (local upload) or http(s):// URLs. Rejects anything else so adapters
    aren't handed bare filesystem-looking strings that could escape the upload dir.
    """
    settings = get_settings()
    if url.startswith("/uploads/"):
        name = url[len("/uploads/"):]
        if "/" in name or "\\" in name or ".." in name:
            raise HTTPException(status_code=400, detail="Invalid upload path")
        return os.path.join(settings.UPLOAD_DIR, name)
    if url.startswith("http://") or url.startswith("https://"):
        return url
    raise HTTPException(status_code=400, detail="Image url must be /uploads/... or http(s)://...")


async def _save_remote_image(url: str) -> str:
    """Download a remote image and save it locally. Returns the local URL path."""
    settings = get_settings()
    async with httpx.AsyncClient() as client:
        resp = await client.get(url)
        resp.raise_for_status()

    content_type = resp.headers.get("content-type", "image/png")
    ext_map = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
    ext = ext_map.get(content_type, ".png")

    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(settings.UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(resp.content)

    return f"/uploads/{filename}"
