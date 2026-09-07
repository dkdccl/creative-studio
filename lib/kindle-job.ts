import {
  BATCH_INTERVAL_MS,
  DEFAULT_BATCH_SIZE,
  DEFAULT_BOOK_PAGES,
  KINDLE_DPI,
  KINDLE_PAGE_HEIGHT_PX,
  KINDLE_PAGE_WIDTH_PX,
  MAX_PAGE_ATTEMPTS,
  countPages,
  formatBytes,
  formatElapsed,
  pageFileName,
  type BookJobState,
  type BookLogEvent,
  type BookPageState,
  type ImageBackend,
} from '@/lib/kindle-book';
import { generatePageImage } from '@/lib/image-processor';
import { planMangaPages } from '@/lib/openai-client';
import { buildKindlePdf } from '@/lib/pdf-generator';
import {
  ensureBookDirs,
  hasPageImage,
  pageFile,
  readJobState,
  resolveBookPaths,
  savePageImage,
  writeJobState,
  type BookPaths,
} from '@/lib/kindle-workspace';
import {
  buildMangaGenerationPrompt,
  clampBookPages,
  getGridLayout,
  splitStoryByPages,
} from '@/lib/scene-blocks';

/**
 * 単行本 1 冊ぶんの生成。
 *
 * 120 ページを一息に作ると数十分〜数時間かかるので、
 * ページ 1 枚ごとに metadata.json へ書き出しながら進む。
 * 途中で Ctrl+C を押しても、同じコマンドをもう一度実行すれば
 * 出来ているページは飛ばして続きから再開する。
 *
 * 呼ぶのは scripts/generate-manga.ts（CLI）だけ。
 */

// ---------------------------------------------------------------
// 中断
// ---------------------------------------------------------------

let cancelRequested = false;

/** Ctrl+C を受けたときに呼ぶ。今のページを描き終えてから止まる */
export function requestCancel(): void {
  cancelRequested = true;
}

