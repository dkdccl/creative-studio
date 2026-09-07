import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_BOOK_PAGES,
  KINDLE_DPI,
  KINDLE_PAGE_HEIGHT_PX,
  KINDLE_PAGE_WIDTH_PX,
  formatBytes,
  formatElapsed,
} from '@/lib/kindle-book';
import { requestCancel, runBookJob, type JobReporter } from '@/lib/kindle-job';
import { resolveBookPaths } from '@/lib/kindle-workspace';
import { isOpenAIConfigured } from '@/lib/config';
import { MANGA_MOODS, clampBookPages } from '@/lib/scene-blocks';

import { readers, type ParsedArgs } from '../cli-args';

/**
 * 漫画モード。ストーリーを指定ページ数に割り、
 * ページごとに AI がコマ割りを決めて画像を作り、Kindle 用 PDF にまとめる。
 *
 *   npm run generate manga -- --title="定時後、君に恋をする" --pages=120 --format=kindle
 */

export const MANGA_USAGE = `
📕 漫画モード

  npm run generate manga -- --title="定時後、君に恋をする" --pages=120 --format=kindle

オプション:
  --title=<text>     作品名（必須）。保存先のフォルダ名にもなる
  --story=<text>     ストーリー。省略すると --title を題材にする
  --pages=<n>        ページ数（既定: ${DEFAULT_BOOK_PAGES}）
  --format=kindle    出力の規格。今は kindle のみ
  --batch-size=<n>   1 バッチのページ数（既定: ${DEFAULT_BATCH_SIZE}）
  --mood=<text>      雰囲気（${MANGA_MOODS.join(' / ')}）
  --output=<dir>     置き場所の差し替え（既定: ~/creative-studio-workspace/manga）
  --stub             画像生成 API を呼ばず、コマ枠だけのダミーで通す
  --fresh            前回の続きを使わず最初から作り直す

保存先:
  ~/creative-studio-workspace/manga/<タイトル>-<ページ数>p/
    ├─ output.pdf       Kindle 投稿用（${KINDLE_PAGE_WIDTH_PX}×${KINDLE_PAGE_HEIGHT_PX}px / ${KINDLE_DPI}DPI）
    ├─ pages/page-001.png …
    └─ metadata.json    シーン種別・コマ割り・進捗

途中で Ctrl+C を押しても、同じコマンドを実行すれば続きから再開します。
`;

function createReporter(startedAt: number): JobReporter {
  const elapsed = () => formatElapsed(Date.now() - startedAt);

  return {
    info: (message) => console.log(`✅ ${message}`),
    warn: (message) => console.warn(`⚠️  ${message}`),
    error: (message) => console.error(`❌ ${message}`),
    batch: (index, total, from, to) => {
      console.log(
        `⏳ Batch ${index}/${total}: P${from}-P${to} 生成中... (${elapsed()}経過)`,
      );
    },
    page: (pageNumber, total, page) => {
      const scene = page.sceneType ? ` ${page.sceneType}` : '';
      const mark = page.status === 'done' ? '·' : '✗';
      console.log(
        `   ${mark} P${String(pageNumber).padStart(3, ' ')}/${total}` +
          ` ${page.panelsCount}コマ${page.grid ? ` (${page.grid})` : ''}${scene}` +
          ` (${elapsed()}経過)`,
      );
    },
  };
}

export async function runMangaMode({ flags }: ParsedArgs): Promise<number> {
  const { text, flag, number } = readers(flags);

  if (flag('help') || flag('h')) {
    console.log(MANGA_USAGE);
    return 0;
  }

  const title = text('title').trim();
  if (!title) {
    console.error('❌ --title を指定してください。');
    console.log(MANGA_USAGE);
    return 1;
  }

  const format = text('format', 'kindle').toLowerCase();
  if (format !== 'kindle') {
    console.error(`❌ 未対応の format です: ${format}（kindle のみ）`);
    return 1;
  }

  // ストーリーを省いたときはタイトルを題材にする
  const story = text('story').trim() || title;
  const stub = flag('stub');

  if (!stub && !isOpenAIConfigured) {
    console.error('❌ OPENAI_API_KEY が未設定です。.env.local に設定してください。');
    console.error('   （--stub を付けると API を呼ばずに動きだけ確かめられます）');
    return 1;
  }

  const totalPages = clampBookPages(number('pages', DEFAULT_BOOK_PAGES));
  const batchSize = Math.max(
    1,
    Math.round(number('batch-size', DEFAULT_BATCH_SIZE)),
  );
  const baseDir = text('output') || undefined;
  const paths = resolveBookPaths({ title, totalPages, baseDir });
  const startedAt = Date.now();

  console.log('');
  console.log(`📕 ${title}`);
  console.log(`   ページ数   : ${totalPages}`);
  console.log(
    `   バッチ     : ${batchSize}ページ × ${Math.ceil(totalPages / batchSize)}バッチ`,
  );
  console.log(
    `   ページ規格 : ${KINDLE_PAGE_WIDTH_PX}×${KINDLE_PAGE_HEIGHT_PX}px / ${KINDLE_DPI}DPI (Kindle)`,
  );
  console.log(`   保存先     : ${paths.baseDir}`);
  if (stub) console.log('   モード     : スタブ（画像生成 API を呼びません）');
  console.log('');

  // Ctrl+C は今のページを描き終えてから止める。
  // 途中で殺すと書きかけのファイルが残るため。
  let cancelling = false;
  const onSignal = () => {
    if (cancelling) {
      console.log('\n強制終了します。');
      process.exit(130);
    }
    cancelling = true;
    console.log('\n⏸  中断します。今のページを保存してから止まります…');
    requestCancel();
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  const result = await runBookJob(
    {
      story,
      title,
      mood: text('mood', MANGA_MOODS[0]),
      totalPages,
      batchSize,
      stub,
      fresh: flag('fresh'),
      baseDir,
    },
    createReporter(startedAt),
  );

  console.log('');

  if (result.status === 'done') {
    console.log(
      `✅ PDF 保存完了: ${result.state.pdfPath} (${formatBytes(result.state.pdfBytes)})`,
    );
    console.log(`   ページ画像 : ${paths.pagesDir}`);
    console.log(`   メタデータ : ${paths.metadataFile}`);
    console.log(`   所要時間   : ${formatElapsed(Date.now() - startedAt)}`);
    // 50MB を超えていたら state.error に理由が入る
    return result.state.error ? 1 : 0;
  }

  if (result.status === 'paused') {
    console.log(`   保存先     : ${paths.baseDir}`);
    console.log('   同じコマンドをもう一度実行すると続きから再開します。');
    return 130;
  }

  console.error(`❌ 完成しませんでした: ${result.state.error ?? '不明なエラー'}`);
  console.error(`   メタデータ: ${paths.metadataFile}`);
  return 1;
}
