import { NextResponse } from 'next/server';

import { isSeriesType } from '@/lib/series';

import { requireUser } from '../_auth';

export const runtime = 'nodejs';

/**
 * POST /api/series/create
 * body: { seriesName: string, type?: 'novel' | 'manga', description?: string }
 *
 * type は省略すると小説として作る（種別を足す前に作られたものに合わせる）。
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if ('response' in auth) return auth.response;
  const { supabase, user } = auth;

  let body: { seriesName?: string; type?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'リクエストの形式が不正です。' },
      { status: 400 },
    );
  }

  const seriesName = body.seriesName?.trim();
  if (!seriesName) {
    return NextResponse.json(
      { error: 'シリーズ名を入力してください。' },
      { status: 400 },
    );
  }

  const type = body.type ?? 'novel';
  if (!isSeriesType(type)) {
    return NextResponse.json(
      { error: '種別は novel か manga のどちらかです。' },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from('series')
    .insert({
      user_id: user.id,
      series_name: seriesName,
      type,
      description: body.description?.trim() ?? '',
    })
    .select('id, series_name, type, description, created_at, updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ series: data }, { status: 201 });
}
