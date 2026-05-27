// Curated "broad family" models the user can pick from the ModelSelector.
//
// The backend intentionally supports any model the provider's API returns, but
// surfacing that whole list to end users is confusing (deprecated models,
// embedding-only models, etc.) and undermines the adaptive-routing design:
// we want the user to pick a family like "GPT-4o" or "Claude Sonnet", and
// let the backend swap to a search-capable sibling when needed.
//
// Keep entries here short and readable. `id` must match an ID that the provider
// will actually accept; the backend falls back to DEFAULT_CHAT_MODEL /
// DEFAULT_IMAGE_MODEL when nothing is picked.

export type CuratedModel = { id: string; name: string };

export const CHAT_MODELS: Record<string, CuratedModel[]> = {
  openai: [
    { id: 'gpt-5', name: 'GPT-5' },
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4', name: 'GPT-4' },
    { id: 'gpt-4o-mini', name: 'GPT-4o mini (빠름)' },
  ],
  anthropic: [
    { id: 'claude-opus-4-0', name: 'Claude Opus 4' },
    { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4' },
    { id: 'claude-3-5-haiku-latest', name: 'Claude Haiku 3.5 (빠름)' },
  ],
  gemini: [
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (빠름)' },
  ],
  groq: [
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' },
  ],
};

export const IMAGE_MODELS: Record<string, CuratedModel[]> = {
  openai: [
    { id: 'gpt-image-1', name: 'GPT Image' },
    { id: 'dall-e-3', name: 'DALL·E 3' },
  ],
  gemini: [
    { id: 'imagen-4.0-generate-001', name: 'Imagen 4' },
    { id: 'gemini-2.5-flash-image-preview', name: 'Nano Banana' },
  ],
};

export function getCuratedModels(providerType: string, mode: 'chat' | 'image'): CuratedModel[] {
  const table = mode === 'image' ? IMAGE_MODELS : CHAT_MODELS;
  return table[providerType] || [];
}
