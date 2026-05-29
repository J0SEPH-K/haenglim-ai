import client from './client';
import type { Message } from '../types';

export interface DocumentInfo {
  url: string;
  original_name: string;
  thumbnail_url?: string | null;
  page_count?: number | null;
}

export async function sendMessage(
  conversationId: number,
  text?: string,
  image_urls?: string[],
  ai_provider_id?: number,
  documents?: DocumentInfo[],
  model_override?: string | null,
): Promise<{ user_message: Message; assistant_message: Message }> {
  const res = await client.post(`/conversations/${conversationId}/messages`, {
    text,
    image_urls,
    ai_provider_id,
    documents,
    model_override,
  });
  return res.data;
}

export interface StreamCallbacks {
  onDelta: (text: string) => void;
  onDone: (msgs: { user_message: Message; assistant_message: Message }) => void;
  onTitle?: (title: string, conversationId: number) => void;
  onError?: (detail: string) => void;
}

/**
 * Streams an assistant reply token-by-token from the backend's NDJSON endpoint.
 * Uses fetch (not axios) because axios can't expose a ReadableStream in the browser.
 */
export async function sendMessageStream(
  conversationId: number,
  text: string | undefined,
  image_urls: string[] | undefined,
  ai_provider_id: number | undefined,
  documents: DocumentInfo[] | undefined,
  model_override: string | null | undefined,
  cb: StreamCallbacks,
): Promise<void> {
  const token = localStorage.getItem('access_token');
  const res = await fetch(`/api/conversations/${conversationId}/messages/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ text, image_urls, ai_provider_id, documents, model_override }),
  });

  if (!res.ok || !res.body) {
    let detail = '메시지 전송에 실패했습니다';
    try {
      const j = await res.json();
      detail = j.detail || detail;
    } catch { /* non-JSON error body */ }
    cb.onError?.(detail);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  // Process complete newline-delimited JSON events; keep any partial tail in `buffer`.
  const flush = (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let evt: any;
      try { evt = JSON.parse(trimmed); } catch { continue; }
      if (evt.type === 'delta') cb.onDelta(evt.text);
      else if (evt.type === 'done') cb.onDone({ user_message: evt.user_message, assistant_message: evt.assistant_message });
      else if (evt.type === 'title') cb.onTitle?.(evt.title, evt.conversation_id);
      else if (evt.type === 'error') cb.onError?.(evt.detail);
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    flush(decoder.decode(value, { stream: true }));
  }
  flush(decoder.decode());
}

export async function generateImage(
  conversationId: number,
  prompt: string,
  size?: string,
  style?: string,
  ai_enhance?: boolean,
  variations?: number,
  ai_provider_id?: number,
  model_override?: string | null,
): Promise<Message | Message[]> {
  const res = await client.post(`/conversations/${conversationId}/generate-image`, {
    prompt,
    size,
    style,
    ai_enhance,
    variations,
    ai_provider_id,
    model_override,
  });
  return res.data;
}

export async function editImage(
  conversationId: number,
  prompt: string,
  source_image_urls: string[],
  mask_image_url?: string,
  ai_enhance?: boolean
): Promise<Message> {
  const res = await client.post(`/conversations/${conversationId}/edit-image`, {
    prompt,
    source_image_urls,
    mask_image_url,
    ai_enhance,
  });
  return res.data;
}
