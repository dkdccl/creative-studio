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
