import { NextResponse } from 'next/server';

import {
  generateImageWithProdia,
  isProdiaConfigured,
  STYLE_PRESETS,
  type ProdiaStylePreset,
} from '@/lib/prodia';

export const runtime = 'nodejs';

/** 1 枚あたりそれなりに待つので、既定の上限だと足りない */
export const maxDuration = 120;

export interface GravureImage {
  /** data URL（JPEG） */
  imageUrl: string;
  prompt: string;
  jobType: string;
  seed?: number;
}

function normalizeStyle(value: unknown): ProdiaStylePreset | undefined {
  return STYLE_PRESETS.includes(value as ProdiaStylePreset)
    ? (value as ProdiaStylePreset)
    : undefined;
}

/** 空文字や NaN を undefined に潰す */
function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * POST /api/gravure/generate
 * body: { prompt, negativePrompt?, width?, height?, steps?, guidanceScale?, stylePreset?, seed? }
 * 200: GravureImage
 * それ以外: { error: string }
 */
export async function POST(request: Request) {
  if (!isProdiaConfigured) {
    return NextResponse.json(
      {
        error:
          'PRODIA_TOKEN が未設定です。ローカルは .env.local、本番は Vercel の環境変数に設定してください。',
      },
      { status: 503 },
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const prompt = String(body.prompt ?? '').trim();
  if (!prompt) {
    return NextResponse.json(
      { error: 'プロンプトを入力してください。' },
      { status: 400 },
    );
  }

  const started = Date.now();
  console.log(`🖼️ Generating gravure image: "${prompt.slice(0, 60)}"...`);

  try {
    const image = await generateImageWithProdia({
      prompt,
      negativePrompt: String(body.negativePrompt ?? ''),
      width: optionalNumber(body.width),
      height: optionalNumber(body.height),
      steps: optionalNumber(body.steps),
      guidanceScale: optionalNumber(body.guidanceScale),
      stylePreset: normalizeStyle(body.stylePreset),
      seed: optionalNumber(body.seed),
    });

    console.log(`✅ Generated in ${Date.now() - started}ms (${image.usedJobType})`);

    return NextResponse.json<GravureImage>({
      imageUrl: image.url,
      prompt,
      jobType: image.usedJobType,
      seed: image.usedSeed,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '画像を生成できませんでした。';
    console.error('❌ グラビア画像の生成に失敗:', message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
