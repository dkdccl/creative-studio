import { NextResponse } from 'next/server';

import {
  generateImagePrompt,
  getStyleLabel,
  normalizeContentType,
  normalizeImageStyle,
  providerFor,
} from '@/lib/image-styles';
import { generateImageWithStabilityAI, isStabilityConfigured } from '@/lib/stability';
import {
  planIllustrationCount,
  planIllustrations,
  type SceneForPlanning,
} from '@/lib/novel-illustration';
import { generateImage, isOpenAIConfigured } from '@/lib/openai';

export const runtime = 'nodejs';

/** 画像 1 枚が長いので、並列でもそれなりに余裕をもたせる */
export const maxDuration = 300;

export interface NovelIllustration {
  sceneId: string;
  /** この段落のあとに差し込む */
  afterParagraph: number;
  imageUrl: string;
  prompt: string;
  caption: string;
}

/**
 * POST /api/novels/illustrate
 * body: { title, scenes: [{id, title, body}], count?, style? }
 * 200: { illustrations: NovelIllustration[], planned: number, failed: number }
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

  const scenes: SceneForPlanning[] = Array.isArray(body.scenes)
    ? body.scenes
        .filter((s: any) => s && typeof s.id === 'string')
        .map((s: any) => ({
          id: s.id,
          title: String(s.title ?? ''),
          body: String(s.body ?? ''),
        }))
        .filter((s: SceneForPlanning) => s.body.trim() !== '')
    : [];

  if (scenes.length === 0) {
    return NextResponse.json(
      { error: '本文が書かれたシーンがありません。' },
      { status: 400 },
    );
  }

  const totalChars = scenes.reduce(
    (sum, s) => sum + s.body.replace(/\s/g, '').length,
    0,
  );
  const requested = Math.round(Number(body.count));
  const count = Number.isFinite(requested)
    ? Math.min(Math.max(1, requested), 5)
    : planIllustrationCount(totalChars);

  const imageStyle = normalizeImageStyle(body.imageStyle);
  const contentType = normalizeContentType(body.contentType);
  const provider = providerFor(contentType);

  if (provider === 'stability' && !isStabilityConfigured) {
    return NextResponse.json(
      { error: 'STABILITY_API_KEY が未設定です。.env.local に設定してください。' },
      { status: 503 },
    );
  }

  // STEP 1: どこに何を描くかを決める（絵柄はここでは決めない）
  const plans = await planIllustrations({
    title: String(body.title ?? ''),
    scenes,
    count,
  });

  if (plans.length === 0) {
    return NextResponse.json(
      { error: '挿絵の位置を決められませんでした。もう一度お試しください。' },
      { status: 502 },
    );
  }

  // STEP 2: 画像はまとめて並列で作る（1 枚ずつ待つと枚数ぶん時間がかかる）
  console.log(
    `🎨 Generating ${plans.length} illustrations in parallel (${getStyleLabel(imageStyle)} / ${provider})...`,
  );
  const started = Date.now();

  // 絵柄はここで足す。選んだスタイルごとに言い回しが変わる
  const prompts = plans.map((plan) =>
    generateImagePrompt(plan.description, imageStyle),
  );

  /** 選ばれた API で 1 枚作り、どちらでも同じ形（data URL）で返す */
  const generateOne = async (prompt: string): Promise<string | null> => {
    if (provider === 'stability') {
      const image = await generateImageWithStabilityAI({ prompt });
      if (image.finishReason === 'CONTENT_FILTERED') {
        throw new Error('Stability AI のフィルタで内容が弾かれました。');
      }
      return image.url;
    }
    const images = await generateImage({ prompt, size: '1024x1024' });
    return images[0]?.url ?? null;
  };

  const results = await Promise.allSettled(prompts.map(generateOne));

  const illustrations: NovelIllustration[] = [];
  let failed = 0;

  const errors: string[] = [];

  results.forEach((result, i) => {
    const plan = plans[i];
    const imageUrl = result.status === 'fulfilled' ? result.value : null;
    if (!imageUrl) {
      failed += 1;
      if (result.status === 'rejected') {
        const message =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        console.error(`❌ 挿絵 ${i + 1} の生成に失敗:`, message);
        errors.push(message);
      }
      return;
    }
    illustrations.push({
      sceneId: scenes[plan.sceneNumber - 1].id,
      afterParagraph: plan.afterParagraph,
      imageUrl,
      prompt: prompts[i],
      caption: plan.caption,
    });
  });

  console.log(
    `✅ Generated ${illustrations.length}/${plans.length} illustrations in ${Date.now() - started}ms`,
  );

  if (illustrations.length === 0) {
    return NextResponse.json(
      {
        error:
          errors[0] ?? '挿絵の画像を生成できませんでした。',
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    illustrations,
    planned: plans.length,
    failed,
    imageStyle,
    contentType,
    provider,
  });
}
