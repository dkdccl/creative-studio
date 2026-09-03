import 'server-only';
import OpenAI from 'openai';
import { assertOpenAIConfig, config } from './config';

let client: OpenAI | null = null;

export { isOpenAIConfigured } from './config';

export function getOpenAIClient(): OpenAI {
  const { apiKey } = assertOpenAIConfig();
  if (!client) {
    client = new OpenAI({ apiKey });
  }
  return client;
}

export type ImageSize = '1024x1024' | '1024x1792' | '1792x1024';
export type ImageQuality = 'standard' | 'hd';
export type ImageStyle = 'vivid' | 'natural';

export interface GenerateImageOptions {
  /** 生成したい絵の説明（日本語可） */
  prompt: string;
  /** 出力サイズ。コマ割りに合わせて縦長/横長も選べる */
  size?: ImageSize;
  quality?: ImageQuality;
  style?: ImageStyle;
  /** 一度に生成する枚数（dall-e-3 は 1 枚のみ） */
  n?: number;
}

export interface GeneratedImage {
  /** 画像 URL（有効期限あり。永続化するなら Supabase Storage へ保存する） */
  url: string;
  /** DALL-E 側で書き換えられた実際のプロンプト */
  revisedPrompt?: string;
}

/**
 * DALL-E で画像を生成する。
 * 返る URL は一時的なものなので、保存が必要なら別途ダウンロードすること。
 */
export async function generateImage({
  prompt,
  size = '1024x1024',
  quality,  // ← デフォルト値なし（呼び出し側が明示したときだけ送る）
  style,    // ← デフォルト値なし（呼び出し側が明示したときだけ送る）
  n = 1,
}: GenerateImageOptions): Promise<GeneratedImage[]> {
  const openai = getOpenAIClient();
  const model = config.openai.imageModel;

  const requestBody: any = {
    model,
    prompt,
    n: model === 'dall-e-3' ? 1 : n,
    size,
  };

  // DALL-E 3 のときだけ、呼び出し側が明示したら quality / style を追加
  if (model === 'dall-e-3') {
    if (quality !== undefined) requestBody.quality = quality;
    if (style !== undefined) requestBody.style = style;
  }

  const response = await openai.images.generate(requestBody);

  return (response.data ?? [])
    .filter((image): image is { url: string; revised_prompt?: string } =>
      Boolean(image.url),
    )
    .map((image) => ({
      url: image.url,
      revisedPrompt: image.revised_prompt,
    }));
}
