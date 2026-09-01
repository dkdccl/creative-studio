import type { Scene, SceneBlockKind } from './types';

/**
 * 本文に埋め込むビジュアルブロックのマーカー。
 *
 * 形式： [🎨 漫画シーン N] / [📸 写真シーン N]
 *
 * 本文はプレーンテキストのままにしておきたいので、画像は Scene.blocks に持ち、
 * 本文にはこのマーカーだけを差し込む。
 */

export const BLOCK_LABELS: Record<SceneBlockKind, string> = {
  manga: '🎨 漫画シーン',
  photo: '📸 写真シーン',
};

export const BLOCK_NAMES: Record<SceneBlockKind, string> = {
  manga: '漫画シーン',
  photo: '写真シーン',
};

/** 番号からマーカー文字列を作る */
export function blockMarker(kind: SceneBlockKind, n: number): string {
  return `[${BLOCK_LABELS[kind]} ${n}]`;
}

/** 毎回作り直して lastIndex を持ち越さないようにする */
function markerPattern(kind: SceneBlockKind): RegExp {
  return kind === 'manga'
    ? /\[🎨 漫画シーン (\d+)\]/g
    : /\[📸 写真シーン (\d+)\]/g;
}

/** 本文に含まれるマーカー番号を出現順に返す */
export function findMarkerNumbers(text: string, kind: SceneBlockKind): number[] {
  return [...text.matchAll(markerPattern(kind))].map((match) =>
    Number(match[1]),
  );
}

/**
 * 次に振る番号。
 * 削除しても本文のマーカーは残す仕様なので、本文と保持中のブロックの
 * 両方を見て最大値 + 1 にし、番号が重複しないようにする。
 */
export function nextMarkerNumber(scene: Scene, kind: SceneBlockKind): number {
  const used = [
    ...findMarkerNumbers(scene.body, kind),
    ...scene.blocks.filter((b) => b.kind === kind).map((b) => b.number),
  ];
  return used.length === 0 ? 1 : Math.max(...used) + 1;
}

/** 画像を削除した結果、対応するブロックがなくなったマーカーの番号 */
export function orphanMarkerNumbers(
  scene: Scene,
  kind: SceneBlockKind,
): number[] {
  const alive = new Set(
    scene.blocks.filter((b) => b.kind === kind).map((b) => b.number),
  );
  return [...new Set(findMarkerNumbers(scene.body, kind))].filter(
    (n) => !alive.has(n),
  );
}

// ---------------------------------------------------------------
// 本文をマーカーで区切る
// ---------------------------------------------------------------

export interface BodyTextPart {
  type: 'text';
  value: string;
  /** 本文中の開始位置 */
  start: number;
}

export interface BodyMarkerPart {
  type: 'marker';
  kind: SceneBlockKind;
  number: number;
  raw: string;
  start: number;
}

export type BodyPart = BodyTextPart | BodyMarkerPart;

/**
 * 本文を「テキスト」と「マーカー」に分解する。
 * マーカーの位置にカードを挟んで表示するために使う。
 * テキストは空でも必ず挟むので、マーカーの前後には必ず入力欄ができる。
 */
export function parseBodyParts(body: string): BodyPart[] {
  const pattern = /\[(🎨 漫画シーン|📸 写真シーン) (\d+)\]/g;
  const parts: BodyPart[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(body)) !== null) {
    parts.push({ type: 'text', value: body.slice(last, match.index), start: last });
    parts.push({
      type: 'marker',
      kind: match[1] === BLOCK_LABELS.manga ? 'manga' : 'photo',
      number: Number(match[2]),
      raw: match[0],
      start: match.index,
    });
    last = match.index + match[0].length;
  }
  parts.push({ type: 'text', value: body.slice(last), start: last });

  return parts;
}

/** テキスト部分だけを差し替えた本文を作る */
export function replaceTextPart(
  body: string,
  part: BodyTextPart,
  next: string,
): string {
  return (
    body.slice(0, part.start) + next + body.slice(part.start + part.value.length)
  );
}

