from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import AIProvider, User
from app.schemas.providers import AIProviderPublic
from app.utils.dependencies import get_current_user
from app.utils.encryption import decrypt_api_key

router = APIRouter()


@router.get("", response_model=list[AIProviderPublic])
def list_available_providers(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    providers = db.query(AIProvider).filter(AIProvider.enabled == True).order_by(AIProvider.name).all()
    return [
        AIProviderPublic(id=p.id, name=p.name, provider_type=p.provider_type, model_id=p.model_id)
        for p in providers
    ]


@router.get("/{provider_id}/models")
async def list_provider_models(provider_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """List all available models for a provider using its stored API key."""
    provider = db.query(AIProvider).filter(AIProvider.id == provider_id, AIProvider.enabled == True).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    api_key = decrypt_api_key(provider.api_key_encrypted)

    # Reuse the admin list-models logic
    from app.routers.admin import _fetch_openai_models, _fetch_anthropic_models, _fetch_gemini_models, _fetch_groq_models

    try:
        if provider.provider_type == "openai":
            models = await _fetch_openai_models(api_key)
        elif provider.provider_type == "anthropic":
            models = await _fetch_anthropic_models(api_key)
        elif provider.provider_type == "gemini":
            models = await _fetch_gemini_models(api_key)
        elif provider.provider_type == "groq":
            models = await _fetch_groq_models(api_key)
        else:
            models = []
    except Exception:
        models = []

    return {"models": models}
