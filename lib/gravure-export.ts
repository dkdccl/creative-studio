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
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function baseName(metadata: GravureMetadata): string {
  return toSafeFileName(metadata.title, 'gravure');
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
  for (const shot of shots) {
    images?.file(imageFileName(shot.index), shot.blob);
  }

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
  downloadBlob(`${baseName(metadata)}.zip`, blob);
}

/** 全ページを 1 つの PDF にして落とす。実効 DPI を呼び出し側に返す */
export async function downloadPdf(
  metadata: GravureMetadata,
  shots: GravureShot[],
  options: PdfOptions,
): Promise<PdfResult> {
  const result = await buildPdf(shots, options);
  downloadBlob(`${baseName(metadata)}.pdf`, result.blob);
  return result;
}
