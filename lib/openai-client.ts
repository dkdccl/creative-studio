import 'server-only';
import OpenAI from 'openai';
import { assertOpenAIConfig, config } from './config';
import {
  DEFAULT_SCENE_TYPE,
  SCENE_TYPES,
  SCENE_TYPE_DESCRIPTIONS,
  normalizePanelCount,
  normalizeSceneType,
  resolveFrameCount,
  type PanelCount,
  type SceneType,
} from './scene-blocks';

let client: OpenAI | null = null;

export { isOpenAIConfigured } from './config';

export function getOpenAIClient(): OpenAI {
  const { apiKey } = assertOpenAIConfig();
  if (!client) {
    client = new OpenAI({ apiKey });
  }
  return client;
}

export type ImageSize =
  | '1024x1024'
  | '1024x1792'
  | '1792x1024'
  | '1024x1536'
  | '1536x1024';
export type ImageQuality = 'standard' | 'hd';
export type ImageStyle = 'vivid' | 'natural';

export interface GenerateTextOptions {
  /** 役割の指示 */
  system: string;
  /** 実際に書かせたい内容 */
  user: string;
}

/**
 * テキストを生成する。モデルは OPENAI_TEXT_MODEL で切り替える。
 *
 * temperature や max_tokens は送っていない。モデルによって受け付ける引数が違い、
 * 対応していないものを送ると Unknown parameter で 400 になるため、
 * 長さの指定はプロンプトの中で伝えている。
 */
