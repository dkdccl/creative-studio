import { NextResponse } from 'next/server';
import { generateAllDialoguesWithGPT55 } from '@/lib/gpt55-dialogues';
import { generateImage, isOpenAIConfigured } from '@/lib/openai';
import {
  buildMangaGenerationPrompt,
  clampPages,
  getGridLayout,
  normalizePanelCount,
  type PageConfig,
  type PanelCount,
} from '@/lib/scene-blocks';

export const runtime = 'nodejs';

/** 画像 1 枚あたりが長いので、まとめて生成するときのために伸ばしておく */
export const maxDuration = 300;

/** レート制限に当たらないよう、ページごとに少し待つ */
const PAGE_INTERVAL_MS = 1000;

export interface MangaPageResult {
  pageNumber: number;
  panelsCount: PanelCount;
  imageUrl: string;
  prompt: string;
  revisedPrompt?: string;
  /** コマ順のセリフ。gpt-5.5 での生成を使ったときだけ入る */
  dialogues?: string[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** リクエストの pageConfigs を、ページ番号 → コマ数 の対応に整える */
function readPageConfigs(raw: unknown, totalPages: number): PageConfig[] {
  const list = Array.isArray(raw) ? raw : [];
  return Array.from({ length: totalPages }, (_, i) => {
    const pageNumber = i + 1;
    const found = list.find(
      (c: any) => Math.round(Number(c?.pageNumber)) === pageNumber,
    );
    return {
      pageNumber,
      panelsCount: normalizePanelCount((found as any)?.panelsCount),
    };
  });
}

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

  const totalPages = clampPages(body.pages ?? 1);
  const language =
    typeof body.language === 'string' && body.language.trim()
      ? body.language.trim()
      : undefined;

  const configs = readPageConfigs(body.pageConfigs, totalPages);

  // pageNumber が来たらそのページだけを生成する。
  // クライアントが 1 ページずつ呼んで進捗を出せるようにするための入口で、
  // 省略時は下のループで全ページをまとめて生成する。
  const single =
    body.pageNumber === undefined || body.pageNumber === null
      ? null
      : Math.min(Math.max(1, Math.round(Number(body.pageNumber)) || 1), totalPages);

  const from = single ?? 1;
  const to = single ?? totalPages;

  // ページごとに呼ばれても全体の構成が分かるようにしておく
  console.log(
    `📊 Panel configuration: ${configs.map((c) => c.panelsCount).join(', ')} コマ`,
  );

  // STEP 1: セリフを先に作る。画像より速く、失敗しても空で返るので絵の生成は止めない
  const useGPT55 = body.useGPT55 !== false;
  const targetConfigs = configs.slice(from - 1, to);
  let allDialogues: string[][] = [];

  if (useGPT55) {
    console.log(`📝 STEP 1: Generate dialogues with gpt-5.5...`);
    try {
      allDialogues = await generateAllDialoguesWithGPT55(
        targetConfigs,
        story,
        totalPages,
        mood,
      );
    } catch (error) {
      console.error('⚠️  gpt-5.5 failed:', error);
      allDialogues = targetConfigs.map((c) => Array(c.panelsCount).fill(''));
    }
  }

  const pages: MangaPageResult[] = [];

  for (let pageNum = from; pageNum <= to; pageNum += 1) {
    const pageConfig = configs.find((c) => c.pageNumber === pageNum);
    const panelsCount = pageConfig?.panelsCount ?? 6;

    console.log(
      `🎨 ページ ${pageNum}/${totalPages}: ${panelsCount}コマ (${
        getGridLayout(panelsCount).label
      }) を生成中…`,
    );

    const dialogues = allDialogues[pageNum - from] ?? [];
    const hasDialogues = dialogues.some((d) => d.trim() !== '');

    // ページごとにプロンプトを組み直す。同じプロンプトを使い回すと
    // どのページも同じ場面・同じコマ数になってしまう。
    // セリフを重ねる場合は、画像側には文字を描かせない
    const prompt = buildMangaGenerationPrompt({
      story,
      pageNumber: pageNum,
      totalPages,
      panelsCount,
      mood,
      language,
      withoutText: hasDialogues,
    });

    try {
      // コマ割りに合わせて横長で生成する（gpt-image 系が受け付ける横長サイズ）
      const images = await generateImage({ prompt, size: '1536x1024' });
      const image = images[0];
      if (!image) {
        throw new Error(`${pageNum}ページ目の画像を生成できませんでした。`);
      }
      pages.push({
        pageNumber: pageNum,
        panelsCount,
        imageUrl: image.url,
        prompt,
        revisedPrompt: image.revisedPrompt,
        dialogues: hasDialogues ? dialogues : undefined,
      });
    } catch (error: any) {
      const message = error?.message || `${pageNum}ページ目の生成に失敗しました。`;
      // 1 枚も作れていないときだけエラーにする。
      // 途中まで出来ていれば、それは返したうえで失敗も伝える
      if (pages.length === 0) {
        return NextResponse.json({ error: message }, { status: 502 });
      }
      return NextResponse.json({
        pages,
        totalPages,
        url: pages[0].imageUrl,
        prompt: pages[0].prompt,
        error: message,
      });
    }

    if (pageNum < to) {
      await sleep(PAGE_INTERVAL_MS);
    }
  }

  return NextResponse.json({
    pages,
    totalPages,
    // 1 枚だけを見る呼び出し元（小説モードの挿入モーダル）向けの互換フィールド
    url: pages[0].imageUrl,
    prompt: pages[0].prompt,
    revisedPrompt: pages[0].revisedPrompt,
  });
}
