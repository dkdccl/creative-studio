import { config, isHuggingFaceConfigured, isOpenAIConfigured } from '@/lib/config';
import { checkHuggingFace } from '@/lib/huggingface-api';
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_BOOK_PAGES,
  IMAGE_BACKENDS,
  KINDLE_DPI,
  KINDLE_PAGE_HEIGHT_PX,
  KINDLE_PAGE_WIDTH_PX,
  formatBytes,
  formatElapsed,
  isImageBackend,
  type ImageBackend,
} from '@/lib/kindle-book';
import { requestCancel, runBookJob, type JobReporter } from '@/lib/kindle-job';
import { resolveBookPaths } from '@/lib/kindle-workspace';
import { MANGA_MOODS, clampBookPages } from '@/lib/scene-blocks';

import { readers, type ParsedArgs } from './cli-args';

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
  --backend=<name>   絵をどこで作るか（既定: huggingface）
                       huggingface … Hugging Face の Inference API。1 枚 $0.005〜0.01
                                     （HUGGINGFACE_API_KEY の設定が要る）
                       openai      … OpenAI の画像モデル。高品質だが 1 冊で数十ドル
                       stub        … 生成せずコマ枠だけのダミー。流れの確認用
  --page-mode=<name> ページの作り方（既定: panel）
                       panel … コマを 1 つずつ描いて組版する。
                               コマ数どおりになり、吹き出しもぴたりと合う
                       whole … ページ丸ごと 1 枚。速くて安いが
                               コマ数の指示はまず守られない
  --stub             --backend=stub の短い書き方
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
    // 1 枚に数十秒かかるので、取りかかった時点で出す。
    // 待ち時間の長い作業なので、終わってからでは遅い
    // コマ 1 つが終わるたびに同じ行を書き換える（1 ページで最大 9 回）
    panel: (pageNumber, index, total) => {
      process.stdout.write(
        `        コマ ${index}/${total} (P${pageNumber})          `,
      );
    },
    pageStart: (pageNumber, total, page) => {
      const scene = page.sceneType ? ` ${page.sceneType}` : '';
      console.log(
        `   [${String(pageNumber).padStart(3, ' ')}/${total}] Generating image ${pageNumber}...` +
          ` ${page.panelsCount}コマ${page.grid ? ` (${page.grid})` : ''}${scene}` +
          ` (${elapsed()}経過)`,
      );
    },
    // うまくいったページは pageStart で出しているので、ここは失敗だけ
    page: (pageNumber, total, page) => {
      // コマの進捗行を消す
      process.stdout.write(`${' '.repeat(40)}`);
      if (page.status === 'done') return;
      console.log(
        `   [${String(pageNumber).padStart(3, ' ')}/${total}] ❌ 未完成` +
          `${page.error ? `: ${page.error.slice(0, 90)}` : ''}`,
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

  const requested = flag('stub') ? 'stub' : text('backend', 'huggingface');
  if (!isImageBackend(requested)) {
    console.error(
      `❌ 知らない backend です: ${requested}（${IMAGE_BACKENDS.join(' / ')}）`,
    );
    return 1;
  }
  const backend: ImageBackend = requested;

  // コマ割りの判定はどの backend でもテキストモデルを使う（stub を除く）
  if (backend !== 'stub' && !isOpenAIConfigured) {
    console.error('❌ OPENAI_API_KEY が未設定です。.env.local に設定してください。');
    console.error('   （コマ割りの判定にテキストモデルを使います）');
    console.error('   --stub を付けると API を呼ばずに動きだけ確かめられます。');
    return 1;
  }

  if (backend === 'huggingface') {
    if (!isHuggingFaceConfigured) {
      console.error('❌ HUGGINGFACE_API_KEY が未設定です。');
      console.error('   https://huggingface.co/settings/tokens で取得して .env.local に書いてください。');
      return 1;
    }
    // 120 ページ流し始めてから 401 で全滅しないよう、小さい絵を 1 枚試す
    process.stdout.write('🤗 Hugging Face を確認中… ');
    const health = await checkHuggingFace();
    console.log(health.ok ? 'OK' : 'NG');
    console.log(`   ${health.detail}`);
    if (!health.ok) return 1;
  }

  const totalPages = clampBookPages(number('pages', DEFAULT_BOOK_PAGES));
  const batchSize = Math.max(
    1,
    Math.round(number('batch-size', DEFAULT_BATCH_SIZE)),
  );
  const pageMode = text('page-mode', 'panel').toLowerCase();
  if (pageMode !== 'panel' && pageMode !== 'whole') {
    console.error(`❌ 知らない page-mode です: ${pageMode}（panel / whole）`);
    return 1;
  }

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
  console.log(
    `   作り方     : ${
      pageMode === 'panel'
        ? 'コマ単位（1 コマ = 1 枚を生成して組版）'
        : 'ページ丸ごと 1 枚'
    }`,
  );
  console.log(
    `   画像生成   : ${backend}` +
      (backend === 'huggingface'
        ? `（${config.huggingface.model}）`
        : backend === 'stub'
          ? '（生成せずコマ枠だけのダミー）'
          : ''),
  );
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
      backend,
      pageMode,
      fresh: flag('fresh'),
      baseDir,
    },
    createReporter(startedAt),
  );

  console.log('');

  if (result.status === 'done') {
    console.log(
      `✅ Complete! ${result.state.pdfPath} (${formatBytes(result.state.pdfBytes)})`,
    );
    console.log(`   ページ画像 : ${paths.pagesDir}`);
    console.log(`   メタデータ : ${paths.metadataFile}`);
    console.log(`   生成枚数   : ${result.state.imagesGenerated ?? '-'} 枚`);
    console.log(`   所要時間   : ${formatElapsed(Date.now() - startedAt)}`);
    // 50MB を超えていたら state.error に理由が入る
    return result.state.error ? 1 : 0;
  }

  if (result.status === 'paused') {
    console.log(`   保存先     : ${paths.baseDir}`);
  console.log(
    `   作り方     : ${
      pageMode === 'panel'
        ? 'コマ単位（1 コマ = 1 枚を生成して組版）'
        : 'ページ丸ごと 1 枚'
    }`,
  );
    console.log('   同じコマンドをもう一度実行すると続きから再開します。');
    return 130;
  }

  console.error(`❌ 完成しませんでした: ${result.state.error ?? '不明なエラー'}`);
  console.error(`   メタデータ: ${paths.metadataFile}`);
  return 1;
}
