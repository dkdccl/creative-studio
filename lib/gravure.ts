/**
 * グラビアモードの型と、Amazon KDP 向けメタデータの組み立て。
 *
 * サーバー専用の処理は含めないこと（クライアントからも読む）。
 * Prodia の呼び出しは lib/prodia.ts 側にある。
 */

/** 一括生成で選べる枚数 */
export const BATCH_SIZES = [1, 5, 10, 20, 50] as const;
export type BatchSize = (typeof BATCH_SIZES)[number];

/**
 * 1 枚あたりの想定所要時間（秒）。
 * 残り時間の目安表示にだけ使う。実測ではない。
 */
export const SECONDS_PER_IMAGE = 25;

/**
 * 生成が続けて失敗したら打ち切る回数。
 * トークン切れや規約違反だと 50 枚ぶん全部失敗するので、
 * 延々と叩き続けないようにする。
 */
export const MAX_CONSECUTIVE_FAILURES = 3;

/** UI から選べるサイズ。FLUX.2 は 512〜1920 の範囲を受け付ける */
export const SIZE_PRESETS = [
  { label: '縦長 832×1216', width: 832, height: 1216 },
  { label: '縦長 768×1024', width: 768, height: 1024 },
  { label: '正方形 1024×1024', width: 1024, height: 1024 },
  { label: '横長 1216×832', width: 1216, height: 832 },
] as const;

export const STYLE_OPTIONS = [
  { value: 'photographic', label: '写真風' },
  { value: 'cinematic', label: 'シネマ風' },
  { value: 'analog-film', label: 'フィルム風' },
  { value: 'anime', label: 'アニメ風' },
  { value: 'digital-art', label: 'デジタルアート' },
  { value: 'fantasy-art', label: 'ファンタジー' },
] as const;

/** 1 回の生成に渡す設定。ステップ 1 で決めてステップ 2 で使う */
export interface PromptSettings {
  prompt: string;
  negativePrompt: string;
  stylePreset: string;
  width: number;
  height: number;
  steps: number;
  guidanceScale: number;
  /** 指定があれば 1 枚ごとに +1 して全部違う絵にする */
  baseSeed?: number;
}

export const DEFAULT_PROMPT_SETTINGS: PromptSettings = {
  prompt: '',
  negativePrompt: 'blurry, low quality, watermark, extra fingers',
  stylePreset: 'photographic',
  width: 832,
  height: 1216,
  steps: 28,
  guidanceScale: 4,
};

/** 生成できた 1 枚 */
export interface GravureShot {
  id: string;
  /** 1 始まりの通し番号 */
  index: number;
  /** 表示用の object URL。使い終わったら revoke する */
  objectUrl: string;
  blob: Blob;
  prompt: string;
  jobType: string;
  seed?: number;
}

/** 失敗した 1 枚 */
export interface GravureFailure {
  index: number;
  message: string;
}

// ---------------------------------------------------------------
// Amazon 向けメタデータ
// ---------------------------------------------------------------

export interface GravureMetadata {
  title: string;
  description: string;
  author: string;
  /** カンマ区切りで入力されたものをそのまま持つ */
  keywords: string;
  /** YYYY-MM-DD */
  publishDate: string;
  /** 円。整数で持つ */
  price: number;
}

export const EMPTY_METADATA: GravureMetadata = {
  title: '',
  description: '',
  author: '',
  keywords: '',
  publishDate: '',
  price: 500,
};

/**
 * AI 生成物として明示が必要な文言。
 *
 * Amazon KDP は AI 生成コンテンツの申告を求めており、
 * 実在人物と誤認させない表示も必要になる。
 * ここは編集させず、常に全文を出力に含める。
 */
export const REQUIRED_DISCLAIMERS = [
  'この作品に登場するすべての人物は AI によって生成されたイラストです。',
  '実在する人物ではありません。',
  '登場する人物はすべて 20 歳以上の設定です。',
] as const;

/** 確認用チェックリストの項目 */
export const CHECKLIST_ITEMS = [
  {
    id: 'disclaimers',
    label: '必須免責事項を作品説明に含めることを確認した',
    detail: '説明文の末尾に 3 つの文言が自動で追記されます。',
  },
  {
    id: 'ai-declaration',
    label: 'KDP の登録画面で「AI 生成コンテンツ」を申告する',
    detail: 'KDP はテキスト・画像・翻訳それぞれについて申告を求めています。',
  },
  {
    id: 'content-policy',
    label: '内容が Amazon のコンテンツガイドラインに沿っていることを確認した',
    detail: '規約違反と判断されると出版が却下されることがあります。',
  },
] as const;

export type ChecklistId = (typeof CHECKLIST_ITEMS)[number]['id'];

/** KDP のキーワード欄は 7 個まで */
export const MAX_KEYWORDS = 7;

export function parseKeywords(raw: string): string[] {
  return raw
    .split(/[,、]/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

/** 説明文の末尾に免責事項を足す。すでに入っていれば足さない */
export function withDisclaimers(description: string): string {
  const body = description.trim();
  const notice = REQUIRED_DISCLAIMERS.join('\n');
  if (body.includes(REQUIRED_DISCLAIMERS[0])) return body;
  return body ? `${body}\n\n---\n${notice}` : notice;
}

export interface KdpMetadata {
  title: string;
  author: string;
  /** 免責事項を含めた最終的な説明文 */
  description: string;
  keywords: string[];
  language: 'ja';
  publishDate: string;
  price: { amount: number; currency: 'JPY' };
  contentDisclaimers: string[];
  /** KDP 側で申告が必要なので明示しておく */
  aiGenerated: {
    images: true;
    provider: 'Prodia';
    jobType: string;
  };
  images: {
    fileName: string;
    index: number;
    seed?: number;
    prompt: string;
  }[];
  generatedAt: string;
}

/** ZIP 内のファイル名。通し番号は 3 桁でそろえる */
export function imageFileName(index: number): string {
  return `gravure-${String(index).padStart(3, '0')}.jpg`;
}

export function buildKdpMetadata(
  metadata: GravureMetadata,
  shots: GravureShot[],
): KdpMetadata {
  return {
    title: metadata.title.trim(),
    author: metadata.author.trim(),
    description: withDisclaimers(metadata.description),
    keywords: parseKeywords(metadata.keywords).slice(0, MAX_KEYWORDS),
    language: 'ja',
    publishDate: metadata.publishDate,
    price: { amount: Math.max(0, Math.round(metadata.price)), currency: 'JPY' },
    contentDisclaimers: [...REQUIRED_DISCLAIMERS],
    aiGenerated: {
      images: true,
      provider: 'Prodia',
      jobType: shots[0]?.jobType ?? '',
    },
    images: shots.map((shot) => ({
      fileName: imageFileName(shot.index),
      index: shot.index,
      seed: shot.seed,
      prompt: shot.prompt,
    })),
    generatedAt: new Date().toISOString(),
  };
}

/** 残り時間のざっくり表示 */
export function formatRemaining(seconds: number): string {
  if (seconds <= 0) return 'まもなく完了';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return `残り約 ${rest} 秒`;
  return `残り約 ${minutes} 分 ${String(rest).padStart(2, '0')} 秒`;
}
