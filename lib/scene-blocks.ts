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

/** 1 ページあたりの既定のコマ数。写真モードは 3 列 × 2 段で固定 */
export const PANELS_PER_PAGE = 6;

/** コマ割りの見た目（Tailwind クラス）。3x2 固定 */
export const PANEL_GRID_CLASS = 'grid-cols-3';

// ---------------------------------------------------------------
// コマ数（漫画モードはページごとに 4 / 5 / 6 から選べる）
// ---------------------------------------------------------------

/**
 * 1 ページのコマ数。
 *
 * 実際の漫画に合わせて 1 コマ（見開きの大ゴマ）から 9 コマ（細かい会話・アクション）
 * まで振れるようにしてある。AI 自動コマ割りはこの範囲から選ぶ。
 */
export type PanelCount = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** ページごとに選べるコマ数 */
export const PANEL_COUNT_OPTIONS: PanelCount[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** 選択がないときのコマ数 */
export const DEFAULT_PANEL_COUNT: PanelCount = 6;

export interface GridLayout {
  columns: number;
  rows: number;
  /** 「3×2」のような短い表記 */
  label: string;
  /** プロンプトに入れるコマ割りの説明 */
  description: string;
  /** 表示用の Tailwind グリッド列クラス */
  gridClass: string;
  /**
   * 最下段を横いっぱいに使うコマがあるか。
   * 5 コマは 2×2 の下に大ゴマを 1 つ置く構成なので true になる。
   */
  hasWideLastPanel: boolean;
}

/** コマ数からコマ割りの形を決める */
export function getGridLayout(panelsCount: PanelCount): GridLayout {
  switch (panelsCount) {
    case 1:
      return {
        columns: 1,
        rows: 1,
        label: '1コマ',
        description:
          'ページ全体を 1 つの大きなコマとして使う。見開きの大ゴマのように、余白なく画面いっぱいに描く',
        gridClass: 'grid-cols-1',
        hasWideLastPanel: false,
      };
    case 2:
      return {
        columns: 1,
        rows: 2,
        label: '1×2',
        description: '横幅いっぱいの横長のコマを、上下に 2 つ積む',
        gridClass: 'grid-cols-1',
        hasWideLastPanel: false,
      };
    case 3:
      return {
        columns: 1,
        rows: 3,
        label: '1×3',
        description: '横幅いっぱいの横長のコマを、上から下へ 3 段積む',
        gridClass: 'grid-cols-1',
        hasWideLastPanel: false,
      };
    case 4:
      return {
        columns: 2,
        rows: 2,
        label: '2×2',
        description: '2 列 × 2 行に、同じ大きさのコマを 4 つ並べる',
        gridClass: 'grid-cols-2',
        hasWideLastPanel: false,
      };
    case 5:
      return {
        columns: 2,
        rows: 3,
        label: '2×2+1',
        description:
          '上段と中段は 2 列 × 2 行の 4 コマ、その下に横幅いっぱいの大きなコマを 1 つ置いて合計 5 コマにする',
        gridClass: 'grid-cols-2',
        hasWideLastPanel: true,
      };
    case 7:
      return {
        columns: 3,
        rows: 3,
        label: '3×2+1',
        description:
          '上段と中段は 3 列 × 2 行の 6 コマ、その下に横幅いっぱいの大きなコマを 1 つ置いて合計 7 コマにする',
        gridClass: 'grid-cols-3',
        hasWideLastPanel: true,
      };
    case 8:
      return {
        columns: 4,
        rows: 2,
        label: '4×2',
        description: '4 列 × 2 行に、同じ大きさの細かいコマを 8 つ並べる',
        gridClass: 'grid-cols-4',
        hasWideLastPanel: false,
      };
    case 9:
      return {
        columns: 3,
        rows: 3,
        label: '3×3',
        description: '3 列 × 3 行に、同じ大きさの細かいコマを 9 つ並べる',
        gridClass: 'grid-cols-3',
        hasWideLastPanel: false,
      };
    case 6:
    default:
      return {
        columns: 3,
        rows: 2,
        label: '3×2',
        description: '3 列 × 2 行に、同じ大きさのコマを 6 つ並べる',
        gridClass: 'grid-cols-3',
        hasWideLastPanel: false,
      };
  }
}

/**
 * コマ割りを「格子の部分」と「最下段の大ゴマ」に分けた形。
 *
 * 5 コマ・7 コマは最下段だけ横いっぱいの大ゴマなので、
 * 吹き出しの配置でもプレビューでもこの分け方が要る。
 */
export interface GridShape {
  columns: number;
  /** 大ゴマを含めた行数 */
  rows: number;
  /** 格子として並ぶ行数（大ゴマの行を除いた数） */
  gridRows: number;
  hasWideLastPanel: boolean;
}

/** コマ数から格子の形を出す */
export function getGridShape(panelsCount: PanelCount): GridShape {
  const { columns, rows, hasWideLastPanel } = getGridLayout(panelsCount);
  return {
    columns,
    rows,
    gridRows: hasWideLastPanel ? rows - 1 : rows,
    hasWideLastPanel,
  };
}

/** 想定外の値が来ても 1〜9 のどれかに落とす */
export function normalizePanelCount(value: unknown): PanelCount {
  const n = Math.round(Number(value));
  return (PANEL_COUNT_OPTIONS as number[]).includes(n)
    ? (n as PanelCount)
    : DEFAULT_PANEL_COUNT;
}

// ---------------------------------------------------------------
// シーン種別（AI 自動コマ割り）
// ---------------------------------------------------------------

/**
 * ストーリーの場面の種類。
 * 実際の漫画と同じで、場面の性質がそのままコマの大きさ・数になる。
 */
export const SCENE_TYPES = ['感動', '会話', 'アクション', '景色', '表情'] as const;

export type SceneType = (typeof SCENE_TYPES)[number];

/** 判定できなかったときのシーン種別 */
export const DEFAULT_SCENE_TYPE: SceneType = '会話';

/** シーン種別ごとの既定のコマ数 */
export const SCENE_FRAME_COUNTS: Record<SceneType, PanelCount> = {
  感動: 1, // 見開きの大ゴマで魅せる
  会話: 6, // 細かく割ってテンポを出す
  アクション: 8, // 動きの連続を刻む
  景色: 2, // 背景を大きく見せる
  表情: 4, // 中くらいのコマで感情を追う
};

/**
 * シーン種別ごとに許すコマ数の幅。
 * AI が返した推奨コマ数がこの範囲に収まっていればそちらを優先し、
 * 外れていたら SCENE_FRAME_COUNTS の既定値に落とす。
 */
export const SCENE_FRAME_RANGES: Record<SceneType, [PanelCount, PanelCount]> = {
  感動: [1, 2],
  会話: [6, 8],
  アクション: [7, 9],
  景色: [1, 3],
  表情: [3, 5],
};

/** UI とプロンプトで使う、シーン種別の短い説明 */
export const SCENE_TYPE_DESCRIPTIONS: Record<SceneType, string> = {
  感動: '感動・物語の山場。大ゴマ 1〜2 コマで見せる',
  会話: '会話のやりとり。6〜8 コマに細かく割る',
  アクション: '動き・戦い。7〜9 コマで連続させる',
  景色: '景色・情景描写。1〜3 コマの大きなコマで見せる',
  表情: 'キャラの表情アップ。3〜5 コマで感情を追う',
};

/** 画像プロンプトに足す、場面ごとの演出指示 */
export const SCENE_DIRECTION_RULES: Record<SceneType, string> = {
  感動:
    '物語の山場なので、引きの構図で大きく見せ、背景や効果線で感情を強調すること。',
  会話:
    '人物のやりとりが中心。バストアップと切り返しを混ぜ、コマを細かく割ってテンポを出すこと。',
  アクション:
    '動きの連続を見せる。アングルを変え、効果線・スピード線・大きな動作で勢いを出すこと。',
  景色:
    '情景そのものを見せる。人物は小さく、または入れず、背景を丁寧に描き込むこと。',
  表情:
    'キャラクターの表情のアップが中心。顔の寄りを多くし、目や口の描き分けで感情を伝えること。',
};

/** UI 用の絵文字 */
export const SCENE_TYPE_EMOJI: Record<SceneType, string> = {
  感動: '💫',
  会話: '💬',
  アクション: '💥',
  景色: '🏞️',
  表情: '😶',
};

/** 想定外の値が来てもシーン種別のどれかに落とす */
export function normalizeSceneType(value: unknown): SceneType {
  const text = String(value ?? '').trim();
  return (SCENE_TYPES as readonly string[]).includes(text)
    ? (text as SceneType)
    : DEFAULT_SCENE_TYPE;
}

/** シーン種別からコマ数を決める */
export function getAutoFrameCount(sceneType: SceneType): PanelCount {
  return SCENE_FRAME_COUNTS[normalizeSceneType(sceneType)];
}

/**
 * AI が返した推奨コマ数を採用するか決める。
 *
 * シーン種別に対して極端な数（会話なのに 1 コマ等）を返してくることがあるので、
 * 種別ごとの範囲に収まっているときだけ採用し、外れていれば既定値に落とす。
 */
export function resolveFrameCount(
  sceneType: SceneType,
  recommendedFrames: unknown,
): PanelCount {
  const type = normalizeSceneType(sceneType);
  const [min, max] = SCENE_FRAME_RANGES[type];
  const n = Math.round(Number(recommendedFrames));
  if (Number.isFinite(n) && n >= min && n <= max) {
    return normalizePanelCount(n);
  }
  return getAutoFrameCount(type);
}

export interface PageConfig {
  pageNumber: number;
  panelsCount: PanelCount;
  /**
   * AI 自動コマ割りで判定した場面の種類。
   * 手動でコマ数を選んだときは入らない。
   */
  sceneType?: SceneType;
  /** そのコマ数にした理由（AI 判定のときだけ） */
  reason?: string;
}

/** 全ページを既定のコマ数にした設定を作る */
export function defaultPageConfigs(pages: number): PageConfig[] {
  return Array.from({ length: clampPages(pages) }, (_, i) => ({
    pageNumber: i + 1,
    panelsCount: DEFAULT_PANEL_COUNT,
  }));
}

/**
 * ページ数が変わったときに設定を作り直す。
 * すでに選んであるページのコマ数は引き継ぎ、増えたぶんは既定値で埋める。
 */
export function resizePageConfigs(
  configs: PageConfig[],
  pages: number,
): PageConfig[] {
  return Array.from({ length: clampPages(pages) }, (_, i) => ({
    pageNumber: i + 1,
    panelsCount:
      configs.find((c) => c.pageNumber === i + 1)?.panelsCount ??
      DEFAULT_PANEL_COUNT,
  }));
}

/** 「ページ 1: 6コマ (3×2)」の形の説明文 */
export function pageConfigLabel(config: PageConfig): string {
  return `ページ ${config.pageNumber}: ${config.panelsCount}コマ (${
    getGridLayout(config.panelsCount).label
  })`;
}

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

/** 漫画モードで選べるページ数。1 ページずつ生成するので上限は控えめにする */
export const MANGA_PAGE_OPTIONS = [1, 2, 3, 4, 5];

/** 漫画の雰囲気の候補 */
export const MANGA_MOODS = [
  'シリアス',
  'コミカル',
  'ホラー',
  '幻想的',
  '日常',
  'バトル',
] as const;

/**
 * ストーリーをページ数ぶんに切り分ける。
 *
 * 画像モデルは 1 回の呼び出しで 1 枚しか返さないので、ページごとに
 * 「そのページで描く場面」を渡す必要がある。文（。！？と改行）を単位に、
 * できるだけ均等になるよう先頭のページから配る。
 *
 * 文の数がページ数に足りないときは、どのページにも全文を渡して
 * どこを描くかはモデルに任せる（無理に薄く割るより破綻しにくい）。
 */
export function splitStoryByPages(story: string, totalPages: number): string[] {
  const pages = clampPages(totalPages);
  const trimmed = story.trim();

  // 文末記号を含めたまま区切る（記号で終わらない末尾も 1 文として拾う）
  const sentences = (trimmed.match(/[^。．！？!?\n]*[。．！？!?\n]|[^。．！？!?\n]+/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== '');

  if (sentences.length < pages) {
    return Array.from({ length: pages }, () => trimmed);
  }

  const result: string[] = [];
  let cursor = 0;
  for (let i = 0; i < pages; i += 1) {
    const remainingPages = pages - i;
    const take = Math.ceil((sentences.length - cursor) / remainingPages);
    result.push(sentences.slice(cursor, cursor + take).join(''));
    cursor += take;
  }
  return result;
}

export interface MangaPromptOptions {
  /** ストーリー全体。ページごとの場面はここから切り出す */
  story: string;
  /** 何ページ目か（1 始まり） */
  pageNumber: number;
  /** 全体のページ数 */
  totalPages: number;
  /** このページのコマ数。4 / 5 / 6 から選ぶ */
  panelsCount: PanelCount;
  mood: string;
  /**
   * AI 自動コマ割りで判定した場面の種類。
   * 渡すと「大ゴマで魅せる」「細かく刻む」といった演出の指示も一緒に入る。
   */
  sceneType?: SceneType;
  /** 吹き出しやオノマトペの言語。既定は日本語 */
  language?: string;
  /**
   * 画像に文字を描かせないようにする。
   * セリフをあとから Canvas で重ねるときに使う（二重になるのを防ぐ）。
   */
  withoutText?: boolean;
}

/**
 * 画像モデルに渡す 1 ページぶんのプロンプトを組み立てる。
 *
 * 1 回の呼び出し = 1 ページなので、何ページ目なのか・何コマなのか・
 * そのページで描く場面をプロンプト側に明記する。
 * コマ数はモデルが勝手に増減しやすいので、数と行列をくどいくらい繰り返す。
 */
export function buildMangaGenerationPrompt({
  story,
  pageNumber,
  totalPages,
  panelsCount,
  mood,
  sceneType,
  language = '日本語',
  withoutText = false,
}: MangaPromptOptions): string {
  const pages = clampPages(totalPages);
  const current = Math.min(Math.max(1, Math.round(pageNumber) || 1), pages);
  const panels = normalizePanelCount(panelsCount);
  const grid = getGridLayout(panels);
  const segment = splitStoryByPages(story, pages)[current - 1] ?? story.trim();

  // セリフをあとから重ねる場合は、絵の中に文字を描かせない
  const textRule = withoutText
    ? [
        '重要: 文字を一切描かないこと。セリフ・吹き出し・擬音・看板の文字・効果音など、',
        'あらゆる文字を画面に入れてはいけない。絵だけで表現すること。',
        'セリフはあとから別途重ねるので、各コマの上部に少し空きスペースを残すこと。',
      ].join('')
    : null;

  // 場面の種類が分かっているときは、コマ数の意図まで伝えて演出を寄せる
  const sceneRule = sceneType
    ? `このページの場面: ${sceneType}（${SCENE_TYPE_DESCRIPTIONS[sceneType]}）。${SCENE_DIRECTION_RULES[sceneType]}`
    : null;

  return [
    `${language}の漫画。ページ ${current} / 全 ${pages} ページ。`,
    `このページのコマ数は ちょうど ${panels}コマ (EXACTLY ${panels} panels)。`,
    panels === 1
      ? 'ページ全体を 1 つの大きなコマにする。分割線を入れず、画面いっぱいに 1 場面だけを描く。'
      : `コマ割りは ${grid.columns}列 × ${grid.rows}行。${grid.description}。`,
    `コマの枠線をはっきり描き、${panels} コマすべてを絵で埋める。`,
    `絶対に ${panels} コマ以外の数にしないこと。コマを増やしても減らしてもいけない。`,
    sceneRule,
    `雰囲気: ${mood}`,
    `全体のストーリー: ${story.trim()}`,
    `このページで描く場面: ${segment}`,
    textRule,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}
