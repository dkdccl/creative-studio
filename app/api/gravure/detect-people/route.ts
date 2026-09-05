import { NextResponse } from 'next/server';

import { inspectImage, isOpenAIConfigured } from '@/lib/openai';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** 1 回で見る枚数の上限。1 枚につき 1 回 API を叩くので歯止めを入れる */
const MAX_IMAGES = 50;

export interface DetectResult {
  index: number;
  hasPerson: boolean;
  /** 複数コマを 1 枚にまとめた絵になっていないか */
  isCollage: boolean;
  /** 判定できなかった場合の理由 */
  error?: string;
}

/**
 * POST /api/gravure/detect-people
 * multipart/form-data: images=<File>（複数可）, indexes=<通し番号>（画像と同じ順）
 * 200: { results: DetectResult[] }
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

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: 'multipart/form-data で送ってください。' },
      { status: 400 },
    );
  }

  const files = form.getAll('images').filter((item): item is File => item instanceof File);
  const indexes = form.getAll('indexes').map((value) => Number(value));

  if (files.length === 0) {
    return NextResponse.json({ error: '画像が添付されていません。' }, { status: 400 });
  }
  if (files.length > MAX_IMAGES) {
    return NextResponse.json(
      { error: `一度に判定できるのは ${MAX_IMAGES} 枚までです。` },
      { status: 400 },
    );
  }

  const started = Date.now();
  console.log(`🔍 人物判定: ${files.length} 枚`);

  // 1 枚ずつ独立しているので並列で投げる。1 枚失敗しても他は返す
  const settled = await Promise.allSettled(
    files.map(async (file) => {
      const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
      const mime = file.type || 'image/jpeg';
      return inspectImage(`data:${mime};base64,${base64}`);
    }),
  );

  const results: DetectResult[] = settled.map((outcome, i) => {
    const index = Number.isFinite(indexes[i]) ? indexes[i] : i + 1;
    if (outcome.status === 'fulfilled') {
      return { index, ...outcome.value };
    }
    const message =
      outcome.reason instanceof Error ? outcome.reason.message : '判定に失敗しました';
    console.error(`❌ ${index} 枚目の判定に失敗:`, message);
    // 判定できなかったものは残す（黙って捨てないため）
    return { index, hasPerson: true, isCollage: false, error: message };
  });

  console.log(
    `✅ 人物判定 ${results.length} 枚を ${Date.now() - started}ms（人物なし ${
      results.filter((r) => !r.hasPerson).length
    } 枚 / グリッド合成 ${results.filter((r) => r.isCollage).length} 枚）`,
  );

  return NextResponse.json({ results });
}
