import 'server-only';

import fs from 'fs-extra';
import { Jimp } from 'jimp';
import path from 'path';
import PDFDocument from 'pdfkit';

import {
  JPEG_QUALITY_STEPS,
  KINDLE_DPI,
  KINDLE_PAGE_HEIGHT_PT,
  KINDLE_PAGE_HEIGHT_PX,
  KINDLE_PAGE_WIDTH_PT,
  KINDLE_PAGE_WIDTH_PX,
  MAX_PDF_BYTES,
  pageByteBudget,
} from '@/lib/kindle-book';

/**
 * ページ画像をまとめて Kindle 用の PDF にする。
 *
 * ページの大きさは 1456x2188px / 300DPI（＝349.44 × 525.12pt）で固定。
 * 画像は PNG のままだと 120 ページで数百 MB になるので、
 * ページごとに JPEG へ焼き直し、割り当てに収まる画質を選ぶ。
 */

export interface BuildPdfOptions {
  /** ページ画像の絶対パス。ページ順に並べておくこと */
  imageFiles: string[];
  /** 書き出し先 */
  outputFile: string;
  /** 途中経過を伝える */
  onPage?: (pageNumber: number, totalPages: number) => void;
}

export interface BuildPdfResult {
  file: string;
  bytes: number;
  pages: number;
  /** 実際に使った JPEG 画質の下限 */
  lowestQuality: number;
  /** 50MB に収まったか */
  withinLimit: boolean;
}

/**
 * 1 ページぶんの画像を、Kindle のページサイズちょうどの JPEG にする。
 *
 * 画像モデルが返すのは 1024x1536 なので、規格の 1456x2188 に伸ばす。
 * 引き伸ばしで解像感が増えるわけではないが、
 * Kindle 側が求める画素数を満たしていないと弾かれるため合わせる。
 */
async function toKindleJpeg(
  file: string,
  maxBytes: number,
): Promise<{ buffer: Buffer; quality: number }> {
  const image = await Jimp.read(file);
  const resized = image.resize({
    w: KINDLE_PAGE_WIDTH_PX,
    h: KINDLE_PAGE_HEIGHT_PX,
  });

  let last: { buffer: Buffer; quality: number } | null = null;

  for (const quality of JPEG_QUALITY_STEPS) {
    const buffer = Buffer.from(await resized.getBuffer('image/jpeg', { quality }));
    last = { buffer, quality };
    if (buffer.length <= maxBytes) return last;
  }

  // 一番低い画質でも入らなければ、それをそのまま使う。
  // ここで諦めるより、まず 1 冊分を組み上げて全体の大きさを見せたほうがよい
  return last as { buffer: Buffer; quality: number };
}

export async function buildKindlePdf({
  imageFiles,
  outputFile,
  onPage,
}: BuildPdfOptions): Promise<BuildPdfResult> {
  if (imageFiles.length === 0) {
    throw new Error('PDF にするページがありません。');
  }

  const budget = pageByteBudget(imageFiles.length);
  const document = new PDFDocument({
    size: [KINDLE_PAGE_WIDTH_PT, KINDLE_PAGE_HEIGHT_PT],
    margin: 0,
    autoFirstPage: false,
    // Kindle 側の取り込みで参照される情報
    info: {
      Producer: `Creative Studio (${KINDLE_PAGE_WIDTH_PX}x${KINDLE_PAGE_HEIGHT_PX}px / ${KINDLE_DPI}DPI)`,
    },
  });

  await fs.ensureDir(path.dirname(outputFile));
  const stream = fs.createWriteStream(outputFile);
  document.pipe(stream);

  let lowestQuality = JPEG_QUALITY_STEPS[0] as number;

  for (const [index, file] of imageFiles.entries()) {
    const { buffer, quality } = await toKindleJpeg(file, budget);
    lowestQuality = Math.min(lowestQuality, quality);

    document.addPage({
      size: [KINDLE_PAGE_WIDTH_PT, KINDLE_PAGE_HEIGHT_PT],
      margin: 0,
    });
    // 余白なしでページ全面に貼る
    document.image(buffer, 0, 0, {
      width: KINDLE_PAGE_WIDTH_PT,
      height: KINDLE_PAGE_HEIGHT_PT,
    });

    onPage?.(index + 1, imageFiles.length);
  }

  document.end();
  await new Promise<void>((resolve, reject) => {
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });

  const { size } = await fs.stat(outputFile);

  return {
    file: outputFile,
    bytes: size,
    pages: imageFiles.length,
    lowestQuality,
    withinLimit: size <= MAX_PDF_BYTES,
  };
}
