import { Jimp } from 'jimp';

import {
  BATCH_INTERVAL_MS,
  DEFAULT_BATCH_SIZE,
  DEFAULT_BOOK_PAGES,
  KINDLE_DPI,
  KINDLE_PAGE_HEIGHT_PX,
  KINDLE_PAGE_WIDTH_PX,
  MAX_PAGE_ATTEMPTS,
  SOURCE_IMAGE_SIZE,
  countPages,
  formatBytes,
  formatElapsed,
  pageFileName,
  type BookJobState,
  type BookLogEvent,
  type BookPageState,
} from '@/lib/kindle-book';
import { buildKindlePdf } from '@/lib/kindle-pdf';
import {
  ensureBookDirs,
  fetchImageBytes,
  hasPageImage,
  pageFile,
  readJobState,
  resolveBookPaths,
  savePageImage,
  writeJobState,
  type BookPaths,
} from '@/lib/kindle-workspace';
import { generateImage } from '@/lib/openai';
import { analyzeLayoutRange } from '@/lib/scene-analysis';
import {
  buildMangaGenerationPrompt,
  clampBookPages,
  getGridLayout,
  getGridShape,
  splitStoryByPages,
} from '@/lib/scene-blocks';

/**
 * 単行本 1 冊ぶんの生成。
 *
 * 120 ページを一息に作ると数十分〜数時間かかるので、
 * ページ 1 枚ごとに logs/generation-log.json へ書き出しながら進む。
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

/**
 * 画像モデルを呼ばずに、コマ枠だけのダミーページを描く。
 *
 * 120 ページを実際に生成すると利用料が数十ドルかかるので、
 * 分割・バッチ・再開・PDF 化までの流れを無料で確かめられるようにしてある。
 */
async function drawStubPage(page: BookPageState): Promise<Buffer> {
  const width = KINDLE_PAGE_WIDTH_PX;
  const height = KINDLE_PAGE_HEIGHT_PX;
  const image = new Jimp({ width, height, color: 0xffffffff });

  const { columns, gridRows, hasWideLastPanel } = getGridShape(
    page.panelsCount,
    'portrait',
  );
  const margin = Math.round(width * 0.05);
  const gutter = Math.round(width * 0.02);
  const innerW = width - margin * 2;
  const innerH = height - margin * 2;
  const rows = hasWideLastPanel ? gridRows + 1 : gridRows;
  const cellW = (innerW - gutter * (columns - 1)) / columns;
  const cellH = (innerH - gutter * (rows - 1)) / rows;

  // setPixelColor はページあたり数百万回になるので、ビットマップに直接書く
  const data = image.bitmap.data;

  /** 一色で塗る。行ごとに Buffer.fill へ任せる */
  const fillRect = (
    x: number,
    y: number,
    w: number,
    h: number,
    rgb: [number, number, number],
  ) => {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(width, Math.round(x + w));
    const y1 = Math.min(height, Math.round(y + h));
    if (x1 <= x0 || y1 <= y0) return;

    const pattern = Buffer.from([rgb[0], rgb[1], rgb[2], 255]);
    for (let py = y0; py < y1; py += 1) {
      const start = (py * width + x0) * 4;
      data.fill(pattern, start, start + (x1 - x0) * 4);
    }
  };

  /**
   * コマの中身をグラデーションで埋める。
   * 一色のままだと JPEG が小さくなりすぎて、
   * 50MB に収める仕組みを試したことにならないため。
   */
  const fillGradient = (x: number, y: number, w: number, h: number) => {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(width, Math.round(x + w));
    const y1 = Math.min(height, Math.round(y + h));
    const seed = page.pageNumber * 37;

    for (let py = y0; py < y1; py += 1) {
      let index = (py * width + x0) * 4;
      for (let px = x0; px < x1; px += 1) {
        const tone = 120 + (((px - x0) + (py - y0) * 2 + seed) % 120);
        data[index] = tone;
        data[index + 1] = tone;
        data[index + 2] = 255 - (tone % 60);
        data[index + 3] = 255;
        index += 4;
      }
    }
  };

  const border = 6;
  const drawPanel = (x: number, y: number, w: number, h: number) => {
    fillRect(x, y, w, h, [0, 0, 0]);
    fillGradient(x + border, y + border, w - border * 2, h - border * 2);
  };

  for (let r = 0; r < gridRows; r += 1) {
    for (let c = 0; c < columns; c += 1) {
      drawPanel(
        margin + c * (cellW + gutter),
        margin + r * (cellH + gutter),
        cellW,
        cellH,
      );
    }
  }
  if (hasWideLastPanel) {
    drawPanel(margin, margin + gridRows * (cellH + gutter), innerW, cellH);
  }

  return Buffer.from(await image.getBuffer('image/png'));
}

