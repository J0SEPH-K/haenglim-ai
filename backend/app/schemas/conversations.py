from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from app.models.models import ConversationMode
from app.schemas.providers import AIProviderPublic


class ConversationCreate(BaseModel):
    ai_provider_id: Optional[int] = None
    mode: ConversationMode = ConversationMode.chat
    title: Optional[str] = None


class ConversationOut(BaseModel):
    id: int
    title: str
    mode: ConversationMode
    user_id: int
    user_name: str
    ai_provider: Optional[AIProviderPublic] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
