import type { GravureShot } from './gravure';

/**
 * 生成した JPEG をまとめて 1 つの PDF にする（ブラウザ内で生成）。
 *
 * DPI について。
 * DPI は「画素数 ÷ 物理サイズ」でしかないので、ページサイズを決めた時点で
 * 元画像の画素数から自動的に決まる。A4 に貼れば 300 DPI になる、
 * ということはない。832×1216 を A4 に貼ると約 100 DPI にしかならない。
 *
 * そこで既定は 'native-300dpi'：画素数から逆算してページサイズを決め、
 * 補間なしで確実に 300 DPI にする。A4 が必要な場合は upscale で
 * 引き伸ばせるが、これは水増しであって情報量は増えない。
 */

const PT_PER_INCH = 72;
export const TARGET_DPI = 300;

/** A4（ポイント単位） */
export const A4 = { width: 595.28, height: 841.89 } as const;

export type PdfPageMode = 'native-300dpi' | 'a4';

export interface PdfOptions {
  pageMode: PdfPageMode;
  /**
   * A4 で 300 DPI に足りないぶんを引き伸ばして埋める。
   * 画質が上がるわけではないので既定は false。
   */
  upscaleToTargetDpi: boolean;
}

export const DEFAULT_PDF_OPTIONS: PdfOptions = {
  pageMode: 'native-300dpi',
  upscaleToTargetDpi: false,
};

/** ポイント幅に画素数を収めたときの実効 DPI */
export function dpiFor(pixels: number, points: number): number {
  if (points <= 0) return 0;
  return pixels / (points / PT_PER_INCH);
}

/** 300 DPI で貼ったときの用紙サイズ（ミリ） */
export function nativePageMillimeters(width: number, height: number) {
  const toMm = (px: number) => (px / TARGET_DPI) * 25.4;
  return { width: Math.round(toMm(width)), height: Math.round(toMm(height)) };
}

/** アスペクト比を保って枠に収めたときの寸法 */
function fitInside(
  imageWidth: number,
  imageHeight: number,
  boxWidth: number,
  boxHeight: number,
) {
  const scale = Math.min(boxWidth / imageWidth, boxHeight / imageHeight);
  return { width: imageWidth * scale, height: imageHeight * scale };
}

/**
 * A4 に貼ったときの実効 DPI。UI の警告表示に使う。
 * 画像サイズが分かれば PDF を作らなくても計算できる。
 */
export function a4Dpi(imageWidth: number, imageHeight: number): number {
  const fitted = fitInside(imageWidth, imageHeight, A4.width, A4.height);
  return dpiFor(imageWidth, fitted.width);
}

/**
 * 引き伸ばしは canvas で行う。
 *
 * jimp を使う手もあるが、1.6 系はブラウザ向けビルド（package.json の
 * "browser" 条件が指す dist/browser/index.js）が `export {}` の空実装で、
 * クライアントバンドルからは Jimp が undefined になって使えない。
 * canvas なら追加のバンドルも要らない。
 */
async function upscaleJpeg(
  blob: Blob,
  targetWidth: number,
  targetHeight: number,
): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(targetWidth);
  canvas.height = Math.round(targetHeight);

  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('canvas の 2d コンテキストを取得できませんでした。');
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const jpeg = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.92),
  );
  if (!jpeg) throw new Error('引き伸ばした画像を JPEG に変換できませんでした。');

  return new Uint8Array(await jpeg.arrayBuffer());
}

export interface PdfResult {
  blob: Blob;
  /** 実際に書き出したページの実効 DPI（最小値）。UI に出して確かめてもらう */
  minDpi: number;
  pageCount: number;
}

export async function buildPdf(
  shots: GravureShot[],
  options: PdfOptions = DEFAULT_PDF_OPTIONS,
): Promise<PdfResult> {
  // pdf-lib は 170kB ほどあるので、書き出しを押したときだけ読み込む
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  let minDpi = Number.POSITIVE_INFINITY;

  for (const shot of shots) {
    // 画素数は生成時に実測済み。ここで測り直すと未使用の画像が PDF に残る
    const { width: naturalWidth, height: naturalHeight } = shot;

    if (options.pageMode === 'native-300dpi') {
      // 画素数から用紙サイズを逆算するので、常にちょうど 300 DPI になる
      const image = await pdf.embedJpg(await shot.blob.arrayBuffer());
      const pageWidth = (naturalWidth / TARGET_DPI) * PT_PER_INCH;
      const pageHeight = (naturalHeight / TARGET_DPI) * PT_PER_INCH;
      const page = pdf.addPage([pageWidth, pageHeight]);
      page.drawImage(image, { x: 0, y: 0, width: pageWidth, height: pageHeight });
      minDpi = Math.min(minDpi, TARGET_DPI);
      continue;
    }

    const fitted = fitInside(naturalWidth, naturalHeight, A4.width, A4.height);
    const neededWidth = (fitted.width / PT_PER_INCH) * TARGET_DPI;
    const neededHeight = (fitted.height / PT_PER_INCH) * TARGET_DPI;
    // すでに足りているなら触らない（縮小すると劣化するだけ）
    const shouldUpscale = options.upscaleToTargetDpi && neededWidth > naturalWidth;

    const image = await pdf.embedJpg(
      shouldUpscale
        ? await upscaleJpeg(shot.blob, neededWidth, neededHeight)
        : await shot.blob.arrayBuffer(),
    );

    const page = pdf.addPage([A4.width, A4.height]);
    page.drawImage(image, {
      x: (A4.width - fitted.width) / 2,
      y: (A4.height - fitted.height) / 2,
      width: fitted.width,
      height: fitted.height,
    });
    minDpi = Math.min(minDpi, dpiFor(image.width, fitted.width));
  }

  const bytes = await pdf.save();
  // pdf-lib が返す Uint8Array は SharedArrayBuffer 由来の可能性がある型なので、
  // Blob に渡せるよう素の ArrayBuffer に写し替える
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const blob = new Blob([buffer], { type: 'application/pdf' });

  return {
    blob,
    minDpi: Number.isFinite(minDpi) ? Math.round(minDpi) : 0,
    pageCount: shots.length,
  };
}
