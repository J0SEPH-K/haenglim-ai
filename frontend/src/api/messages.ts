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
