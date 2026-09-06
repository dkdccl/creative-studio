/**
 * グラビアモードの型と、Amazon KDP 向けメタデータの組み立て。
 *
 * サーバー専用の処理は含めないこと（クライアントからも読む）。
 * Prodia の呼び出しは lib/prodia.ts 側にある。
 */

/** 1 回あたりの枚数の目安ボタン。ここに無い値も手入力で指定できる */
export const BATCH_SIZES = [1, 5, 10, 25, 50] as const;

/** 生成回数（セッション数）の目安ボタン。同じく手入力もできる */
export const SESSION_COUNTS = [1, 3, 5, 10, 50] as const;

/** 手入力で受け付ける上限。1 回 50 枚 × 50 回 = 2500 枚まで */
export const MAX_BATCH_SIZE = 50;
export const MAX_SESSIONS = 50;

/**
 * 1 枚あたりの想定所要時間（秒）。
 * FLUX.2 [dev] の実測が 3.4 秒前後だったので 4 秒で見積もる。
 * 待ち時間の目安表示にだけ使う。
 */
export const SECONDS_PER_IMAGE = 4;

/** 手入力を 1〜max の整数に収める。空欄や数字でないものは 1 にする */
export function clampCount(value: number, max: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(max, Math.max(1, Math.round(value)));
}

/**
 * セッションごとに differing テーマを足したいときの候補。
 * プロンプトの末尾に付けるだけなので、利用側で自由に足し引きできる。
 */
export const SESSION_THEME_PRESETS = [
  'on a sunny beach',
  'in a modern office',
  'in a city street at night',
  'in a quiet cafe',
  'in a hotel room',
  'in a park in spring',
  'by a swimming pool',
  'in a library',
  'on a rooftop at sunset',
  'in a train station',
] as const;

/**
 * セッション番号からそのセッションで足すテーマを選ぶ。
 * テーマが空なら何も足さない（毎回同じプロンプト）。
 */
export function themeForSession(themes: string[], session: number): string {
  if (themes.length === 0) return '';
  return themes[(session - 1) % themes.length];
}

/** プロンプトの末尾にテーマを足す */
export function withTheme(prompt: string, theme: string): string {
  const body = prompt.trim();
  if (!theme.trim()) return body;
  return `${body}, ${theme.trim()}`;
}

/**
 * 生成に使う種を決める。
 *
 * 開始シード値の指定があれば通し番号で 1 ずつずらす（同じ設定で
 * もう一度回すと同じ絵が出る）。指定が無ければ毎回ランダムに選ぶ。
 * 種を渡さないと Prodia 側で決まってしまい、あとで再現できないため
 * こちらで決めて記録する。
 */
export const MAX_SEED = 2_147_483_647;

export function seedFor(baseSeed: number | undefined, offset: number): number {
  if (baseSeed === undefined) return Math.floor(Math.random() * MAX_SEED);
  return Math.abs(Math.trunc(baseSeed) + offset) % MAX_SEED;
}

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

/**
 * 1 枚に 1 人だけを写させるための指示。
 *
 * アプリ側で画像を合成することはないので、4 分割のような絵が出るのは
 * モデルがそう描いたときだけ。プロンプトで単写真であることを明示して
 * 起きにくくする。
 */
export const SINGLE_SUBJECT_SUFFIX =
  'single subject, exactly one person, one single full-frame photograph, ' +
  'not a collage, not a grid, no split panels, no multiple frames, no borders';

/** ネガティブに入れられるモデル向け。上と同じ意図を否定側で書く */
export const COLLAGE_NEGATIVE =
  'collage, grid, multiple panels, split screen, contact sheet, photo montage, borders, frames';

/** 指示を足したプロンプトを作る */
export function withSingleSubject(prompt: string, enabled: boolean): string {
  const body = prompt.trim();
  if (!enabled || body === '') return body;
  if (body.includes('single subject')) return body;
  return `${body}, ${SINGLE_SUBJECT_SUFFIX}`;
}

/** 生成のやり方。テキストから作るか、参考画像から派生させるか */
export type GenerationMode = 'txt2img' | 'img2img';

/**
 * img2img で選べるモデル。
 *
 * klein は指示どおり既定にしているが、Prodia のスキーマ上 strength も
 * negative_prompt も持たない（SDXL img2img は両方持つので記載漏れではない）。
 * 派生度を調整したい場合は strength 対応のモデルを選ぶ。
 */
export const IMG2IMG_MODELS = [
  {
    value: 'inference.flux-2.klein.img2img.v1',
    label: 'FLUX.2 [klein]（低コスト）',
    supportsStrength: false,
    supportsNegativePrompt: false,
    steps: { min: 1, max: 4, default: 4 },
  },
  {
    value: 'inference.flux.dev.img2img.v2',
    label: 'FLUX.1 [dev]（ストレングス対応）',
    supportsStrength: true,
    supportsNegativePrompt: false,
    steps: { min: 1, max: 100, default: 28 },
  },
  {
    value: 'inference.sdxl.img2img.v1',
    label: 'SDXL（ストレングス + ネガティブ対応）',
    supportsStrength: true,
    supportsNegativePrompt: true,
    steps: { min: 1, max: 100, default: 25 },
  },
] as const;

