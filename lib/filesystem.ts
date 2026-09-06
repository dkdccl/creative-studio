/**
 * ローカルフォルダへの書き出し（画面側の窓口）。
 *
 * 実体は Electron のメインプロセスにあり、ここは preload が渡す
 * window.desktop を呼ぶだけ。fs をここで import しないのは、
 * contextIsolation の内側にいる画面側から Node の API を触れないため。
 *
 * ブラウザで開いたときは isDesktop が false になり、各関数は null を返す。
 * 呼び出し側は「保存できなければ従来どおりダウンロード」に倒せる。
 */

export interface DesktopBridge {
  isDesktop: true;
  workspaceDir(): Promise<string>;
  openWorkspace(): Promise<string>;
  nextVolumeNumber(kind: 'gravure' | 'novel', seriesTitle?: string): Promise<number>;
  saveGravureImage(
    volumeNumber: number,
    imageNumber: number,
    bytes: Uint8Array,
    extension: string,
  ): Promise<string>;
  saveGravurePdf(volumeNumber: number, bytes: Uint8Array): Promise<string>;
  saveNovelStory(
    seriesTitle: string,
    volumeNumber: number,
    title: string,
    content: string,
    summary: string,
  ): Promise<string>;
  previousVolumeSummary(
    seriesTitle: string,
    volumeNumber: number,
  ): Promise<string | null>;
}

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}

/** デスクトップ版で動いているか */
export function isDesktop(): boolean {
  return typeof window !== 'undefined' && window.desktop?.isDesktop === true;
}

function bridge(): DesktopBridge | null {
  return isDesktop() ? (window.desktop as DesktopBridge) : null;
}

/** 生成物を置くフォルダ。ブラウザでは null */
export async function workspaceDir(): Promise<string | null> {
  return bridge()?.workspaceDir() ?? null;
}

/** フォルダをエクスプローラーで開く */
export async function openWorkspaceFolder(): Promise<string | null> {
  return bridge()?.openWorkspace() ?? null;
}

/** 次に使う巻番号。既にあるフォルダの続きから */
export async function nextVolumeNumber(
  kind: 'gravure' | 'novel',
  seriesTitle = '',
): Promise<number | null> {
  return bridge()?.nextVolumeNumber(kind, seriesTitle) ?? null;
}

/** Blob をそのままでは IPC に載せられないので、バイト列にして渡す */
async function toBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

function extensionOf(blob: Blob): string {
  if (blob.type === 'image/png') return 'png';
  if (blob.type === 'image/webp') return 'webp';
  return 'jpg';
}

/** 画像 1 枚を gravure/vol-XX/images/ へ */
export async function saveGravureImage(
  volumeNumber: number,
  imageNumber: number,
  blob: Blob,
): Promise<string | null> {
  const api = bridge();
  if (!api) return null;
  return api.saveGravureImage(
    volumeNumber,
    imageNumber,
    await toBytes(blob),
    extensionOf(blob),
  );
}

/** PDF を gravure/vol-XX/ へ */
export async function saveGravurePdf(
  volumeNumber: number,
  blob: Blob,
): Promise<string | null> {
  const api = bridge();
  if (!api) return null;
  return api.saveGravurePdf(volumeNumber, await toBytes(blob));
}

/** 小説 1 巻ぶんを novels/シリーズ名/vol-XX/ へ */
export async function saveNovelStory(
  seriesTitle: string,
  volumeNumber: number,
  title: string,
  content: string,
  summary: string,
): Promise<string | null> {
  const api = bridge();
  if (!api) return null;
  return api.saveNovelStory(seriesTitle, volumeNumber, title, content, summary);
}

/** 前巻のあらすじ。無ければ null */
export async function getPreviousVolumeSummary(
  seriesTitle: string,
  volumeNumber: number,
): Promise<string | null> {
  const api = bridge();
  if (!api) return null;
  return api.previousVolumeSummary(seriesTitle, volumeNumber);
}
