/**
 * 画像ファイルの読み込みユーティリティ（ブラウザ専用）。
 *
 * 写真シーンは localStorage に保存するため、元の解像度のままだと
 * すぐに容量制限に当たる。長辺を縮めて JPEG に再エンコードしてから持つ。
 */

/** 保存する写真の長辺の上限（px） */
const MAX_EDGE = 900;

/** JPEG の品質 */
const QUALITY = 0.72;

export async function fileToResizedDataUrl(
  file: File,
  maxEdge = MAX_EDGE,
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('画像ファイルを選んでください。');
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('画像を変換できませんでした。');
    context.drawImage(bitmap, 0, 0, width, height);

    return canvas.toDataURL('image/jpeg', QUALITY);
  } finally {
    bitmap.close();
  }
}

/** data URL のおおよそのバイト数 */
export function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.floor((base64.length * 3) / 4);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