export async function generateText({
  system,
  user,
}: GenerateTextOptions): Promise<string> {
  const openai = getOpenAIClient();

  const response = await openai.chat.completions.create({
    model: config.openai.textModel,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  return response.choices[0]?.message?.content?.trim() ?? '';
}

// ---------------------------------------------------------------
// 単行本のネーム作り
// ---------------------------------------------------------------

/** 1 ページぶんの設計 */
export interface MangaPagePlan {
  pageNumber: number;
  /** そのページで描く場面。画像プロンプトの素になる */
  description: string;
  sceneType: SceneType;
  panelsCount: PanelCount;
  /** そのコマ数にした理由 */
  reason?: string;
  /** コマ順のセリフ。セリフのないコマは空文字 */
  dialogues: string[];
}

export interface PlanMangaPagesOptions {
  title: string;
  /** あらすじ。無ければタイトルから膨らませる */
  story?: string;
  mood: string;
  /** 何ページ目から何ページ目までを設計するか */
  from: number;
  to: number;
  totalPages: number;
  /** 直前までの流れ。バッチをまたいでも話が繋がるように渡す */
  previously?: string;
}

/** 1 コマぶんのセリフの上限。長いと吹き出しに収まらない */
const MAX_DIALOGUE_LENGTH = 24;

const PLAN_SYSTEM_PROMPT = [
  'あなたは漫画のネーム（コマ割りと構成）を作る編集者兼脚本家です。',
  'タイトルとあらすじから 1 冊ぶんの物語を組み立て、ページごとに',
  '「何を描くか」「場面の種類」「コマ数」「各コマのセリフ」を決めます。',
  '出力は JSON 配列だけ。説明・見出し・コードフェンスは一切書きません。',
].join('\n');

const SCENE_CRITERIA = [
  '【コマ数の基準】',
  '1. 感動・重要シーン → 大きなコマ（1〜2コマ/ページ）',
  '2. 会話シーン → 細かいコマ（6〜8コマ/ページ）',
  '3. アクション・動き → 複雑なコマ（7〜9コマ/ページ）',
  '4. 景色描写 → 大きなコマ（1〜3コマ/ページ）',
  '5. キャラ表情アップ → 中〜大（3〜5コマ/ページ）',
].join('\n');

const SCENE_TYPE_LIST = SCENE_TYPES.map(
  (type) => `- ${type}: ${SCENE_TYPE_DESCRIPTIONS[type]}`,
).join('\n');

/** 応答から JSON 配列を取り出す。取れなければ null */
function parsePlanArray(response: string): unknown[] | null {
  const match = response.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** セリフ配列をコマ数ぴったりに整える */
function fitDialogues(raw: unknown, panelsCount: number): string[] {
  const list = Array.isArray(raw) ? raw : [];
  const cleaned = list
    .filter((d) => d !== null && d !== undefined)
    .map((d) => String(d).trim().slice(0, MAX_DIALOGUE_LENGTH))
    .slice(0, panelsCount);
  while (cleaned.length < panelsCount) cleaned.push('');
  return cleaned;
}

/**
 * ページ範囲ぶんのネームを作る。
 *
 * 120 ページを一度に頼むと配列が長すぎて壊れるので、
 * バッチ（既定 10 ページ）ごとに区切って呼ぶ。
 * 前のバッチの流れは previously で渡して話を繋げる。
 *
 * 失敗しても本作りは止めたくないので、投げずに既定値で埋めて返す。
 */
export async function planMangaPages({
  title,
  story,
  mood,
  from,
  to,
  totalPages,
  previously,
}: PlanMangaPagesOptions): Promise<MangaPagePlan[]> {
  const count = to - from + 1;

  const user = [
    `【作品タイトル】\n${title}`,
    story?.trim() ? `【あらすじ】\n${story.trim()}` : '【あらすじ】\nタイトルから膨らませてください。',
    `【雰囲気】\n${mood}`,
    `【全体の長さ】\n全 ${totalPages} ページ`,
    `【今回作るページ】\n${from} 〜 ${to} ページ目（${count} ページ）`,
    previously ? `【ここまでの流れ】\n${previously}` : null,
    `【場面の種類】\n${SCENE_TYPE_LIST}`,
    SCENE_CRITERIA,
    [
      '【条件】',
      `- 要素数はちょうど ${count} 個。pageNumber は ${from} から ${to} まで順に振ること`,
      `- 物語全体で ${totalPages} ページに収まるよう、この範囲の進み具合を配分すること`,
      '- 全ページを同じ種類にせず、緩急をつけること',
      '- description は「そのページで描く絵」を 60 文字以内の日本語で。人物・場所・動作を具体的に',
      '- dialogues の要素数は recommendedFrames と同じにすること',
      `- セリフは 1 つ ${MAX_DIALOGUE_LENGTH} 文字以内。セリフのないコマは空文字 ""`,
      '- reason は 30 文字以内',
    ].join('\n'),
    [
      '【出力形式】',
      'JSON 配列のみ。例:',
      `[{"pageNumber": ${from}, "description": "深夜のオフィス、机に残る彼女を遠くから見る主人公",`,
      '  "sceneType": "景色", "recommendedFrames": 2, "reason": "舞台を見せる導入",',
      '  "dialogues": ["", "まだ残ってるのか…"]}]',
    ].join('\n'),
  ]
    .filter((line): line is string => line !== null)
    .join('\n\n');

  /** 取れなかったページを埋める */
  const fallback = (pageNumber: number): MangaPagePlan => ({
    pageNumber,
    description: story?.trim() || title,
    sceneType: DEFAULT_SCENE_TYPE,
    panelsCount: resolveFrameCount(DEFAULT_SCENE_TYPE, undefined),
    dialogues: [],
  });

  let parsed: unknown[] | null = null;
  try {
    const started = Date.now();
    const response = await generateText({
      system: PLAN_SYSTEM_PROMPT,
      user,
    });
    console.log(`🧠 ${from}〜${to} ページのネーム作成 ${Date.now() - started}ms`);
    parsed = parsePlanArray(response);
    if (!parsed) {
      console.error('❌ ネームの JSON を取り出せませんでした:', response.slice(0, 200));
    }
  } catch (error) {
    console.error('❌ ネーム作成に失敗:', error);
  }

  if (!parsed) {
    return Array.from({ length: count }, (_, i) => fallback(from + i));
  }

  const items = parsed;
  const asRecord = (value: unknown): Record<string, unknown> | null =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;

  return Array.from({ length: count }, (_, i) => {
    const pageNumber = from + i;
    const raw =
      items
        .map(asRecord)
        .find((item) => item && Math.round(Number(item.pageNumber)) === pageNumber) ??
      asRecord(items[i]);

    if (!raw) return fallback(pageNumber);

    const sceneType = normalizeSceneType(raw.sceneType);
    const panelsCount = resolveFrameCount(
      sceneType,
      raw.recommendedFrames ?? raw.panelsCount,
    );
    const description =
      typeof raw.description === 'string' && raw.description.trim()
        ? raw.description.trim().slice(0, 120)
        : fallback(pageNumber).description;
    const reason =
      typeof raw.reason === 'string' && raw.reason.trim()
        ? raw.reason.trim().slice(0, 60)
        : undefined;

    return {
      pageNumber,
      description,
      sceneType,
      panelsCount: normalizePanelCount(panelsCount),
      reason,
      dialogues: fitDialogues(raw.dialogues, panelsCount),
    };
  });
}

export interface ImageInspection {
  /** 人物が写っているか */
  hasPerson: boolean;
  /** 複数コマを 1 枚にまとめた絵になっていないか */
  isCollage: boolean;
}

/**
 * 画像を 1 回見て、人物の有無とグリッド合成かどうかを同時に判定する。
 *
 * 2 つを別々に聞くと API 呼び出しが倍になるので 1 回にまとめている。
 * detail: 'low' なのは、この程度の判定に高解像度は要らず、
 * 送るトークン量がそのまま料金になるため。
 *
 * 判定できなかったときは「人物あり・合成でない」を返す。
 * 誤って残すほうが、使いたかった画像を黙って捨てるより害が小さい。
 */
export async function inspectImage(dataUrl: string): Promise<ImageInspection> {
  const openai = getOpenAIClient();

  const response = await openai.chat.completions.create({
    model: config.openai.visionModel,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              'この画像について 2 つ答えてください。\n' +
              '1. 人物が写っているか（person）\n' +
              '2. 複数の写真をタイル状・格子状に並べた合成画像か（collage）。' +
              '2分割や4分割のコマ割り、コンタクトシート状のものは collage とみなします。' +
              '1枚の写真として自然に撮られたものは collage ではありません。\n' +
              '{"person":true|false,"collage":true|false} の JSON だけを返してください。',
          },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
        ],
      },
    ],
  });

  const text = response.choices[0]?.message?.content?.trim() ?? '';
  try {
    // ```json ... ``` で返ってくることがあるので中身だけ取る
    const json = text.match(/\{[\s\S]*\}/)?.[0] ?? text;
    const parsed = JSON.parse(json) as { person?: boolean; collage?: boolean };
    return {
      hasPerson: parsed.person !== false,
      isCollage: parsed.collage === true,
    };
  } catch {
    return { hasPerson: true, isCollage: false };
  }
}

