import { NextResponse } from 'next/server';

import { generateText, isOpenAIConfigured } from '@/lib/openai-client';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** 長すぎる入力は弾く。プロンプト 1 本ぶんに収まる長さ */
const MAX_INPUT = 2000;

const SYSTEM = [
  'You turn a Japanese description into an English prompt for an image generation model.',
  '',
  'Rules:',
  '- Output only the prompt. No quotes, no explanation, no line breaks.',
  '- Use short comma-separated phrases, not full sentences.',
  '- Keep every element the user wrote. Do not add subjects, poses or settings they did not ask for.',
  '- If the input is already English, return it unchanged apart from tidying the wording.',
].join('\n');

/**
 * POST /api/gravure/translate-prompt
 * body: { text: string }
 *
 * 日本語で書いた指示を、画像生成に渡せる英語のプロンプトに直す。
 *
 * 画像モデルは英語のほうが安定するが、毎回英語で書くのは手間なので、
 * 書いたものをここで置き換える。勝手に足さないよう、system で
 * 「書かれていない要素を加えない」と縛っている。
 */
export async function POST(request: Request) {
  if (!isOpenAIConfigured) {
    return NextResponse.json(
      {
        error:
          'OPENAI_API_KEY が未設定です。ローカルは .env.local、本番は Vercel の環境変数に設定してください。',
      },
      { status: 503 },
    );
  }

  let body: { text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'リクエストの形式が不正です。' },
      { status: 400 },
    );
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json(
      { error: '変換する文章を入力してください。' },
      { status: 400 },
    );
  }
  if (text.length > MAX_INPUT) {
    return NextResponse.json(
      { error: `長すぎます（${MAX_INPUT} 文字まで）。` },
      { status: 400 },
    );
  }

  try {
    const prompt = await generateText({ system: SYSTEM, user: text });
    if (!prompt) {
      return NextResponse.json(
        { error: '変換できませんでした。もう一度試してください。' },
        { status: 502 },
      );
    }
    // 念のため改行を潰す。プロンプトは 1 行で扱う
    return NextResponse.json({ prompt: prompt.replace(/\s*\n+\s*/g, ' ').trim() });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : '変換に失敗しました。',
      },
      { status: 500 },
    );
  }
}
