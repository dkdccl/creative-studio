/**
 * Creative Studio の共通ドメイン型。
 * 小説モード（5 ステップ）で扱うデータ構造をここに集約する。
 */

// ---------------------------------------------------------------
// Step 1: テーマ・ジャンル
// ---------------------------------------------------------------

/** 視点 */
export type Pov = 'first' | 'third-limited' | 'third-omniscient';

/** 文体 */
export type Tone = 'dearu' | 'desumasu';

/** 想定分量 */
export type TargetLength = 'short' | 'medium' | 'long';

export interface NovelTheme {
  title: string;
  genres: string[];
  logline: string;
  theme: string;
  pov: Pov;
  tone: Tone;
  targetLength: TargetLength;
}

export const GENRES = [
  'ファンタジー',
  'SF',
  'ミステリー',
  '恋愛',
  'ホラー',
  '日常',
  '歴史',
  '青春',
  'サスペンス',
  'コメディ',
] as const;

export const POV_LABELS: Record<Pov, string> = {
  first: '一人称（僕・私）',
  'third-limited': '三人称一元視点',
  'third-omniscient': '三人称神視点',
};

export const TONE_LABELS: Record<Tone, string> = {
  dearu: 'である調',
  desumasu: 'ですます調',
};

export const TARGET_LENGTH_LABELS: Record<TargetLength, string> = {
  short: '短編（〜1万字）',
  medium: '中編（1〜5万字）',
  long: '長編（5万字〜）',
};

/** 目安文字数（進捗バーの分母） */
export const TARGET_LENGTH_CHARS: Record<TargetLength, number> = {
  short: 10000,
  medium: 30000,
  long: 80000,
};

// ---------------------------------------------------------------
// Step 2: キャラクター
// ---------------------------------------------------------------

export type CharacterRole = '主人公' | '相棒' | '敵役' | 'ヒロイン' | '脇役';

export const CHARACTER_ROLES: CharacterRole[] = [
  '主人公',
  '相棒',
  '敵役',
  'ヒロイン',
  '脇役',
];

export interface Character {
  id: string;
  name: string;
  role: CharacterRole;
  age: string;
  appearance: string;
  personality: string;
  background: string;
  goal: string;
}

// ---------------------------------------------------------------
// Step 3-4: プロット（三幕構成）と本文
// ---------------------------------------------------------------

export type ActId = 'act1' | 'act2' | 'act3';

export const ACTS: { id: ActId; label: string; hint: string }[] = [
  { id: 'act1', label: '第一幕：設定', hint: '日常・事件の発端・旅立ち' },
  { id: 'act2', label: '第二幕：対立', hint: '試練・仲間・中間点・どん底' },
  { id: 'act3', label: '第三幕：解決', hint: 'クライマックス・結末・余韻' },
];

// --- 本文に挿入するビジュアルブロック ---------------------------
//
// 本文はプレーンテキストのまま扱いたいので、画像そのものは Scene.blocks に持ち、
// 本文には [🎨 漫画シーン N] / [📸 写真シーン N] のマーカーだけを差し込む。
// N と SceneBlock.number が対応する。

export type SceneBlockKind = 'manga' | 'photo';

/** DALL-E で生成した漫画シーン */
export interface MangaSceneBlock {
  kind: 'manga';
  id: string;
  /** マーカー [🎨 漫画シーン N] の N */
  number: number;
  imageUrl: string;
  /** 生成に使った物語の説明 */
  story: string;
  /** ページ数（1〜4） */
  pages: number;
  /** 漫画の雰囲気 */
  mood: string;
}

/** アップロードした写真を 1ページ 6コマ（3x2）で並べた写真シーン */
export interface PhotoSceneBlock {
  kind: 'photo';
  id: string;
  /** マーカー [📸 写真シーン N] の N */
  number: number;
  /** ページ数（1〜4） */
  pages: number;
  /** 縮小して data URL 化した写真。pages × 6 枚 */
  photos: string[];
  caption: string;
}

export type SceneBlock = MangaSceneBlock | PhotoSceneBlock;

export interface Scene {
  id: string;
  act: ActId;
  title: string;
  summary: string;
  characterIds: string[];
  /** Step 4 の執筆エディタで書く本文 */
  body: string;
  /** 本文に挿入した漫画シーン・写真シーン（挿入順） */
  blocks: SceneBlock[];
}

/** シーンを幕の順（第一幕 → 第二幕 → 第三幕）に並べ替える */
export function sortScenesByAct(scenes: Scene[]): Scene[] {
  return ACTS.flatMap(({ id }) => scenes.filter((scene) => scene.act === id));
}

// ---------------------------------------------------------------
// プロジェクト全体
// ---------------------------------------------------------------

/** 連載設定（新規シリーズか、既存シリーズの続きか） */
export interface SerialSettings {
  mode: 'new' | 'continue';
  /** 既存シリーズを選んだときの ID */
  seriesId: string | null;
  /** 新規シリーズのときに入力する名前 */
  seriesName: string;
  /** 何話目か */
  episode: number;
}

export interface NovelProject {
  version: 1;
  updatedAt: string;
  serial: SerialSettings;
  theme: NovelTheme;
  characters: Character[];
  scenes: Scene[];
}

export function createEmptyNovelProject(): NovelProject {
  return {
    version: 1,
    updatedAt: '',
    serial: {
      mode: 'new',
      seriesId: null,
      seriesName: '',
      episode: 1,
    },
    theme: {
      title: '',
      genres: [],
      logline: '',
      theme: '',
      pov: 'third-limited',
      tone: 'dearu',
      targetLength: 'short',
    },
    characters: [],
    scenes: [],
  };
}
