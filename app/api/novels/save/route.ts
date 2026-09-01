import { NextResponse } from 'next/server';

import { requireUser } from '../../series/_auth';

export const runtime = 'nodejs';

interface SaveBody {
  seriesId?: string;
  episode?: number;
  title?: string;
  content?: string;
  summary?: string;
  ending?: string;
  characters?: { name: string; role: string; description: string }[];
  status?: 'draft' | 'editing' | 'done';
}

/**
 * POST /api/novels/save
 * 連載情報つきで 1 話を保存する（同じ series_id + episode があれば上書き）。
 */
export async function POST(request: Request) {
  const auth = await requireUser();
  if ('response' in auth) return auth.response;
  const { supabase, user } = auth;

  let body: SaveBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'リクエストの形式が不正です。' },
      { status: 400 },
    );
  }

  if (!body.seriesId) {
    return NextResponse.json(
      { error: 'シリーズを指定してください。' },
      { status: 400 },
    );
  }

  const episode = Math.max(1, Math.round(body.episode ?? 1));

  const { data, error } = await supabase
    .from('novels')
    .upsert(
      {
        series_id: body.seriesId,
        user_id: user.id,
        episode,
        title: body.title ?? '',
        content: body.content ?? '',
        summary: body.summary ?? '',
        ending: body.ending ?? '',
        characters: body.characters ?? [],
        status: body.status ?? 'draft',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'series_id,episode' },
    )
    .select('id, series_id, episode, title, status, updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ novel: data });
}
