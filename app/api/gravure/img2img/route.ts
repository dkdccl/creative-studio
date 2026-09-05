import { NextResponse } from 'next/server';

import {
  ACCEPTED_UPLOAD_TYPES,
  MAX_UPLOAD_BYTES,
  img2imgModel,
} from '@/lib/gravure';
import {
  generateImageFromImageWithProdia,
  isProdiaConfigured,
  STYLE_PRESETS,
  type ProdiaStylePreset,
} from '@/lib/prodia';

import type { GravureImage } from '../generate/route';

export const runtime = 'nodejs';
export const maxDuration = 120;

function normalizeStyle(value: unknown): ProdiaStylePreset | undefined {
  return STYLE_PRESETS.includes(value as ProdiaStylePreset)
    ? (value as ProdiaStylePreset)
    : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * POST /api/gravure/img2img
 * multipart/form-data: image=<File>, prompt, jobType?, negativePrompt?, strength?, steps?, stylePreset?, seed?
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

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: 'multipart/form-data で送ってください。' },
      { status: 400 },
    );
  }

  const image = form.get('image');
  if (!(image instanceof File)) {
    return NextResponse.json(
      { error: '参考画像が添付されていません。' },
      { status: 400 },
    );
  }
  if (!ACCEPTED_UPLOAD_TYPES.includes(image.type as (typeof ACCEPTED_UPLOAD_TYPES)[number])) {
    return NextResponse.json(
      { error: 'JPG または PNG の画像を選んでください。' },
      { status: 400 },
    );
  }
  if (image.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `参考画像が大きすぎます（${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB まで）。` },
      { status: 400 },
    );
  }

  const prompt = String(form.get('prompt') ?? '').trim();
  if (!prompt) {
    return NextResponse.json(
      { error: 'プロンプトを入力してください。' },
      { status: 400 },
    );
  }

  // 対応していない項目を送るとモデル側で弾かれるので、ここで落とす
  const model = img2imgModel(String(form.get('jobType') ?? ''));
  const negativePrompt = model.supportsNegativePrompt
    ? String(form.get('negativePrompt') ?? '')
    : undefined;
  const strength = model.supportsStrength
    ? optionalNumber(form.get('strength'))
    : undefined;

  const started = Date.now();
  console.log(`🖼️ img2img: "${prompt.slice(0, 60)}" (${model.value})`);

  try {
    const result = await generateImageFromImageWithProdia({
      image,
      prompt,
      jobType: model.value,
      negativePrompt,
      strength,
      steps: optionalNumber(form.get('steps')) ?? model.steps.default,
      stylePreset: normalizeStyle(form.get('stylePreset')),
      seed: optionalNumber(form.get('seed')),
    });

    console.log(`✅ img2img done in ${Date.now() - started}ms`);

    return NextResponse.json<GravureImage>({
      imageUrl: result.url,
      prompt,
      jobType: result.usedJobType,
      seed: result.usedSeed,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '画像を生成できませんでした。';
    console.error('❌ img2img の生成に失敗:', message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
