from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.models import User, Conversation, AIProvider, Message
from app.schemas.conversations import ConversationCreate, ConversationOut
from app.schemas.messages import MessageOut
from app.schemas.providers import AIProviderPublic
from app.utils.dependencies import get_current_user

router = APIRouter()


def _conversation_to_out(conv: Conversation) -> ConversationOut:
    provider_out = None
    if conv.ai_provider:
        provider_out = AIProviderPublic(
            id=conv.ai_provider.id,
            name=conv.ai_provider.name,
            provider_type=conv.ai_provider.provider_type,
            model_id=conv.ai_provider.model_id,
        )
    return ConversationOut(
        id=conv.id,
        title=conv.title,
        mode=conv.mode,
        user_id=conv.user_id,
        user_name=conv.user.name,
        ai_provider=provider_out,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
    )


@router.post("", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
def create_conversation(
    body: ConversationCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if body.ai_provider_id:
        provider = db.query(AIProvider).filter(AIProvider.id == body.ai_provider_id, AIProvider.enabled == True).first()
        if not provider:
            raise HTTPException(status_code=400, detail="AI provider not found or disabled")
    conv = Conversation(
        title=body.title or "New Conversation",
        mode=body.mode,
        user_id=user.id,
        ai_provider_id=body.ai_provider_id,
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return _conversation_to_out(conv)


@router.get("", response_model=list[ConversationOut])
def list_my_conversations(
    mode: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = db.query(Conversation).options(
        joinedload(Conversation.user),
        joinedload(Conversation.ai_provider),
    ).filter(Conversation.user_id == user.id)
    if mode:
        query = query.filter(Conversation.mode == mode)
    convs = query.order_by(Conversation.updated_at.desc()).all()
    return [_conversation_to_out(c) for c in convs]


@router.get("/group", response_model=list[ConversationOut])
def list_group_conversations(
    mode: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not user.group_id:
        return []
    query = db.query(Conversation).options(
        joinedload(Conversation.user),
        joinedload(Conversation.ai_provider),
    ).join(User).filter(
        User.group_id == user.group_id,
        Conversation.user_id != user.id,
    )
    if mode:
        query = query.filter(Conversation.mode == mode)
    convs = query.order_by(Conversation.updated_at.desc()).all()
    return [_conversation_to_out(c) for c in convs]


@router.get("/{conversation_id}", response_model=dict)
def get_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conv = db.query(Conversation).options(
        joinedload(Conversation.user),
        joinedload(Conversation.ai_provider),
        joinedload(Conversation.messages),
    ).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Allow access if own conversation or same group
    is_owner = conv.user_id == user.id
    is_same_group = user.group_id and conv.user.group_id == user.group_id
    if not is_owner and not is_same_group:
        raise HTTPException(status_code=403, detail="Access denied")

    return {
        "conversation": _conversation_to_out(conv),
        "messages": [
            MessageOut(
                id=m.id,
                conversation_id=m.conversation_id,
                role=m.role,
                text=m.text,
                image_url=m.image_url,
                message_type=m.message_type,
                image_params=m.image_params,
                created_at=m.created_at,
            )
            for m in conv.messages
        ],
        "is_owner": is_owner,
    }


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conv = db.query(Conversation).filter(Conversation.id == conversation_id, Conversation.user_id == user.id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    db.query(Message).filter(Message.conversation_id == conv.id).delete()
    db.delete(conv)
    db.commit()
