import { NextResponse } from 'next/server';

import { isOpenAIConfigured } from '@/lib/openai';
import { analyzeScene, analyzeStoryLayout } from '@/lib/scene-analysis';
import { clampPages } from '@/lib/scene-blocks';

export const runtime = 'nodejs';

/** テキストだけなので画像生成ほどは要らないが、長い話だと数十秒かかる */
export const maxDuration = 120;

/**
 * ストーリーを読んで、ページごとのコマ割り（シーン種別 + コマ数）を返す。
 *
 * pages を渡すと全ページぶんをまとめて判定し、
 * 省略すると 1 場面ぶんの判定だけを返す。
 */
export async function POST(request: Request) {
  if (!isOpenAIConfigured) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY が未設定です。' },
      { status: 503 },
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const story = typeof body.story === 'string' ? body.story.trim() : '';
  if (!story) {
    return NextResponse.json(
      { error: 'ストーリーを入力してください。' },
      { status: 400 },
    );
  }

  try {
    // ページ数の指定が無ければ 1 場面の判定として扱う
    if (body.pages === undefined || body.pages === null) {
      const analysis = await analyzeScene(story);
      return NextResponse.json({ analysis });
    }

    const pages = clampPages(Number(body.pages));
    const layout = await analyzeStoryLayout(story, pages);

    console.log(
      `🧠 AI コマ割り: ${layout
        .map((page) => `P${page.pageNumber} ${page.sceneType}/${page.panelsCount}コマ`)
        .join(', ')}`,
    );

    return NextResponse.json({ layout, totalPages: pages });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? 'コマ割りを判定できませんでした。' },
      { status: 502 },
    );
  }
}
