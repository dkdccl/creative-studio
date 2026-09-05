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

/**
 * 1 枚だけ JPEG で落とす。
 * 参考画像なし: 画像{N}-gravure-{NNN}.jpg（指定どおり）
 * 参考画像あり: 参考{R}-画像{N}-gravure-{RR}-{NNN}.jpg
 */
export function downloadShot(shot: GravureShot): void {
  const body = imageFileName(shot.index, shot.referenceIndex);
  const prefix =
    shot.referenceIndex === undefined
      ? `画像${shot.index}`
      : `参考${shot.referenceIndex}-画像${shot.index}`;
  downloadBlob(`${prefix}-${body}`, shot.blob);
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
  // 参考画像ごとに番号を振り直す。どの参考画像から出たかがファイル名で分かる
  const seen = new Map<number | undefined, number>();
  shots.forEach((shot, i) => {
    const group = shot.referenceIndex;
    const next = (seen.get(group) ?? 0) + 1;
    seen.set(group, next);
    images?.file(
      group === undefined ? imageFileName(i + 1) : imageFileName(next, group),
      shot.blob,
    );
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