export interface GenerateImageOptions {
  /** 生成したい絵の説明（日本語可） */
  prompt: string;
  /** 出力サイズ。コマ割りに合わせて縦長/横長も選べる */
  size?: ImageSize;
  /** dall-e-3 のときだけ有効。指定しなければ送らない */
  quality?: ImageQuality;
  /** dall-e-3 のときだけ有効。指定しなければ送らない */
  style?: ImageStyle;
  /** 一度に生成する枚数（dall-e-3 は 1 枚のみ） */
  n?: number;
}

export interface GeneratedImage {
  /**
   * 画像 URL。dall-e 系は有効期限つきの https URL、
   * gpt-image 系は base64 を data URL に変換したもの。
   * 永続化するなら Supabase Storage へ保存する。
   */
  url: string;
  /** DALL-E 側で書き換えられた実際のプロンプト */
  revisedPrompt?: string;
}

/**
 * 画像を生成する。モデルは OPENAI_IMAGE_MODEL で切り替える。
 * 返る URL は一時的なものなので、保存が必要なら別途ダウンロードすること。
 */
export async function generateImage({
  prompt,
  size = '1024x1024',
  quality,
  style,
  n = 1,
}: GenerateImageOptions): Promise<GeneratedImage[]> {
  const openai = getOpenAIClient();
  const model = config.openai.imageModel;
  const isDallE3 = model === 'dall-e-3';

  const requestBody: any = {
    model,
    prompt,
    n: isDallE3 ? 1 : n,
    size,
  };

  // quality / style は dall-e-3 専用。他のモデルに送ると Unknown parameter で 400 になる
  if (isDallE3) {
    if (quality !== undefined) requestBody.quality = quality;
    if (style !== undefined) requestBody.style = style;
  }

  const response = await openai.images.generate(requestBody);

  return (response.data ?? [])
    .map((image): GeneratedImage | null => {
      // gpt-image 系は URL を返さず常に base64。<img> にそのまま渡せる data URL にする
      const url =
        image.url ??
        (image.b64_json ? `data:image/png;base64,${image.b64_json}` : undefined);
      return url ? { url, revisedPrompt: image.revised_prompt } : null;
    })
    .filter((image): image is GeneratedImage => image !== null);
}