/** 1 ページぶんの画像を作って保存する。失敗したら投げる */
async function generatePageImage(
  paths: BookPaths,
  state: BookJobState,
  page: BookPageState,
): Promise<void> {
  if (state.stub) {
    await savePageImage(paths, page.pageNumber, await drawStubPage(page));
    return;
  }

  const prompt = buildMangaGenerationPrompt({
    story: state.story,
    pageNumber: page.pageNumber,
    totalPages: state.totalPages,
    panelsCount: page.panelsCount,
    mood: state.mood,
    sceneType: page.sceneType,
    orientation: 'portrait',
  });

  const images = await generateImage({ prompt, size: SOURCE_IMAGE_SIZE });
  const image = images[0];
  if (!image) throw new Error('画像が返りませんでした。');

  await savePageImage(
    paths,
    page.pageNumber,
    await fetchImageBytes(image.url),
  );
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
  stub?: boolean;
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
      existing.stub === (options.stub ?? false);

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
    stub: options.stub ?? false,
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

/** コマ割りをバッチ単位で判定する */
async function analyzeLayout(
  paths: BookPaths,
  state: BookJobState,
  reporter: JobReporter,
): Promise<void> {
  const segments = state.pages.map((page) => page.segment);
  const total = Math.ceil(state.totalPages / state.batchSize);

  for (let from = 1; from <= state.totalPages; from += state.batchSize) {
    if (cancelRequested) return;
    const to = Math.min(state.totalPages, from + state.batchSize - 1);
    const index = Math.floor((from - 1) / state.batchSize) + 1;

    if (state.stub) {
      // 判定も課金なので、スタブでは決め打ちで散らす
      const cycle = [6, 2, 4, 8, 1, 6, 5, 3, 7, 9] as const;
      for (let n = from; n <= to; n += 1) {
        state.pages[n - 1].panelsCount = cycle[(n - 1) % cycle.length];
      }
    } else {
      const layout = await analyzeLayoutRange(state.story, segments, from, to);
      for (const item of layout) {
        const page = state.pages[item.pageNumber - 1];
        if (!page) continue;
        page.panelsCount = item.panelsCount;
        page.sceneType = item.sceneType;
        page.reason = item.reason;
      }
    }

    // コマ割りの並びも metadata に残す
    for (let n = from; n <= to; n += 1) {
      const page = state.pages[n - 1];
      page.grid = getGridLayout(page.panelsCount, 'portrait').label;
    }

    record(state, 'info', `コマ割り判定: ${from}〜${to} ページ`);
    reporter.info(`コマ割り判定 ${index}/${total}: P${from}-P${to}`);
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
    await analyzeLayout(paths, state, reporter);
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
          await generatePageImage(paths, state, page);
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
    imageFiles: state.pages.map((page) => pageFile(paths, page.pageNumber)),
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
    `PDF 完成: ${result.pages} ページ / ${formatBytes(result.bytes)} / JPEG 画質 ${result.lowestQuality}`,
  );

  if (!result.withinLimit) {
    state.error =
      'PDF が 50MB を超えました。ページ数を減らすか、画質の下限を下げてください。';
    reporter.warn(state.error);
  }

  return finish();
}
