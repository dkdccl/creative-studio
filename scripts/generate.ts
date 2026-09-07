// 一番上に置くこと。lib/config.ts より先に環境変数を載せる必要がある
import './load-env';

import { parseArgs } from './cli-args';
import { MANGA_USAGE, runMangaMode } from './modes/manga';
import { WORKSPACE_DIR } from '@/lib/kindle-workspace';

/**
 * Creative Studio の生成 CLI。
 *
 *   npm run generate manga   -- --title="定時後、君に恋をする" --pages=120 --format=kindle
 *   npm run generate gravure -- --volume=1 --poses=50 --format=kindle
 *   npm run generate novel   -- --series="シリーズ名" --volume=1 --format=kindle
 *
 * 画面（ブラウザ）は使わない。生成物はすべて
 * ~/creative-studio-workspace/ の下に置く。
 */

const USAGE = `
🎨 Creative Studio 生成 CLI

  npm run generate <モード> -- [オプション]

モード:
  manga     漫画を作って Kindle 用 PDF にまとめる（実装済み）
  gravure   グラビアを作って Kindle 用 PDF にまとめる（未実装）
  novel     小説を作って Kindle 用 PDF にまとめる（未実装）

保存先:
  ${WORKSPACE_DIR}
    ├─ gravure/vol-01/
    ├─ manga/<タイトル>-<ページ数>p/
    └─ novels/<シリーズ名>/vol-01/

各モードの詳しい使い方:
  npm run generate manga -- --help
`;

/** まだ作っていないモードの案内。何が足りないかまで書く */
function notImplemented(mode: string, plan: string): number {
  console.error(`❌ ${mode} モードは未実装です。`);
  console.error(`   ${plan}`);
  console.error('   今使えるのは manga モードです:');
  console.error('     npm run generate manga -- --title="作品名" --pages=120');
  return 1;
}

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2));

  switch (parsed.mode) {
    case 'manga':
      return runMangaMode(parsed);

    case 'gravure':
      return notImplemented(
        'gravure',
        '画像生成は app/api/gravure と lib/gravure-*.ts にありますが、' +
          'CLI からの一括生成と PDF 化はまだつないでいません。',
      );

    case 'novel':
      return notImplemented(
        'novel',
        '本文生成は app/api/novels と lib/novel-*.ts にありますが、' +
          'CLI からの一括生成と PDF 化はまだつないでいません。',
      );

    case '':
    case 'help':
      console.log(USAGE);
      return parsed.mode === '' ? 1 : 0;

    default:
      console.error(`❌ 知らないモードです: ${parsed.mode}`);
      console.log(USAGE);
      return 1;
  }
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error('❌ 想定外のエラーで止まりました:', error);
    process.exit(1);
  });
