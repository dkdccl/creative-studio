import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
// 置いたファイルをすぐ拾えるよう、結果を固定させない
export const dynamic = 'force-dynamic';

/** 参考画像として読める拡張子 */
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

/**
 * GET /api/gravure/poses
 *
 * public/poses/ に置いてある画像のファイル名を返す。
 *
 * ブラウザからはフォルダの中身を一覧できないので、ここで見る。
 * こうしておくと、コードを触らずにファイルを足すだけでポーズが増える。
 * 説明文が lib/poses.ts にあるものはそれが付き、無いものは画像だけで使う。
 */
export async function GET() {
  const dir = path.join(process.cwd(), 'public', 'poses');

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) =>
        IMAGE_EXTENSIONS.includes(path.extname(name).toLowerCase()),
      )
      .sort((a, b) => a.localeCompare(b));

    return NextResponse.json({ files });
  } catch {
    // フォルダが無い環境（本番など）では空で返す。機能が無効になるだけ
    return NextResponse.json({ files: [] });
  }
}
