import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

import { assertSupabaseConfig, config } from './config';

/**
 * ブラウザ側（Client Component）用の Supabase クライアント。
 *
 * 環境変数が未設定でもアプリ自体は起動できるよう、
 * モジュール読み込み時ではなく呼び出し時に生成・検証している。
 * サーバー側（Server Component / Route Handler）は lib/supabase-server.ts を使う。
 */

export { isSupabaseConfigured } from './config';

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  const { url, anonKey } = assertSupabaseConfig();
  if (!browserClient) {
    browserClient = createBrowserClient(url, anonKey);
  }
  return browserClient;
}

// ---------------------------------------------------------------
// 認証ヘルパー（クライアント側）
// ---------------------------------------------------------------

/** メールアドレス + パスワードで新規登録 */
export async function signUpWithEmail(email: string, password: string) {
  const supabase = getSupabaseBrowserClient();
  return supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${config.siteUrl}/auth/callback`,
    },
  });
}

/** メールアドレス + パスワードでログイン */
export async function signInWithEmail(email: string, password: string) {
  const supabase = getSupabaseBrowserClient();
  return supabase.auth.signInWithPassword({ email, password });
}

/** ログアウト */
export async function signOut() {
  const supabase = getSupabaseBrowserClient();
  return supabase.auth.signOut();
}

/** 現在ログイン中のユーザー（未ログインなら null） */
export async function getCurrentUser() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}
