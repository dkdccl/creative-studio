/**
 * Amazon KDP のペーパーバック判型と、裁ち落とし込みのページサイズ計算。
 *
 * 裁ち落としは上・下・外側の 3 辺にだけ入る（綴じ側には入らない）ので、
 * 足す量は幅 +3.2mm、高さ +6.4mm。公式の例でも
 * 6×9 インチ → 6.125×9.25 インチ（幅 +0.125、高さ +0.25）になっている。
 * https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6
 */

/** 裁ち落としで足す量（ミリ） */
export const BLEED_WIDTH_MM = 3.2;
export const BLEED_HEIGHT_MM = 6.4;

/** KDP が求める最小解像度 */
export const KDP_MIN_DPI = 300;

export interface KdpFormat {
  key: string;
  name: string;
  /** 仕上がり寸法（ミリ） */
  mm: { width: number; height: number };
  description: string;
}

export const KDP_FORMATS: KdpFormat[] = [
  {
    key: '6x9',
    name: '6 × 9 インチ',
    mm: { width: 152.4, height: 228.6 },
    description: '生成画像の縦横比に近く、切れがいちばん少ない',
  },
  {
    key: '5x8',
    name: '5 × 8 インチ',
    mm: { width: 127, height: 203.2 },
    description: '標準的な本のサイズ。縦長',
  },
  {
    key: '8.5x8.5',
    name: '8.5 × 8.5 インチ（正方形）',
    mm: { width: 215.9, height: 215.9 },
    description: '正方形の写真集向け。縦長画像では左右が大きく切れる',
  },
  {
    key: '8.5x11',
    name: '8.5 × 11 インチ',
    mm: { width: 215.9, height: 279.4 },
    description: '大判。1 ページが大きいぶん解像度が足りにくい',
  },
];

export type KdpFormatKey = string;

/** 既定は 6×9。生成画像（縦横比 0.68）にいちばん近い */
export const DEFAULT_KDP_FORMAT: KdpFormatKey = '6x9';

export function findKdpFormat(key: KdpFormatKey): KdpFormat | undefined {
  return KDP_FORMATS.find((format) => format.key === key);
}

export interface KdpPageSize {
  formatName: string;
  /** 仕上がり寸法（ミリ） */
  finishedMm: { width: number; height: number };
  /** 裁ち落とし込みの実際のページサイズ（ミリ） */
  pageMm: { width: number; height: number };
  /**
   * 画像を全面に敷いたときに切り落とされる割合（0〜1）。
   * 片側ぶんではなく合計。表示するときは半分にして「左右各 N%」と出す。
   */
  crop: { width: number; height: number };
  /** そのページに貼ったときの実効 DPI */
  dpi: number;
}

/**
 * 判型と画素数から、ページサイズと切れ量を出す。
 *
 * 切れ量は「全面に敷く（cover）」前提。縦横比が違うぶん、長いほうの辺が
 * はみ出して切り落とされる。はみ出す割合は縦横比の比でそのまま決まる。
 */
export function calculateKdpPageSize(
  format: { name: string; mm: { width: number; height: number } },
  imageWidth: number,
  imageHeight: number,
): KdpPageSize {
  const finishedMm = format.mm;
  const pageMm = {
    width: finishedMm.width + BLEED_WIDTH_MM,
    height: finishedMm.height + BLEED_HEIGHT_MM,
  };

  const imageAspect = imageWidth / imageHeight;
  const pageAspect = pageMm.width / pageMm.height;

  const crop = { width: 0, height: 0 };
  if (imageAspect > pageAspect) {
    // 画像のほうが横広い → 左右がはみ出して切れる
    crop.width = 1 - pageAspect / imageAspect;
  } else if (imageAspect < pageAspect) {
    // 画像のほうが縦長 → 上下がはみ出して切れる
    crop.height = 1 - imageAspect / pageAspect;
  }

  // 全面に敷くので、短いほうの辺が基準になる（＝拡大率が大きいほう）
  const scale = Math.max(
    imageWidth / pageMm.width,
    imageHeight / pageMm.height,
  );
  const dpi = scale * 25.4;

  return {
    formatName: format.name,
    finishedMm,
    pageMm,
    crop,
    dpi: Math.round(dpi),
  };
}

/** ミリをポイントに直す。pdf-lib はポイントで受け取る */
export function mmToPoints(mm: number): number {
  return (mm / 25.4) * 72;
}
