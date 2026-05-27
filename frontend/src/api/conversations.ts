import client from './client';
import type { Conversation, ConversationDetail } from '../types';

export async function createConversation(
  mode: 'chat' | 'image',
  ai_provider_id?: number,
  title?: string
): Promise<Conversation> {
  const res = await client.post('/conversations', { ai_provider_id, mode, title });
  return res.data;
}

export async function listConversations(mode?: string): Promise<Conversation[]> {
  const params = mode ? { mode } : {};
  const res = await client.get('/conversations', { params });
  return res.data;
}

export async function listGroupConversations(mode?: string): Promise<Conversation[]> {
  const params = mode ? { mode } : {};
  const res = await client.get('/conversations/group', { params });
  return res.data;
}

export async function getConversation(id: number): Promise<ConversationDetail> {
  const res = await client.get(`/conversations/${id}`);
  return res.data;
}

export async function deleteConversation(id: number): Promise<void> {
  await client.delete(`/conversations/${id}`);
}
