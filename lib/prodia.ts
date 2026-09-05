import 'server-only';

import { config } from './config';

/**
 * Prodia（v2 inference API）で画像を作る。
 *
 * Stability と違い、全ワークロードが 1 つの /v2/job エンドポイントに集約されていて、
 * どのモデルを使うかは body の `type` で指定する。既定は FLUX.2 [dev]。
 * Accept に image/jpeg を渡すと生のバイト列が返るので、
 * 既存の画像まわりと同じ data URL に揃えて返している。
 *
 * 注意: Prodia にも独自の利用規約とフィルタがあり、
 * 規約に反する内容は弾かれる。こちらで外すことはできない。
 */

export { isProdiaConfigured } from './config';

const ENDPOINT = 'https://inference.prodia.com/v2/job';

/** 生成が長引いたときに諦めるまでの時間 */
const TIMEOUT_MS = 110_000;

/** FLUX.2 [dev] が受け付ける値の範囲（Prodia のドキュメント準拠） */
export const LIMITS = {
  size: { min: 512, max: 1920, step: 64 },
  steps: { min: 1, max: 50 },
  guidance: { min: 1, max: 10 },
} as const;

/** style_preset に渡せる値 */
export const STYLE_PRESETS = [
  'photographic',
  'cinematic',
  'analog-film',
  'anime',
  'comic-book',
  'digital-art',
  'fantasy-art',
  'neon-punk',
  'line-art',
  '3d-model',
  'enhance',
] as const;

export type ProdiaStylePreset = (typeof STYLE_PRESETS)[number];

export interface ProdiaImageOptions {
  prompt: string;
  /** 描いてほしくない要素 */
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  /** プロンプトへの忠実度。高いほど指示どおりになるが硬くなる */
  guidanceScale?: number;
  stylePreset?: ProdiaStylePreset;
  /** 同じ種を渡すと同じ絵になる。未指定なら毎回ランダム */
  seed?: number;
}

export interface ProdiaImage {
  /** data URL（JPEG） */
  url: string;
  /** 実際に送ったパラメータ。UI に「この設定で出ました」と出すため */
  usedJobType: string;
  usedSeed?: number;
}

export function assertProdiaConfig(): { token: string } {
  const token = config.prodia.token;
  if (!token) {
    throw new Error(
      'PRODIA_TOKEN が未設定です。ローカルは .env.local、本番は Vercel の環境変数に API トークンを設定してください。',
    );
  }
  return { token };
}

/** 範囲に収めたうえで 64 の倍数に丸める */
function normalizeSize(value: number | undefined, fallback: number): number {
  const { min, max, step } = LIMITS.size;
  const raw = Number.isFinite(value) ? (value as number) : fallback;
  const clamped = Math.min(max, Math.max(min, Math.round(raw)));
  return Math.round(clamped / step) * step;
}

function clamp(
  value: number | undefined,
  fallback: number,
  { min, max }: { min: number; max: number },
): number {
  const raw = Number.isFinite(value) ? (value as number) : fallback;
  return Math.min(max, Math.max(min, raw));
}

export async function generateImageWithProdia({
  prompt,
  negativePrompt,
  width,
  height,
  steps,
  guidanceScale,
  stylePreset,
  seed,
}: ProdiaImageOptions): Promise<ProdiaImage> {
  const { token } = assertProdiaConfig();
  const jobType = config.prodia.jobType;

  const jobConfig: Record<string, unknown> = {
    prompt,
    width: normalizeSize(width, 832),
    height: normalizeSize(height, 1216),
    steps: Math.round(clamp(steps, 28, LIMITS.steps)),
    guidance_scale: clamp(guidanceScale, 4, LIMITS.guidance),
  };

  if (negativePrompt?.trim()) jobConfig.negative_prompt = negativePrompt.trim();
  if (stylePreset) jobConfig.style_preset = stylePreset;
  // seed は「渡さない」ことがランダム指定になる。0 も有効な種なので undefined で判定する
  if (seed !== undefined && Number.isFinite(seed)) jobConfig.seed = Math.trunc(seed);

  // fetch 自体にタイムアウトが無いので AbortController で打ち切る
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        // 生のバイト列で受け取る。application/json にすると job の形が変わる
        Accept: 'image/jpeg',
      },
      body: JSON.stringify({ type: jobType, config: jobConfig }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        'Prodia の応答が時間内に返りませんでした。ステップ数を減らして試してください。',
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    // 何が起きたか分かるように、よくある失敗は言い換えて返す
    if (response.status === 401 || response.status === 403) {
      throw new Error('Prodia の認証に失敗しました。API トークンを確認してください。');
    }
    if (response.status === 402) {
      throw new Error(
        'Prodia のサブスクリプションが有効ではありません。ダッシュボードを確認してください。',
      );
    }
    if (response.status === 429) {
      throw new Error('Prodia のレート制限に達しました。時間をおいて試してください。');
    }
    throw new Error(`Prodia エラー (${response.status}): ${detail.slice(0, 200)}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) {
    throw new Error('Prodia が画像を返しませんでした。');
  }

  const contentType = response.headers.get('content-type') ?? 'image/jpeg';
  const mime = contentType.startsWith('image/') ? contentType : 'image/jpeg';

  return {
    url: `data:${mime};base64,${bytes.toString('base64')}`,
    usedJobType: jobType,
    usedSeed: jobConfig.seed as number | undefined,
  };
}