export type Img2ImgModel = (typeof IMG2IMG_MODELS)[number]['value'];

export function img2imgModel(value: string) {
  return IMG2IMG_MODELS.find((model) => model.value === value) ?? IMG2IMG_MODELS[0];
}

/** アップロードを受け付ける形式 */
export const ACCEPTED_UPLOAD_TYPES = ['image/jpeg', 'image/png'] as const;

/** Prodia の入力画像は 1920x1920 まで */
export const MAX_UPLOAD_PIXELS = 1920;
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

/** 参考画像の上限。生成回数は 枚数 × 参考画像数 になるので歯止めを入れる */
export const MAX_REFERENCES = 10;


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

  // --- img2img のときだけ使う ---
  mode: GenerationMode;
  img2imgModel: Img2ImgModel;
  /** 参考画像からどれだけ離すか。0 に近いほど元画像寄り */
  strength: number;
  /** 1 枚 1 人を守らせる指示をプロンプトに足すか */
  enforceSingleSubject: boolean;
}

export const DEFAULT_PROMPT_SETTINGS: PromptSettings = {
  prompt: '',
  negativePrompt: 'blurry, low quality, watermark, extra fingers',
  stylePreset: 'photographic',
  width: 832,
  height: 1216,
  steps: 28,
  guidanceScale: 4,
  mode: 'txt2img',
  img2imgModel: 'inference.flux-2.klein.img2img.v1',
  strength: 0.7,
  enforceSingleSubject: true,
};

/** 生成できた 1 枚 */
export interface GravureShot {
  id: string;
  /** 1 始まりの通し番号 */
  index: number;
  /** 表示用の object URL。使い終わったら revoke する */
  objectUrl: string;
  blob: Blob;
  /** 実際に返ってきた画素数。PDF の DPI 計算に使う */
  width: number;
  height: number;
  prompt: string;
  jobType: string;
  seed?: number;
  /** どの参考画像から作ったか（1 始まり）。txt2img では未設定 */
  referenceIndex?: number;
  /** 何回目の生成（セッション）で作ったか（1 始まり） */
  session?: number;
  /** そのセッションでプロンプトに足したテーマ。足していなければ未設定 */
  theme?: string;
  /**
   * Supabase に保存済みなら gravure_images の行 id。
   * 保存処理はまだ入っていないので現状は常に未設定で、
   * 削除は「一覧から外す」だけになる。値が入っていれば
   * /api/gravure/delete-image で Storage とテーブルからも消す。
   */
  imageId?: string;
}

/** 失敗した 1 枚 */
export interface GravureFailure {
  index: number;
  /** どの参考画像でのぶんか（1 始まり） */
  referenceIndex?: number;
  /** 何回目の生成でのぶんか（1 始まり） */
  session?: number;
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
    /** どの参考画像から作ったか（img2img で複数指定したとき） */
    referenceIndex?: number;
    seed?: number;
    prompt: string;
  }[];
  generatedAt: string;
}

/**
 * ZIP 内のファイル名。通し番号は 3 桁でそろえる。
 * 参考画像が複数あるときは、どれ由来かが分かるよう番号を挟む。
 */
export function imageFileName(index: number, referenceIndex?: number): string {
  const numbered = String(index).padStart(3, '0');
  if (referenceIndex === undefined) return `gravure-${numbered}.jpg`;
  return `gravure-${String(referenceIndex).padStart(2, '0')}-${numbered}.jpg`;
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
    images: shots.map((shot, i) => ({
      // ZIP 内のファイル名と合わせる（除外ぶんを詰めた並び順）
      fileName: imageFileName(
        shot.referenceIndex === undefined
          ? i + 1
          : shots.filter((s, j) => j <= i && s.referenceIndex === shot.referenceIndex).length,
        shot.referenceIndex,
      ),
      index: i + 1,
      referenceIndex: shot.referenceIndex,
      seed: shot.seed,
      prompt: shot.prompt,
    })),
    generatedAt: new Date().toISOString(),
  };
}

/** 「3 分 20 秒」のような長さの表示。1 時間を超えたら時間から書く */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  if (hours > 0) return `${hours} 時間 ${minutes} 分`;
  if (minutes === 0) return `${rest} 秒`;
  return `${minutes} 分 ${String(rest).padStart(2, '0')} 秒`;
}

/** 残り時間のざっくり表示 */
export function formatRemaining(seconds: number): string {
  if (seconds <= 0) return 'まもなく完了';
  return `残り約 ${formatDuration(seconds)}`;
}
