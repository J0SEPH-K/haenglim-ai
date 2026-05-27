import client from './client';
import type { User, Group, AIProviderFull } from '../types';

// Users
export async function listUsers(groupId?: number): Promise<User[]> {
  const params = groupId ? { group_id: groupId } : {};
  const res = await client.get('/admin/users', { params });
  return res.data;
}

export async function createUser(data: {
  email: string;
  password: string;
  name: string;
  role?: string;
  group_id?: number;
  token_limit?: number | null;
  price_limit_usd?: number | null;
}): Promise<User> {
  const res = await client.post('/admin/users', data);
  return res.data;
}

export async function updateUser(
  id: number,
  data: Partial<{
    name: string;
    password: string;
    role: string;
    group_id: number;
    is_active: boolean;
    token_limit: number | null;
    price_limit_usd: number | null;
  }>
): Promise<User> {
  const res = await client.put(`/admin/users/${id}`, data);
  return res.data;
}

export async function deleteUser(id: number): Promise<void> {
  await client.delete(`/admin/users/${id}`);
}

export interface BulkCsvResult {
  created: number;
  errors: { line: number; email: string; error: string }[];
}

export async function bulkCreateUsersCsv(file: File): Promise<BulkCsvResult> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await client.post('/admin/users/bulk-csv', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

// IP allowlist
export interface IPAllowlistEntry {
  id: number;
  cidr: string;
  label: string | null;
  enabled: boolean;
  created_at: string;
}

export interface IPAllowlistResponse {
  settings: { ip_restriction_enabled: boolean };
  entries: IPAllowlistEntry[];
  your_ip: string | null;
}

export async function getIpAllowlist(): Promise<IPAllowlistResponse> {
  const res = await client.get('/admin/ip-allowlist');
  return res.data;
}

export async function updateIpRestrictionEnabled(enabled: boolean): Promise<{ ip_restriction_enabled: boolean }> {
  const res = await client.put('/admin/ip-allowlist/settings', { ip_restriction_enabled: enabled });
  return res.data;
}

export async function createIpAllowlistEntry(data: { cidr: string; label?: string | null; enabled?: boolean }): Promise<IPAllowlistEntry> {
  const res = await client.post('/admin/ip-allowlist', data);
  return res.data;
}

export async function updateIpAllowlistEntry(
  id: number,
  data: Partial<{ cidr: string; label: string | null; enabled: boolean }>,
): Promise<IPAllowlistEntry> {
  const res = await client.put(`/admin/ip-allowlist/${id}`, data);
  return res.data;
}

export async function deleteIpAllowlistEntry(id: number): Promise<void> {
  await client.delete(`/admin/ip-allowlist/${id}`);
}

// Groups
export async function listGroups(): Promise<Group[]> {
  const res = await client.get('/admin/groups');
  return res.data;
}

export async function createGroup(
  name: string,
  extras?: { token_limit?: number | null; price_limit_usd?: number | null },
): Promise<Group> {
  const res = await client.post('/admin/groups', { name, ...(extras || {}) });
  return res.data;
}

export async function updateGroup(
  id: number,
  data: { name?: string; token_limit?: number | null; price_limit_usd?: number | null },
): Promise<Group> {
  const res = await client.put(`/admin/groups/${id}`, data);
  return res.data;
}

export async function deleteGroup(id: number): Promise<void> {
  await client.delete(`/admin/groups/${id}`);
}

// Providers
export async function listProviders(): Promise<AIProviderFull[]> {
  const res = await client.get('/admin/providers');
  return res.data;
}

export async function createProvider(data: {
  name: string;
  provider_type: string;
  api_key: string;
  enabled?: boolean;
  token_quota?: number | null;
  input_price_per_1m?: number | null;
  output_price_per_1m?: number | null;
}): Promise<AIProviderFull> {
  const res = await client.post('/admin/providers', data);
  return res.data;
}

export async function updateProvider(
  id: number,
  data: Partial<{
    name: string;
    api_key: string;
    enabled: boolean;
    token_quota: number | null;
    input_price_per_1m: number | null;
    output_price_per_1m: number | null;
  }>
): Promise<AIProviderFull> {
  const res = await client.put(`/admin/providers/${id}`, data);
  return res.data;
}

export async function deleteProvider(id: number): Promise<void> {
  await client.delete(`/admin/providers/${id}`);
}

export async function fetchModels(provider_type: string, api_key: string): Promise<{ id: string; name: string }[]> {
  const res = await client.post('/admin/providers/list-models', { provider_type, api_key });
  return res.data.models;
}

// Dashboard
export interface DashboardTimelineRow {
  date: string;
  provider_id: number | null;
  provider_name: string;
  model_id: string | null;
  group_id: number | null;
  group_name: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  message_count: number;
  cost_usd: number | null;
}

export interface DashboardProvider {
  id: number;
  name: string;
  provider_type: string;
  model_id: string;
  enabled: boolean;
  token_quota: number | null;
  tokens_used: number;
  tokens_remaining: number | null;
  percent_used: number | null;
  input_price_per_1m: number | null;
  output_price_per_1m: number | null;
  price_source: 'override' | 'default' | 'unknown';
  cost_usd: number | null;
  input_price_override: number | null;
  output_price_override: number | null;
}

export interface DashboardSummary {
  window_days: number;
  window_prompt_tokens: number;
  window_completion_tokens: number;
  window_total_tokens: number;
  window_assistant_messages: number;
  window_cost_usd: number | null;
  today_total_tokens: number;
  today_assistant_messages: number;
  today_cost_usd: number | null;
  active_users_in_window: number;
  total_conversations: number;
  top_groups: { group_id: number | null; group_name: string; total_tokens: number }[];
}

export interface DashboardGroupUsage {
  group_id: number;
  group_name: string;
  tokens_used: number;
  cost_usd: number | null;
  token_limit: number | null;
  price_limit_usd: number | null;
  token_percent: number | null;
  price_percent: number | null;
}

export interface DashboardUserUsage {
  user_id: number;
  name: string;
  email: string;
  group_id: number | null;
  group_name: string | null;
  tokens_used: number;
  cost_usd: number | null;
  token_limit: number | null;
  price_limit_usd: number | null;
  token_percent: number | null;
  price_percent: number | null;
}

export interface DashboardResponse {
  window_start: string;
  window_end: string;
  timeline: DashboardTimelineRow[];
  providers: DashboardProvider[];
  groups: DashboardGroupUsage[];
  users: DashboardUserUsage[];
  summary: DashboardSummary;
}

export async function getDashboard(days = 30): Promise<DashboardResponse> {
  const res = await client.get('/admin/dashboard', { params: { days } });
  return res.data;
}
