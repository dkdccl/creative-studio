/**
 * 挿絵の絵柄まわり。UI からもサーバーからも使うので、
 * server-only を読み込む novel-illustration.ts とは分けている。
 */

export type ContentType = 'standard' | 'mature';

export const CONTENT_TYPES: {
  id: ContentType;
  label: string;
  hint: string;
}[] = [
  { id: 'standard', label: '標準（全年齢向け）', hint: 'OpenAI で生成' },
  { id: 'mature', label: '成人向け', hint: 'Stability AI で生成' },
];

export function normalizeContentType(value: unknown): ContentType {
  return value === 'mature' ? 'mature' : 'standard';
}

/** どちらの画像 API を使うか */
export function providerFor(contentType: ContentType): 'openai' | 'stability' {
  return contentType === 'mature' ? 'stability' : 'openai';
}

export type ImageStyleId = 'photorealistic' | 'anime' | 'illustration';

export const IMAGE_STYLES: {
  id: ImageStyleId;
  label: string;
  hint: string;
}[] = [
  { id: 'photorealistic', label: '📷 写真風', hint: '実写のようにリアル' },
  { id: 'anime', label: '🎨 漫画風', hint: 'アニメ・マンガ調' },
  { id: 'illustration', label: '🖼️ イラスト風', hint: '水彩などの絵画調' },
];

export const DEFAULT_IMAGE_STYLE: ImageStyleId = 'illustration';

export function getStyleLabel(style: ImageStyleId): string {
  return IMAGE_STYLES.find((s) => s.id === style)?.label ?? style;
}

export function normalizeImageStyle(value: unknown): ImageStyleId {
  return IMAGE_STYLES.some((s) => s.id === value)
    ? (value as ImageStyleId)
    : DEFAULT_IMAGE_STYLE;
}

/** 絵柄ごとの言い回し。画像モデルは英語のほうが効きが安定する */
const STYLE_SUFFIX: Record<ImageStyleId, string> = {
  photorealistic: [
    'photorealistic, cinematic, professional photography,',
    'high quality, 4K, detailed, realistic, natural lighting',
  ].join(' '),
  anime: [
    'anime style, manga, illustration, hand drawn,',
    'vibrant colors, expressive, high quality anime art',
  ].join(' '),
  illustration: [
    'illustration, watercolor, art style, artistic, sketch,',
    'soft colors, detailed illustration, high quality artwork',
  ].join(' '),
};

/**
 * シーンの説明と絵柄から、画像モデルに渡すプロンプトを組み立てる。
 * 挿絵に文字が入ると読みづらいので、どの絵柄でも文字は描かせない。
 */
export function generateImagePrompt(
  scene: string,
  imageStyle: ImageStyleId,
): string {
  const style = normalizeImageStyle(imageStyle);
  return [
    scene.trim(),
    STYLE_SUFFIX[style],
    'no text, no letters, no speech bubbles, no watermark',
  ].join(', ');
}
