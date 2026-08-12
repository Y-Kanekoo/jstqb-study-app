import type { Session } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from './auth-store';

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  deleteCurrentUser: vi.fn(),
}));

vi.mock('@/services/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
    },
    rpc: mocks.deleteCurrentUser,
  },
}));

describe('P0アカウント削除境界', () => {
  beforeEach(() => {
    mocks.signInWithPassword.mockReset();
    mocks.signOut.mockReset();
    mocks.deleteCurrentUser.mockReset();
    useAuthStore.setState({
      session: { user: { email: 'user@example.invalid' } } as unknown as Session,
      loading: false,
      error: null,
    });
  });

  it('再認証後にサーバー削除し、永続auth tokenをlocal signOutする', async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: null });
    mocks.deleteCurrentUser.mockResolvedValue({ error: null });
    mocks.signOut.mockResolvedValue({ error: null });

    const result = await useAuthStore.getState().deleteAccount('password');

    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: 'user@example.invalid', password: 'password' });
    expect(mocks.deleteCurrentUser).toHaveBeenCalledWith('delete_current_user');
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(result).toEqual({ serverDeleted: true, authCleared: true });
    expect(useAuthStore.getState().session).toBeNull();
  });

  it('サーバー削除後のlocal signOut失敗を部分成功として返す', async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: null });
    mocks.deleteCurrentUser.mockResolvedValue({ error: null });
    mocks.signOut.mockResolvedValue({ error: new Error('local signOut failed') });

    const result = await useAuthStore.getState().deleteAccount('password');

    expect(result).toEqual({ serverDeleted: true, authCleared: false });
    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().error).toBe('local signOut failed');
  });
});
