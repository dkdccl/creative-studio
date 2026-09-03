import { NextResponse } from 'next/server';
import { generateImage, isOpenAIConfigured } from '@/lib/openai';
import { buildMangaGenerationPrompt, clampPages } from '@/lib/scene-blocks';

export const runtime = 'nodejs';

/**
 * POST /api/manga/generate
 * body: { story: string, pages: number, mood: string | string[] }
 * 200: { url: string, prompt: string, revisedPrompt?: string }
 */
export async function POST(request: Request) {
  if (!isOpenAIConfigured) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY が未設定です。.env.local に設定してください。' },
      { status: 503 },
    );
  }

  let body: { story?: string; pages?: number; mood?: string | string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'リクエストの形式が不正です。' },
      { status: 400 },
    );
  }

  const story = body.story?.trim();
  if (!story) {
    return NextResponse.json(
      { error: 'ストーリーを入力してください。' },
      { status: 400 },
    );
  }

  // mood が配列または文字列に対応
  let mood = '';
  if (Array.isArray(body.mood)) {
    mood = body.mood
      .filter((m) => typeof m === 'string' && m.trim().length > 0)
      .map((m) => m.trim())
      .join(', ');
  } else if (typeof body.mood === 'string') {
    mood = body.mood.trim();
  }

  if (!mood) {
    return NextResponse.json(
      { error: '漫画の雰囲気を選んでください。' },
      { status: 400 },
    );
  }

  const pages = clampPages(body.pages ?? 1);
  const prompt = buildMangaGenerationPrompt({ story, pages, mood });

  try {
    const images = await generateImage({ prompt, size: '1792x1024' });
    const image = images[0];
    if (!image) {
      return NextResponse.json(
        { error: '画像を生成できませんでした。' },
        { status: 502 },
      );
    }
    return NextResponse.json({
      url: image.url,
      prompt,
      revisedPrompt: image.revisedPrompt,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '画像生成に失敗しました。';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
