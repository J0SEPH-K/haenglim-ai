from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class AIProviderCreate(BaseModel):
    name: str
    provider_type: str  # openai, anthropic, gemini, groq
    api_key: str
    # Admins no longer pick a specific model — users choose from the variants
    # dropdown at chat time, and the backend falls back to a per-provider-type
    # default when nothing is selected.
    model_id: Optional[str] = ""
    enabled: bool = True
    token_quota: Optional[int] = None
    input_price_per_1m: Optional[float] = None
    output_price_per_1m: Optional[float] = None


class AIProviderUpdate(BaseModel):
    name: Optional[str] = None
    api_key: Optional[str] = None
    model_id: Optional[str] = None
    enabled: Optional[bool] = None
    token_quota: Optional[int] = None
    input_price_per_1m: Optional[float] = None
    output_price_per_1m: Optional[float] = None


class AIProviderOut(BaseModel):
    id: int
    name: str
    provider_type: str
    model_id: str
    enabled: bool
    token_quota: Optional[int] = None
    input_price_per_1m: Optional[float] = None
    output_price_per_1m: Optional[float] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AIProviderPublic(BaseModel):
    id: int
    name: str
    provider_type: str
    model_id: str

    model_config = {"from_attributes": True}
