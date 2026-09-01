import { NextResponse } from 'next/server';

import { requireUser } from '../_auth';

export const runtime = 'nodejs';

/**
 * GET /api/series/list
 * ログイン中ユーザーの全シリーズを、最新話つきで返す。
 */
export async function GET() {
  const auth = await requireUser();
  if ('response' in auth) return auth.response;
  const { supabase, user } = auth;

  const { data, error } = await supabase
    .from('series')
    .select('id, series_name, created_at, updated_at, novels(episode, title, status)')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ series: data ?? [] });
}
