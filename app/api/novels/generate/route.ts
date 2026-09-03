import { NextResponse } from 'next/server';

import {
  NOVEL_SYSTEM_PROMPT,
  buildNovelScenePrompt,
  clampNovelChars,
} from '@/lib/novel-prompt';
import { generateText, isOpenAIConfigured } from '@/lib/openai';
import { createEmptyNovelProject, type Character } from '@/lib/types';

export const runtime = 'nodejs';

/**
 * POST /api/novels/generate
 * body: { theme, sceneTitle, sceneSummary, characters, previousBody, chars }
 * 200: { text: string, prompt: string }
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

  const sceneTitle = String(body.sceneTitle ?? '').trim();
  const sceneSummary = String(body.sceneSummary ?? '').trim();
  if (!sceneTitle && !sceneSummary) {
    return NextResponse.json(
      { error: 'シーンのタイトルかあらすじを入力してください。' },
      { status: 400 },
    );
  }

  // theme は欠けていても既定値で埋めて動かす（Step 1 が未入力でも書き出せるように）
  const theme = { ...createEmptyNovelProject().theme, ...(body.theme ?? {}) };
  const characters: Character[] = Array.isArray(body.characters)
    ? body.characters.filter((c: unknown) => c && typeof c === 'object')
    : [];

  const chars = clampNovelChars(Number(body.chars) || 800);
  const previousBody =
    typeof body.previousBody === 'string' ? body.previousBody : undefined;

  const prompt = buildNovelScenePrompt({
    theme,
    sceneTitle,
    sceneSummary,
    characters,
    previousBody,
    chars,
  });

  try {
    const text = await generateText({
      system: NOVEL_SYSTEM_PROMPT,
      user: prompt,
    });
    if (!text) {
      return NextResponse.json(
        { error: '本文を生成できませんでした。' },
        { status: 502 },
      );
    }
    return NextResponse.json({ text, prompt });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '生成に失敗しました。' },
      { status: 502 },
    );
  }
}
