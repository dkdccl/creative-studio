import {
  buildKdpMetadata,
  imageFileName,
  REQUIRED_DISCLAIMERS,
  type GravureMetadata,
  type GravureShot,
} from './gravure';
import { buildPdf, type PdfOptions, type PdfResult } from './gravure-pdf';
import { toSafeFileName } from './novel-export';

/**
 * グラビアの成果物をブラウザ内で書き出す。
 *
 * downloadBlob は novel-export-files.ts にも同じものがあるが、
 * あちらは docx を読み込むモジュールなので、
 * /gravure のバンドルに docx を巻き込まないようここで持つ。
 */

export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // click() の直後に revoke すると、ブラウザが保存を始める前に
  // URL が無効になってダウンロードが黙って失敗することがある。
  // 破棄はイベントループを一巡させてから行う。
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** ファイル名に入れる日時。YYYYMMDD-HHMM */
export function timestamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}`
  );
}

function baseName(metadata: GravureMetadata): string {
  return toSafeFileName(metadata.title, 'gravure');
}

/** 1 枚だけ JPEG で落とす。ファイル名は gravure-{日時}[-{通し番号}].jpg */
export function downloadShot(shot: GravureShot, total = 0): void {
  const suffix = total === 1 ? '' : `-${String(shot.index).padStart(3, '0')}`;
  downloadBlob(`gravure-${timestamp()}${suffix}.jpg`, shot.blob);
}

/** メタデータだけを JSON で落とす */
export function downloadMetadataJson(
  metadata: GravureMetadata,
  shots: GravureShot[],
): void {
  const json = JSON.stringify(buildKdpMetadata(metadata, shots), null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  downloadBlob(`${baseName(metadata)}-kdp-metadata.json`, blob);
}

/**
 * 画像・メタデータ・免責事項をまとめた ZIP を作る。
 *
 * 画像は生成時の Blob をそのまま入れる（再取得はしない）。
 */
export async function buildZip(
  metadata: GravureMetadata,
  shots: GravureShot[],
): Promise<Blob> {
  // JSZip も書き出し時だけあればよい
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  const images = zip.folder('images');
  // 除外したぶんを飛ばして詰めるため、生成時の index ではなく並び順で振り直す
  shots.forEach((shot, i) => {
    images?.file(imageFileName(i + 1), shot.blob);
  });

  zip.file(
    'kdp-metadata.json',
    JSON.stringify(buildKdpMetadata(metadata, shots), null, 2),
  );

  // 画像だけ取り出して使われても免責が付いて回るように、単体でも置いておく
  zip.file('DISCLAIMER.txt', `${REQUIRED_DISCLAIMERS.join('\n')}\n`);

  return zip.generateAsync({ type: 'blob' });
}

export async function downloadZip(
  metadata: GravureMetadata,
  shots: GravureShot[],
): Promise<void> {
  const blob = await buildZip(metadata, shots);
  downloadBlob(`${baseName(metadata)}-${timestamp()}.zip`, blob);
}

/** 全ページを 1 つの PDF にして落とす。実効 DPI を呼び出し側に返す */
export async function downloadPdf(
  metadata: GravureMetadata,
  shots: GravureShot[],
  options: PdfOptions,
): Promise<PdfResult> {
  const result = await buildPdf(shots, options);
  downloadBlob(`gravure-kdp-${timestamp()}.pdf`, result.blob);
  return result;
}
