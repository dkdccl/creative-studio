import { NextResponse } from 'next/server';

import {
  generateImagePrompt,
  getStyleLabel,
  normalizeImageStyle,
} from '@/lib/image-styles';
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
    `🎨 Generating ${plans.length} illustrations in parallel (${getStyleLabel(imageStyle)})...`,
  );
  const started = Date.now();

  // 絵柄はここで足す。選んだスタイルごとに言い回しが変わる
  const prompts = plans.map((plan) =>
    generateImagePrompt(plan.description, imageStyle),
  );

  const results = await Promise.allSettled(
    prompts.map((prompt) => generateImage({ prompt, size: '1024x1024' })),
  );

  const illustrations: NovelIllustration[] = [];
  let failed = 0;

  results.forEach((result, i) => {
    const plan = plans[i];
    const image =
      result.status === 'fulfilled' ? result.value[0] : undefined;
    if (!image) {
      failed += 1;
      if (result.status === 'rejected') {
        console.error(`❌ 挿絵 ${i + 1} の生成に失敗:`, result.reason);
      }
      return;
    }
    illustrations.push({
      sceneId: scenes[plan.sceneNumber - 1].id,
      afterParagraph: plan.afterParagraph,
      imageUrl: image.url,
      prompt: prompts[i],
      caption: plan.caption,
    });
  });

  console.log(
    `✅ Generated ${illustrations.length}/${plans.length} illustrations in ${Date.now() - started}ms`,
  );

  if (illustrations.length === 0) {
    return NextResponse.json(
      { error: '挿絵の画像を生成できませんでした。' },
      { status: 502 },
    );
  }

  return NextResponse.json({
    illustrations,
    planned: plans.length,
    failed,
    imageStyle,
  });
}
