export interface User {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'user';
  group_id: number | null;
  group_name: string | null;
  is_active: boolean;
  created_at: string;
  token_limit?: number | null;
  price_limit_usd?: number | null;
}

export interface Group {
  id: number;
  name: string;
  created_at: string;
  user_count: number;
  token_limit?: number | null;
  price_limit_usd?: number | null;
}

export interface AIProvider {
  id: number;
  name: string;
  provider_type: string;
  model_id: string;
}

export interface AIProviderFull extends AIProvider {
  enabled: boolean;
  created_at: string;
  token_quota?: number | null;
  input_price_per_1m?: number | null;
  output_price_per_1m?: number | null;
}

export interface Conversation {
  id: number;
  title: string;
  mode: 'chat' | 'image';
  user_id: number;
  user_name: string;
  ai_provider: AIProvider | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: number;
  conversation_id: number;
  role: 'system' | 'user' | 'assistant';
  text: string | null;
  image_url: string | null;
  message_type: string;
  image_params: Record<string, any> | null;
  created_at: string;
}

export interface ConversationDetail {
  conversation: Conversation;
  messages: Message[];
  is_owner: boolean;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}
