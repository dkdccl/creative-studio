import 'server-only';

import { NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';

import { createSupabaseServerClient } from '@/lib/supabase-server';

/**
 * 連載 API 共通の入口。
 * Supabase 未設定・未ログインをここで弾き、以降は user が居る前提で書ける。
 */
export async function requireUser(): Promise<
  { supabase: SupabaseClient; user: User } | { response: NextResponse }
> {
  let supabase: SupabaseClient;
  try {
    supabase = createSupabaseServerClient();
  } catch (error) {
    return {
      response: NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Supabase が設定されていません。',
        },
        { status: 503 },
      ),
    };
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return {
      response: NextResponse.json(
        { error: 'ログインが必要です。' },
        { status: 401 },
      ),
    };
  }

  return { supabase, user: data.user };
}
