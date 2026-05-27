import client from './client';
import type { AIProvider } from '../types';

export async function listAvailableProviders(): Promise<AIProvider[]> {
  const res = await client.get('/providers');
  return res.data;
}

export async function listProviderModels(providerId: number): Promise<{ id: string; name: string }[]> {
  const res = await client.get(`/providers/${providerId}/models`);
  return res.data.models;
}
