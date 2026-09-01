import 'server-only';

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { assertSupabaseConfig } from './config';

/**
 * サーバー側（Server Component / Route Handler）用の Supabase クライアント。
 * Cookie にセッションを保存するため next/headers を使う。
 *
 * next/headers はクライアントバンドルに含められないので、
 * ブラウザ用の lib/supabase.ts とはファイルを分けている。
 */
export function createSupabaseServerClient() {
  const { url, anonKey } = assertSupabaseConfig();
  const cookieStore = cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Server Component からは Cookie を書き込めない。
          // セッション更新は middleware / Route Handler 側で行う。
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // 同上
        }
      },
    },
  });
}

/** ログイン中のユーザーをサーバー側で取得（未ログインなら null） */
export async function getServerUser() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}
