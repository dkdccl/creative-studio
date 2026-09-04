import 'server-only';

import { config } from './config';

/**
 * Stability AI（v2beta stable-image）で画像を作る。
 *
 * OpenAI とは呼び方が違い、multipart/form-data で送る。
 * Accept に application/json を指定すると base64 で返るので、
 * 既存の画像まわりと同じ data URL に揃えて返している。
 *
 * 注意: Stability にも独自の利用規約とフィルタがあり、
 * 規約に反する内容は 403 で弾かれる。こちらで外すことはできない。
 */

export { isStabilityConfigured } from './config';

const ENDPOINT = 'https://api.stability.ai/v2beta/stable-image/generate';

export interface StabilityImageOptions {
  prompt: string;
  /** 描いてほしくない要素 */
  negativePrompt?: string;
  /** 1:1 / 3:2 など。既定は正方形 */
  aspectRatio?: '1:1' | '3:2' | '2:3' | '16:9' | '9:16';
  /** 同じ種を渡すと同じ絵になる。0 は毎回ランダム */
  seed?: number;
}

export interface StabilityImage {
  /** data URL（PNG） */
  url: string;
  /** 生成が打ち切られた理由。CONTENT_FILTERED なら規約フィルタ */
  finishReason?: string;
  seed?: number;
}

export function assertStabilityConfig(): { apiKey: string } {
  const apiKey = config.stability.apiKey;
  if (!apiKey) {
    throw new Error(
      'STABILITY_API_KEY が未設定です。.env.local に API キーを設定してください。',
    );
  }
  return { apiKey };
}

export async function generateImageWithStabilityAI({
  prompt,
  negativePrompt,
  aspectRatio = '1:1',
  seed,
}: StabilityImageOptions): Promise<StabilityImage> {
  const { apiKey } = assertStabilityConfig();

  const form = new FormData();
  form.append('prompt', prompt);
  form.append('output_format', 'png');
  form.append('aspect_ratio', aspectRatio);
  if (negativePrompt) form.append('negative_prompt', negativePrompt);
  if (seed !== undefined) form.append('seed', String(seed));

  const response = await fetch(`${ENDPOINT}/${config.stability.model}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      // base64 で受け取る。image/* にすると生のバイト列が返る
      Accept: 'application/json',
    },
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    // 何が起きたか分かるように、よくある失敗は言い換えて返す
    if (response.status === 401) {
      throw new Error('Stability AI の認証に失敗しました。API キーを確認してください。');
    }
    if (response.status === 403) {
      throw new Error(
        'Stability AI の利用規約フィルタに弾かれました。内容を変えて試してください。',
      );
    }
    if (response.status === 429) {
      throw new Error('Stability AI のレート制限に達しました。時間をおいて試してください。');
    }
    throw new Error(
      `Stability AI エラー (${response.status}): ${detail.slice(0, 200)}`,
    );
  }

  const data = (await response.json()) as {
    image?: string;
    finish_reason?: string;
    seed?: number;
  };

  if (!data.image) {
    throw new Error('Stability AI が画像を返しませんでした。');
  }

  return {
    url: `data:image/png;base64,${data.image}`,
    finishReason: data.finish_reason,
    seed: data.seed,
  };
}
