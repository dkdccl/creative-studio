import { NextResponse } from 'next/server';

import { isSeriesType } from '@/lib/series';

import { requireUser } from '../_auth';

export const runtime = 'nodejs';

/**
 * GET /api/series/list?type=novel|manga
 * ログイン中ユーザーのシリーズを、最新話つきで返す。
 * type を付けるとその種別だけに絞る。
 */
export async function GET(request: Request) {
  const auth = await requireUser();
  if ('response' in auth) return auth.response;
  const { supabase, user } = auth;

  const type = new URL(request.url).searchParams.get('type');
  if (type !== null && !isSeriesType(type)) {
    return NextResponse.json(
      { error: '種別は novel か manga のどちらかです。' },
      { status: 400 },
    );
  }

  let query = supabase
    .from('series')
    .select(
      'id, series_name, type, description, created_at, updated_at, novels(episode, title, status)',
    )
    .eq('user_id', user.id);

  if (type) query = query.eq('type', type);

  const { data, error } = await query.order('updated_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ series: data ?? [] });
}
