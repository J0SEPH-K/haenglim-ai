import enum
import json
from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Float, TypeDecorator
)
from sqlalchemy.orm import relationship
from app.database import Base


class JSONField(TypeDecorator):
    """Store JSON as text for SQLite compatibility."""
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None:
            return json.dumps(value)
        return None

    def process_result_value(self, value, dialect):
        if value is not None:
            return json.loads(value)
        return None


class UserRole(str, enum.Enum):
    admin = "admin"
    user = "user"


class MessageRole(str, enum.Enum):
    system = "system"
    user = "user"
    assistant = "assistant"


class ConversationMode(str, enum.Enum):
    chat = "chat"
    image = "image"


class AppSettings(Base):
    """Singleton row (id=1) for app-wide configuration toggles."""
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True)  # always 1
    ip_restriction_enabled = Column(Boolean, default=False, nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class IPAllowlistEntry(Base):
    """Single CIDR (or /32 for one host) allowed when IP restriction is enabled."""
    __tablename__ = "ip_allowlist"

    id = Column(Integer, primary_key=True, index=True)
    cidr = Column(String(64), nullable=False)
    label = Column(String(100), nullable=True)
    enabled = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    # Per-group caps (display-only for now). NULL means no cap.
    token_limit = Column(Integer, nullable=True)
    price_limit_usd = Column(Float, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    users = relationship("User", back_populates="group")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    name = Column(String(100), nullable=False)
    role = Column(String(10), default="user", nullable=False)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    # Per-user caps (display-only for now). NULL means no cap.
    token_limit = Column(Integer, nullable=True)
    price_limit_usd = Column(Float, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    group = relationship("Group", back_populates="users")
    conversations = relationship("Conversation", back_populates="user")


class AIProvider(Base):
    __tablename__ = "ai_providers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    provider_type = Column(String(50), nullable=False)  # openai, anthropic, gemini
    api_key_encrypted = Column(Text, nullable=False)
    model_id = Column(String(100), nullable=False)
    enabled = Column(Boolean, default=True)
    # Total tokens (prompt + completion) allowed for this provider. NULL = unlimited.
    token_quota = Column(Integer, nullable=True)
    # Per-1M-token prices in USD. NULL means "use fallback table in pricing.py".
    input_price_per_1m = Column(Float, nullable=True)
    output_price_per_1m = Column(Float, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    conversations = relationship("Conversation", back_populates="ai_provider")


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), default="New Conversation")
    mode = Column(String(10), default="chat", nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    ai_provider_id = Column(Integer, ForeignKey("ai_providers.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="conversations")
    ai_provider = relationship("AIProvider", back_populates="conversations")
    messages = relationship("Message", back_populates="conversation", order_by="Message.created_at")


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False)
    role = Column(String(10), nullable=False)
    text = Column(Text, nullable=True)
    image_url = Column(String(500), nullable=True)
    message_type = Column(String(20), default="text", nullable=False)
    image_params = Column(JSONField, nullable=True)
    # Provider/model actually used to produce this assistant message (may differ from conversation default).
    ai_provider_id = Column(Integer, ForeignKey("ai_providers.id", ondelete="SET NULL"), nullable=True)
    model_id = Column(String(100), nullable=True)
    prompt_tokens = Column(Integer, nullable=True)
    completion_tokens = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    conversation = relationship("Conversation", back_populates="messages")
    ai_provider = relationship("AIProvider")
