from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class GroupCreate(BaseModel):
    name: str
    token_limit: Optional[int] = None
    price_limit_usd: Optional[float] = None


class GroupUpdate(BaseModel):
    name: Optional[str] = None
    # Negative sentinel values clear. Backend treats <0 as NULL.
    token_limit: Optional[int] = None
    price_limit_usd: Optional[float] = None


class GroupOut(BaseModel):
    id: int
    name: str
    created_at: datetime
    user_count: int = 0
    token_limit: Optional[int] = None
    price_limit_usd: Optional[float] = None

    model_config = {"from_attributes": True}
