import { NextResponse } from 'next/server';
import { generateImage, isOpenAIConfigured } from '@/lib/openai';
import { buildMangaGenerationPrompt, clampPages } from '@/lib/scene-blocks';

export const runtime = 'nodejs';

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

  const story = body.story?.trim();
  if (!story) {
    return NextResponse.json({ error: 'ストーリーを入力してください。' }, { status: 400 });
  }

  // mood: 配列または文字列に対応
  let mood = '';
  if (Array.isArray(body.mood)) {
    mood = body.mood.filter((m: any) => m && typeof m === 'string').join(', ');
  } else if (body.mood) {
    mood = String(body.mood).trim();
  }

  if (!mood) {
    return NextResponse.json({ error: '雰囲気を選んでください。' }, { status: 400 });
  }

  const pages = clampPages(body.pages ?? 1);
  const prompt = buildMangaGenerationPrompt({ story, pages, mood });

  try {
    // 3x2 のコマ割りに合わせて横長で生成する（gpt-image 系が受け付ける横長サイズ）
    const images = await generateImage({ prompt, size: '1536x1024' });
    if (!images[0]) {
      return NextResponse.json({ error: '画像生成失敗' }, { status: 502 });
    }
    return NextResponse.json({
      url: images[0].url,
      prompt,
      revisedPrompt: images[0].revisedPrompt,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '生成失敗' }, { status: 502 });
  }
}
