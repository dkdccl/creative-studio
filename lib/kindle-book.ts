import type { StoryOutline } from '@/lib/openai-client';
import {
  clampBookPages,
  type PanelCount,
  type SceneType,
} from '@/lib/scene-blocks';

/**
 * Kindle 単行本（120 ページ）の規格と、進捗のやりとりに使う型。
 *
 * サーバー側（生成ジョブ・PDF 組み立て）と画面側（進捗表示）の
 * 両方から読むので、ここには fs も OpenAI も持ち込まない。
 */

// ---------------------------------------------------------------
// Kindle の規格
// ---------------------------------------------------------------

/** 印刷解像度。ページの物理サイズはこの DPI で決まる */
export const KINDLE_DPI = 300;

/** ページの画素数。Kindle のコミック（固定レイアウト）向けの縦長サイズ */
export const KINDLE_PAGE_WIDTH_PX = 1456;
export const KINDLE_PAGE_HEIGHT_PX = 2188;

/** PDF の座標は 1/72 インチ単位なので、画素数から換算する */
export const KINDLE_PAGE_WIDTH_PT = (KINDLE_PAGE_WIDTH_PX / KINDLE_DPI) * 72;
export const KINDLE_PAGE_HEIGHT_PT = (KINDLE_PAGE_HEIGHT_PX / KINDLE_DPI) * 72;

/** 完成 PDF の上限。Kindle の投稿制限に合わせる */
export const MAX_PDF_BYTES = 50 * 1024 * 1024;

/**
 * PDF の構造と、埋め込む日本語フォントぶんの余裕。
 * ページの割り当てからは差し引く。
 */
const PDF_OVERHEAD_BYTES = 4 * 1024 * 1024;

/** 1 ページあたりに使ってよいバイト数 */
export function pageByteBudget(totalPages: number): number {
  const pages = Math.max(1, Math.round(totalPages));
  return Math.floor((MAX_PDF_BYTES - PDF_OVERHEAD_BYTES) / pages);
}

/** JPEG の画質。上から順に試して、ページの割り当てに収まったものを使う */
export const JPEG_QUALITY_STEPS = [88, 82, 74, 66, 58, 50, 42] as const;

/** 画像モデルに投げる縦長サイズ。1456x2188 と同じ 2:3 に最も近い */
export const SOURCE_IMAGE_SIZE = '1024x1536' as const;
export const SOURCE_IMAGE_WIDTH = 1024;
export const SOURCE_IMAGE_HEIGHT = 1536;

// ---------------------------------------------------------------
// 単行本の既定値
// ---------------------------------------------------------------

/** 単行本の既定ページ数 */
export const DEFAULT_BOOK_PAGES = 120;

/** 1 バッチで作るページ数。120 ページなら 10 ページ × 12 バッチ */
export const DEFAULT_BATCH_SIZE = 10;

/** 1 ページあたりの再試行の上限 */
export const MAX_PAGE_ATTEMPTS = 3;

/** バッチの区切りで空ける時間。レート制限に当たらないようにする */
export const BATCH_INTERVAL_MS = 3000;

/** バッチ数 */
export function batchCount(totalPages: number, batchSize: number): number {
  return Math.ceil(clampBookPages(totalPages) / Math.max(1, batchSize));
}

// ---------------------------------------------------------------
// ジョブの状態（metadata.json の中身）
// ---------------------------------------------------------------

export type BookJobStatus =
  /** コマ割りを判定している */
  | 'analyzing'
  /** ページ画像を作っている */
  | 'generating'
  /** PDF を組み立てている */
  | 'building-pdf'
  /** 完成 */
  | 'done'
  /** 中断中。同じジョブ ID で再開できる */
  | 'paused'
  /** 失敗したページが残っている。再開すればそこだけ作り直す */
  | 'failed';

export type BookPageStatus = 'pending' | 'done' | 'failed';

/**
 * 絵をどこで作るか。
 *
 * - huggingface: Hugging Face の Inference API。1 枚あたりが安く、単行本の既定
 * - openai     : OpenAI の画像モデル。品質は高いが 1 冊で数十ドルかかる
 * - stub       : 生成せずコマ枠だけのダミー。流れの確認用
 */
export type ImageBackend = 'huggingface' | 'openai' | 'stub';

export const IMAGE_BACKENDS: ImageBackend[] = ['huggingface', 'openai', 'stub'];

export function isImageBackend(value: unknown): value is ImageBackend {
  return (IMAGE_BACKENDS as string[]).includes(String(value));
}

export interface BookPageState {
  pageNumber: number;
  panelsCount: PanelCount;
  /** コマ割りの並び。「2×3」のような表記 */
  grid?: string;
  sceneType?: SceneType;
  /** そのコマ数にした理由（AI 判定） */
  reason?: string;
  /** このページで描く場面。AI が組んだネーム（日本語） */
  segment: string;
  /** 画像モデルに渡す英語のプロンプト */
  imagePrompt?: string;
  /** コマ順のセリフ。セリフのないコマは空文字 */
  dialogues?: string[];
  status: BookPageStatus;
  /** これまでの試行回数 */
  attempts: number;
  /** pages/ からの相対パス */
  file?: string;
  error?: string;
  generatedAt?: string;
}

export interface BookLogEvent {
  at: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface BookJobState {
  /** 出力の規格。今は kindle のみ */
  format: 'kindle';
  title: string;
  story: string;
  mood: string;
  totalPages: number;
  batchSize: number;
  /** 絵をどこで作ったか */
  backend: ImageBackend;
  /**
   * 最初に決めた構想（登場人物・章立て）。
   * ネームはバッチごとに作るので、これを毎回渡して人物と筋を揃える。
   * metadata.json に残るので、手で直してから再開することもできる。
   */
  outline?: StoryOutline;
  status: BookJobStatus;
  createdAt: string;
  updatedAt: string;
  /** ページの規格。metadata.json を見ただけで判型が分かるようにしておく */
  page: {
    widthPx: number;
    heightPx: number;
    dpi: number;
  };
  /** 完成 PDF の絶対パス */
  pdfPath?: string;
  pdfBytes?: number;
  /** PDF に使った JPEG の画質 */
  jpegQuality?: number;
  error?: string;
  pages: BookPageState[];
  events: BookLogEvent[];
}

/** 出来ぐあいの数え上げ。コンソールの進捗行に使う */
export interface BookCounts {
  done: number;
  failed: number;
  pending: number;
  /** 出来たページのコマ数の合計＝生成した絵の枚数 */
  panels: number;
}

export function countPages(state: BookJobState): BookCounts {
  const done = state.pages.filter((page) => page.status === 'done');
  const failed = state.pages.filter((page) => page.status === 'failed');
  return {
    done: done.length,
    failed: failed.length,
    pending: state.pages.length - done.length - failed.length,
    panels: done.reduce((sum, page) => sum + page.panelsCount, 0),
  };
}

/** 「12.3 MB」の形にする */
export function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return '-';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

/** 「60秒」「12分30秒」の形にする */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest === 0 ? `${minutes}分` : `${minutes}分${rest}秒`;
  const hours = Math.floor(minutes / 60);
  return `${hours}時間${minutes % 60}分`;
}

/** 「page-001.png」の形にする */
export function pageFileName(pageNumber: number): string {
  return `page-${String(Math.max(1, Math.round(pageNumber))).padStart(3, '0')}.png`;
}
