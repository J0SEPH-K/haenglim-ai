import { create } from 'zustand';
import type { Conversation, Message, ConversationDetail } from '../types';
import {
  listConversations,
  listGroupConversations,
  getConversation as apiGetConversation,
  createConversation as apiCreateConversation,
  deleteConversation as apiDeleteConversation,
} from '../api/conversations';

interface ConversationState {
  conversations: Conversation[];
  groupConversations: Conversation[];
  activeConversation: ConversationDetail | null;
  loading: boolean;

  fetchConversations: (mode?: string) => Promise<void>;
  fetchGroupConversations: (mode?: string) => Promise<void>;
  fetchConversation: (id: number) => Promise<void>;
  createConversation: (mode: 'chat' | 'image', providerId?: number, title?: string) => Promise<Conversation>;
  deleteConversation: (id: number) => Promise<void>;
  addMessages: (msgs: Message[]) => void;
  clearActive: () => void;
}

export const useConversationStore = create<ConversationState>((set) => ({
  conversations: [],
  groupConversations: [],
  activeConversation: null,
  loading: false,

  fetchConversations: async (mode) => {
    set({ loading: true });
    const conversations = await listConversations(mode);
    set({ conversations, loading: false });
  },

  fetchGroupConversations: async (mode) => {
    const groupConversations = await listGroupConversations(mode);
    set({ groupConversations });
  },

  fetchConversation: async (id) => {
    set({ loading: true });
    const detail = await apiGetConversation(id);
    set({ activeConversation: detail, loading: false });
  },

  createConversation: async (mode, providerId, title) => {
    const conv = await apiCreateConversation(mode, providerId, title);
    set((state) => ({ conversations: [conv, ...state.conversations] }));
    return conv;
  },

  deleteConversation: async (id) => {
    await apiDeleteConversation(id);
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== id),
      activeConversation: state.activeConversation?.conversation.id === id ? null : state.activeConversation,
    }));
  },

  addMessages: (msgs) => {
    set((state) => {
      if (!state.activeConversation) return state;
      return {
        activeConversation: {
          ...state.activeConversation,
          messages: [...state.activeConversation.messages, ...msgs],
        },
      };
    });
  },

  clearActive: () => set({ activeConversation: null }),
}));
