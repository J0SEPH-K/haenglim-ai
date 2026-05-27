from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr
from app.models.models import UserRole


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: UserRole = UserRole.user
    group_id: Optional[int] = None
    token_limit: Optional[int] = None
    price_limit_usd: Optional[float] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[UserRole] = None
    group_id: Optional[int] = None
    is_active: Optional[bool] = None
    # Negative sentinel values clear the override. Backend treats <0 as NULL.
    token_limit: Optional[int] = None
    price_limit_usd: Optional[float] = None


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    role: UserRole
    group_id: Optional[int] = None
    group_name: Optional[str] = None
    is_active: bool
    token_limit: Optional[int] = None
    price_limit_usd: Optional[float] = None
    created_at: datetime

    model_config = {"from_attributes": True}
