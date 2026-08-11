import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { supabase } from '@/services/supabase';

interface AuthStore {
  initialized: boolean;
  session: Session | null;
  loading: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  initialized: false,
  session: null,
  loading: false,
  error: null,

  initialize: async () => {
    if (!supabase) {
      set({ initialized: true });
      return;
    }
    const { data, error } = await supabase.auth.getSession();
    set({ initialized: true, session: data.session, error: error?.message ?? null });
    supabase.auth.onAuthStateChange((_event, session) => set({ session }));
  },

  signIn: async (email, password) => {
    if (!supabase) {
      throw new Error('同期サーバーが設定されていません。');
    }
    set({ loading: true, error: null });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    set({ loading: false, error: error?.message ?? null });
    if (error) throw error;
  },

  signUp: async (email, password) => {
    if (!supabase) {
      throw new Error('同期サーバーが設定されていません。');
    }
    set({ loading: true, error: null });
    const { error } = await supabase.auth.signUp({ email, password });
    set({ loading: false, error: error?.message ?? null });
    if (error) throw error;
  },

  signOut: async () => {
    if (!supabase) return;
    set({ loading: true, error: null });
    const { error } = await supabase.auth.signOut();
    set({ loading: false, error: error?.message ?? null });
    if (error) throw error;
  },
}));