export function isCancelRequested(): boolean {
  return cancelRequested;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------
// コンソール出力
// ---------------------------------------------------------------

/** 進捗の伝え方。CLI が受け取ってコンソールに出す */
export interface JobReporter {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  /** バッチの開始 */
  batch(index: number, total: number, from: number, to: number): void;
  /** ページ 1 枚が終わったとき */
  page(pageNumber: number, total: number, state: BookPageState): void;
}

/** ログに 1 行足す。増えすぎないよう直近だけ残す */
function record(
  state: BookJobState,
  level: BookLogEvent['level'],
  message: string,
): void {
  state.events.push({ at: new Date().toISOString(), level, message });
  if (state.events.length > 1000) {
    state.events = state.events.slice(-1000);
  }
}

// ---------------------------------------------------------------
// ページ画像
// ---------------------------------------------------------------

/** 1 ページぶんの画像を作って保存する。失敗したら投げる */
async function generateAndSavePage(
  paths: BookPaths,
  state: BookJobState,
  page: BookPageState,
): Promise<void> {
  const prompt = buildMangaGenerationPrompt({
    story: state.story,
    pageNumber: page.pageNumber,
    totalPages: state.totalPages,
    panelsCount: page.panelsCount,
    mood: state.mood,
    sceneType: page.sceneType,
    orientation: 'portrait',
    segment: page.segment,
    // セリフは PDF 側で吹き出しに描くので、絵には文字を入れさせない
    withoutText: true,
  });

  const bytes = await generatePageImage({
    backend: state.backend,
    prompt,
    page,
  });

  await savePageImage(paths, page.pageNumber, bytes);
}

// ---------------------------------------------------------------
// ジョブの用意
// ---------------------------------------------------------------

export interface BookJobOptions {
  story: string;
  title: string;
  mood: string;
  totalPages?: number;
  batchSize?: number;
  /** 絵をどこで作るか。既定は huggingface */
  backend?: ImageBackend;
  /** 前回の続きを使わず、最初から作り直す */
  fresh?: boolean;
  /** 置き場所を差し替えたいとき（既定は ~/creative-studio-workspace/manga） */
  baseDir?: string;
}

/**
 * 前回の状態があれば読み、無ければストーリーを分割して新しく作る。
 * 出力先やページ数が変わっていたら、混ざらないよう作り直す。
 */
async function prepareState(
  paths: BookPaths,
  options: BookJobOptions,
  reporter: JobReporter,
): Promise<BookJobState> {
  const pages = clampBookPages(options.totalPages ?? DEFAULT_BOOK_PAGES);
  const existing = options.fresh ? null : await readJobState(paths);

  if (existing) {
    const sameShape =
      existing.totalPages === pages &&
      existing.story === options.story.trim() &&
      existing.backend === (options.backend ?? 'huggingface');

    if (sameShape) {
      const counts = countPages(existing);
      reporter.info(
        `前回の続きから再開します（${counts.done}/${pages} ページ完成済み）`,
      );
      existing.status = existing.status === 'done' ? 'done' : 'generating';
      existing.error = undefined;
      return existing;
    }
    reporter.warn('前回とストーリーか設定が違うので、最初から作り直します。');
  }

  const segments = splitStoryByPages(options.story, pages);
  const now = new Date().toISOString();

  const state: BookJobState = {
    format: 'kindle',
    title: options.title.trim() || '無題',
    story: options.story.trim(),
    mood: options.mood,
    totalPages: pages,
    batchSize: Math.max(1, Math.round(options.batchSize ?? DEFAULT_BATCH_SIZE)),
    backend: options.backend ?? 'huggingface',
    status: 'analyzing',
    createdAt: now,
    updatedAt: now,
    page: {
      widthPx: KINDLE_PAGE_WIDTH_PX,
      heightPx: KINDLE_PAGE_HEIGHT_PX,
      dpi: KINDLE_DPI,
    },
    pages: segments.map((segment, i) => ({
      pageNumber: i + 1,
      // 判定前の仮置き。この後 AI が上書きする
      panelsCount: 6,
      segment,
      status: 'pending',
      attempts: 0,
    })),
    events: [],
  };

  record(state, 'info', `全 ${pages} ページに分割しました。`);
  reporter.info(`ストーリー分割完了: ${pages}ページ`);
  await writeJobState(paths, state);
  return state;
}

/**
 * バッチ単位でネーム（場面・コマ割り・セリフ）を作る。
 *
 * 120 ページを一度に頼むと応答が壊れるので、10 ページずつ区切って作り、
 * 直前のページの流れを渡して話を繋げる。
 */
async function planPages(
  paths: BookPaths,
  state: BookJobState,
  reporter: JobReporter,
): Promise<void> {
  const total = Math.ceil(state.totalPages / state.batchSize);

  for (let from = 1; from <= state.totalPages; from += state.batchSize) {
    if (cancelRequested) return;
    const to = Math.min(state.totalPages, from + state.batchSize - 1);
    const index = Math.floor((from - 1) / state.batchSize) + 1;

    if (state.backend === 'stub') {
      // ネーム作成もテキストモデルを使うので、スタブでは決め打ちで散らす。
      // 吹き出しの描画まで確かめられるよう、セリフも入れておく
      const cycle = [6, 2, 4, 8, 1, 6, 5, 3, 7, 9] as const;
      for (let n = from; n <= to; n += 1) {
        const page = state.pages[n - 1];
        page.panelsCount = cycle[(n - 1) % cycle.length];
        page.dialogues = Array.from({ length: page.panelsCount }, (_, i) =>
          i % 3 === 2 ? '' : `${n}ページ目${i + 1}コマ目のセリフ`,
        );
      }
    } else {
      // 直前の 3 ページぶんを渡して、バッチをまたいでも話が続くようにする
      const previously = state.pages
        .slice(Math.max(0, from - 4), from - 1)
        .map((page) => `${page.pageNumber}ページ目: ${page.segment}`)
        .join('\n');

      const plan = await planMangaPages({
        title: state.title,
        story: state.story,
        mood: state.mood,
        from,
        to,
        totalPages: state.totalPages,
        previously: previously || undefined,
      });

      for (const item of plan) {
        const page = state.pages[item.pageNumber - 1];
        if (!page) continue;
        page.segment = item.description;
        page.panelsCount = item.panelsCount;
        page.sceneType = item.sceneType;
        page.reason = item.reason;
        page.dialogues = item.dialogues;
      }
    }

    // コマ割りの並びも metadata に残す
    for (let n = from; n <= to; n += 1) {
      const page = state.pages[n - 1];
      page.grid = getGridLayout(page.panelsCount, 'portrait').label;
    }

    record(state, 'info', `ネーム作成: ${from}〜${to} ページ`);
    reporter.info(`ネーム作成 ${index}/${total}: P${from}-P${to}`);
    await writeJobState(paths, state);
  }
}

// ---------------------------------------------------------------
// 本体
// ---------------------------------------------------------------

export interface BookJobResult {
  status: BookJobState['status'];
  state: BookJobState;
  paths: BookPaths;
}

/** 1 冊ぶんを作る。開始も再開も同じ入口 */
export async function runBookJob(
  options: BookJobOptions,
  reporter: JobReporter,
): Promise<BookJobResult> {
  cancelRequested = false;

  const paths = resolveBookPaths({
    title: options.title,
    totalPages: clampBookPages(options.totalPages ?? DEFAULT_BOOK_PAGES),
    baseDir: options.baseDir,
  });
  await ensureBookDirs(paths);

  const started = Date.now();
  const state = await prepareState(paths, options, reporter);
  const elapsed = () => formatElapsed(Date.now() - started);

  const finish = async (): Promise<BookJobResult> => {
    await writeJobState(paths, state);
    return { status: state.status, state, paths };
  };

  // ------------------------------------------------------------
  // コマ割り
  // ------------------------------------------------------------
  if (state.status === 'analyzing') {
    await planPages(paths, state, reporter);
    if (cancelRequested) {
      state.status = 'paused';
      reporter.warn('中断しました。同じコマンドで再開できます。');
      return finish();
    }
    state.status = 'generating';
    await writeJobState(paths, state);
  }

  // ------------------------------------------------------------
  // ページ画像
  // ------------------------------------------------------------
  state.status = 'generating';
  const totalBatches = Math.ceil(state.totalPages / state.batchSize);

  for (let batch = 0; batch < totalBatches; batch += 1) {
    if (cancelRequested) break;

    const from = batch * state.batchSize + 1;
    const to = Math.min(state.totalPages, from + state.batchSize - 1);

    reporter.batch(batch + 1, totalBatches, from, to);
    record(state, 'info', `バッチ ${batch + 1}/${totalBatches}（${from}〜${to}）`);

    for (let pageNumber = from; pageNumber <= to; pageNumber += 1) {
      if (cancelRequested) break;

      const page = state.pages[pageNumber - 1];
      if (!page) continue;

      // 既に画像があるページは飛ばす（再開したときのため）
      if (page.status === 'done' && (await hasPageImage(paths, pageNumber))) {
        continue;
      }

      let lastError: unknown = null;
      for (let attempt = 1; attempt <= MAX_PAGE_ATTEMPTS; attempt += 1) {
        if (cancelRequested) break;

        page.attempts += 1;
        try {
          await generateAndSavePage(paths, state, page);
          page.status = 'done';
          page.file = `pages/${pageFileName(pageNumber)}`;
          page.error = undefined;
          page.generatedAt = new Date().toISOString();
          lastError = null;
          break;
        } catch (error: any) {
          lastError = error;
          const message = error?.message ?? String(error);
          record(
            state,
            'warn',
            `${pageNumber} ページ目 失敗（${attempt}/${MAX_PAGE_ATTEMPTS}）: ${message}`,
          );
          reporter.warn(
            `P${pageNumber} 失敗 (${attempt}/${MAX_PAGE_ATTEMPTS}): ${message}`,
          );
          // 混み合っているだけのこともあるので、待つ時間を伸ばしながら試す
          if (attempt < MAX_PAGE_ATTEMPTS) await sleep(2000 * attempt);
        }
      }

      if (lastError) {
        page.status = 'failed';
        page.error = (lastError as any)?.message ?? String(lastError);
        record(state, 'error', `${pageNumber} ページ目をあきらめました。`);
        reporter.error(`P${pageNumber} をあきらめました（3 回失敗）`);
      }

      reporter.page(pageNumber, state.totalPages, page);

      // 1 ページごとに書き出す。ここが再開の足がかりになる
      await writeJobState(paths, state);
    }

    if (batch < totalBatches - 1 && !cancelRequested) {
      await sleep(BATCH_INTERVAL_MS);
    }
  }

  if (cancelRequested) {
    state.status = 'paused';
    const counts = countPages(state);
    reporter.warn(
      `中断しました（${counts.done}/${state.totalPages} ページ完成、${elapsed()}経過）。同じコマンドで再開できます。`,
    );
    return finish();
  }

  // ------------------------------------------------------------
  // 揃ったか確かめる
  // ------------------------------------------------------------
  const counts = countPages(state);
  if (counts.done < state.totalPages) {
    state.status = 'failed';
    const stuck = state.pages
      .filter((page) => page.status !== 'done')
      .map((page) => page.pageNumber);
    state.error = `${stuck.length} ページが未完成です（P${stuck
      .slice(0, 8)
      .join(', P')}${stuck.length > 8 ? ' ほか' : ''}）。`;
    record(state, 'error', state.error);
    reporter.error(state.error);
    reporter.info('同じコマンドをもう一度実行すると、そのページだけ作り直します。');
    return finish();
  }

  reporter.info(
    `すべての画像生成完了 (${counts.panels}枚のコマ / ${state.totalPages}ページ、${elapsed()}経過)`,
  );

  // ------------------------------------------------------------
  // PDF
  // ------------------------------------------------------------
  state.status = 'building-pdf';
  await writeJobState(paths, state);
  reporter.info('PDF 生成中...');

  const result = await buildKindlePdf({
    pages: state.pages.map((page) => ({
      file: pageFile(paths, page.pageNumber),
      panelsCount: page.panelsCount,
      dialogues: page.dialogues,
    })),
    outputFile: paths.pdfFile,
    onPage: (pageNumber, total) => {
      if (pageNumber % 20 === 0 || pageNumber === total) {
        reporter.info(`  PDF 組み立て ${pageNumber}/${total} ページ`);
      }
    },
  });

  state.pdfPath = result.file;
  state.pdfBytes = result.bytes;
  state.jpegQuality = result.lowestQuality;
  state.status = 'done';
  record(
    state,
    result.withinLimit ? 'info' : 'warn',
    `PDF 完成: ${result.pages} ページ / ${formatBytes(result.bytes)} / JPEG 画質 ${result.lowestQuality}` +
      (result.withDialogues ? ' / セリフ入り' : ''),
  );

  if (!result.withinLimit) {
    state.error =
      'PDF が 50MB を超えました。ページ数を減らすか、画質の下限を下げてください。';
    reporter.warn(state.error);
  }

  return finish();
}