/** カーソル位置にマーカーを差し込む。前後を改行で区切って本文から浮かせる */
export function insertMarkerAt(
  body: string,
  position: number,
  marker: string,
): string {
  const at = Math.max(0, Math.min(position, body.length));
  const before = body.slice(0, at);
  const after = body.slice(at);
  const prefix = before === '' || before.endsWith('\n') ? '' : '\n';
  const suffix = after === '' || after.startsWith('\n') ? '' : '\n';
  return `${before}${prefix}${marker}${suffix}${after}`;
}

// ---------------------------------------------------------------
// ページ構成（漫画・写真で共通）
// ---------------------------------------------------------------

/** 1 ページあたりのコマ数。3 列 × 2 段で固定 */
export const PANELS_PER_PAGE = 6;

/** コマ割りの見た目（Tailwind クラス）。3x2 固定 */
export const PANEL_GRID_CLASS = 'grid-cols-3';

/** カスタム入力で受け付けるページ数の範囲 */
export const MIN_PAGES = 1;
export const MAX_PAGES = 50;

export type PagePresetId = 'short' | 'medium' | 'long' | 'custom';

export interface PagePreset {
  id: PagePresetId;
  label: string;
  /** 選べるページ数。カスタムは自由入力なので空 */
  pages: number[];
}

export const PAGE_PRESETS: PagePreset[] = [
  { id: 'short', label: '短編', pages: [1, 2] },
  { id: 'medium', label: '中編', pages: [4, 5, 6] },
  { id: 'long', label: '長編', pages: [8, 9, 10, 11, 12] },
  { id: 'custom', label: 'カスタム', pages: [] },
];

/** プリセットの説明（「短編（1-2ページ）」の括弧の中） */
export function pagePresetRangeLabel(preset: PagePreset): string {
  if (preset.pages.length === 0) return `${MIN_PAGES}-${MAX_PAGES}ページ`;
  const first = preset.pages[0];
  const last = preset.pages[preset.pages.length - 1];
  return first === last ? `${first}ページ` : `${first}-${last}ページ`;
}

/** そのページ数に必要なコマ数（＝写真の枚数） */
export function panelsForPages(pages: number): number {
  return pages * PANELS_PER_PAGE;
}

/** ページ数を許容範囲に収める */
export function clampPages(pages: number): number {
  return Math.min(MAX_PAGES, Math.max(MIN_PAGES, Math.round(pages) || MIN_PAGES));
}

/** 範囲外・非整数のときに出すメッセージ */
export const PAGE_RANGE_MESSAGE = `${MIN_PAGES}から${MAX_PAGES}の間で入力してください`;

/**
 * カスタム入力の検証。
 * 整数のみ・1〜50 の範囲であることを確かめる。
 * 未入力は「まだ決まっていない」扱いで、メッセージは出さずに無効とする。
 */
export function validateCustomPages(input: string): {
  pages: number | null;
  error: string | null;
} {
  const trimmed = input.trim();
  if (trimmed === '') {
    return { pages: null, error: null };
  }
  if (!/^\d+$/.test(trimmed)) {
    return { pages: null, error: PAGE_RANGE_MESSAGE };
  }
  const pages = Number(trimmed);
  if (pages < MIN_PAGES || pages > MAX_PAGES) {
    return { pages: null, error: PAGE_RANGE_MESSAGE };
  }
  return { pages, error: null };
}

// ---------------------------------------------------------------
// 漫画シーンの生成
// ---------------------------------------------------------------

/** 漫画の雰囲気の候補 */
export const MANGA_MOODS = [
  'シリアス',
  'コミカル',
  'ホラー',
  '幻想的',
  '日常',
  'バトル',
] as const;

/** DALL-E に渡すプロンプトを組み立てる */
export function buildMangaGenerationPrompt({
  story,
  pages,
  mood,
}: {
  story: string;
  pages: number;
  mood: string;
}): string {
  return `${story}、${pages}ページ分、1ページ6コマ(3x2)、${mood}`;
}
