from app.models.models import AIProvider
from app.services.ai.base import AIAdapter
from app.services.ai.openai_adapter import OpenAIAdapter
from app.services.ai.anthropic_adapter import AnthropicAdapter
from app.services.ai.gemini_adapter import GeminiAdapter
from app.services.ai.groq_adapter import GroqAdapter
from app.utils.encryption import decrypt_api_key


def get_adapter(provider: AIProvider) -> AIAdapter:
    api_key = decrypt_api_key(provider.api_key_encrypted)
    match provider.provider_type:
        case "openai":
            return OpenAIAdapter(api_key)
        case "anthropic":
            return AnthropicAdapter(api_key)
        case "gemini":
            return GeminiAdapter(api_key)
        case "groq":
            return GroqAdapter(api_key)
        case _:
            raise ValueError(f"Unknown provider type: {provider.provider_type}")
