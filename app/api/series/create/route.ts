import { NextResponse } from 'next/server';

import { requireUser } from '../_auth';

export const runtime = 'nodejs';

/**
 * POST /api/series/create
 * body: { seriesName: string }
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if ('response' in auth) return auth.response;
  const { supabase, user } = auth;

  let body: { seriesName?: string };
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

  const { data, error } = await supabase
    .from('series')
    .insert({ user_id: user.id, series_name: seriesName })
    .select('id, series_name, created_at, updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ series: data }, { status: 201 });
}
