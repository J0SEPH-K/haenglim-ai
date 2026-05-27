from datetime import datetime
from typing import Optional, Any
from pydantic import BaseModel
from app.models.models import MessageRole


class DocumentInfo(BaseModel):
    url: str
    original_name: str
    thumbnail_url: Optional[str] = None
    page_count: Optional[int] = None


class ChatRequest(BaseModel):
    text: Optional[str] = None
    image_url: Optional[str] = None
    image_urls: Optional[list[str]] = None
    documents: Optional[list[DocumentInfo]] = None
    ai_provider_id: Optional[int] = None
    model_override: Optional[str] = None


class ImageGenerateRequest(BaseModel):
    prompt: str
    size: Optional[str] = "1024x1024"
    style: Optional[str] = None
    n: int = 1
    ai_enhance: bool = False
    variations: int = 1
    ai_provider_id: Optional[int] = None
    model_override: Optional[str] = None


class ImageEditRequest(BaseModel):
    prompt: str
    source_image_url: Optional[str] = None
    source_image_urls: Optional[list[str]] = None
    mask_image_url: Optional[str] = None
    ai_enhance: bool = False


class MessageOut(BaseModel):
    id: int
    conversation_id: int
    role: MessageRole
    text: Optional[str] = None
    image_url: Optional[str] = None
    message_type: str
    image_params: Optional[dict[str, Any]] = None
    created_at: datetime

    model_config = {"from_attributes": True}
