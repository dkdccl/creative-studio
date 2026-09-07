import { Jimp } from 'jimp';
import sharp from 'sharp';

import { generateImageOnHuggingFace } from '@/lib/huggingface-api';
import {
  JPEG_QUALITY_STEPS,
  KINDLE_PAGE_HEIGHT_PX,
  KINDLE_PAGE_WIDTH_PX,
  SOURCE_IMAGE_HEIGHT,
  SOURCE_IMAGE_SIZE,
  SOURCE_IMAGE_WIDTH,
  type BookPageState,
  type ImageBackend,
} from '@/lib/kindle-book';
import { generateImage } from '@/lib/openai-client';
import { getGridShape } from '@/lib/scene-blocks';

/**
 * ページ画像を作り、Kindle の判型に整えるところ。
 *
 * 「どこで絵を作るか（Hugging Face / OpenAI / ダミー）」と
 * 「出来た絵を判型に合わせて焼き直す」の 2 つを持つ。
 * 生成元を差し替えても、この先（PDF 組み立て）は何も変わらない。
 */

// ---------------------------------------------------------------
// ダミーページ
// ---------------------------------------------------------------

/**
 * 画像モデルを呼ばずに、コマ枠だけのダミーページを描く。
 *
 * 120 ページを実際に生成すると時間も費用もかかるので、
 * 分割・バッチ・再開・PDF 化までの流れをこれで確かめられるようにしてある。
 */
export async function drawStubPage(page: BookPageState): Promise<Buffer> {
  const width = KINDLE_PAGE_WIDTH_PX;
  const height = KINDLE_PAGE_HEIGHT_PX;
  const image = new Jimp({ width, height, color: 0xffffffff });

  const { columns, gridRows, hasWideLastPanel } = getGridShape(
    page.panelsCount,
    'portrait',
  );
  const margin = Math.round(width * 0.05);
  const gutter = Math.round(width * 0.02);
  const innerW = width - margin * 2;
  const innerH = height - margin * 2;
  const rows = hasWideLastPanel ? gridRows + 1 : gridRows;
  const cellW = (innerW - gutter * (columns - 1)) / columns;
  const cellH = (innerH - gutter * (rows - 1)) / rows;

  // setPixelColor はページあたり数百万回になるので、ビットマップに直接書く
  const data = image.bitmap.data;

  /** 一色で塗る。行ごとに Buffer.fill へ任せる */
  const fillRect = (
    x: number,
    y: number,
    w: number,
    h: number,
    rgb: [number, number, number],
  ) => {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(width, Math.round(x + w));
    const y1 = Math.min(height, Math.round(y + h));
    if (x1 <= x0 || y1 <= y0) return;

    const pattern = Buffer.from([rgb[0], rgb[1], rgb[2], 255]);
    for (let py = y0; py < y1; py += 1) {
      const start = (py * width + x0) * 4;
      data.fill(pattern, start, start + (x1 - x0) * 4);
    }
  };

  /**
   * コマの中身をグラデーションで埋める。
   * 一色のままだと JPEG が小さくなりすぎて、
   * 50MB に収める仕組みを試したことにならないため。
   */
  const fillGradient = (x: number, y: number, w: number, h: number) => {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(width, Math.round(x + w));
    const y1 = Math.min(height, Math.round(y + h));
    const seed = page.pageNumber * 37;

    for (let py = y0; py < y1; py += 1) {
      let index = (py * width + x0) * 4;
      for (let px = x0; px < x1; px += 1) {
        const tone = 120 + (((px - x0) + (py - y0) * 2 + seed) % 120);
        data[index] = tone;
        data[index + 1] = tone;
        data[index + 2] = 255 - (tone % 60);
        data[index + 3] = 255;
        index += 4;
      }
    }
  };

  const border = 6;
  const drawPanel = (x: number, y: number, w: number, h: number) => {
    fillRect(x, y, w, h, [0, 0, 0]);
    fillGradient(x + border, y + border, w - border * 2, h - border * 2);
  };

  for (let r = 0; r < gridRows; r += 1) {
    for (let c = 0; c < columns; c += 1) {
      drawPanel(
        margin + c * (cellW + gutter),
        margin + r * (cellH + gutter),
        cellW,
        cellH,
      );
    }
  }
  if (hasWideLastPanel) {
    drawPanel(margin, margin + gridRows * (cellH + gutter), innerW, cellH);
  }

  return Buffer.from(await image.getBuffer('image/png'));
}

// ---------------------------------------------------------------
// 生成
// ---------------------------------------------------------------

export interface GeneratePageOptions {
  backend: ImageBackend;
  prompt: string;
  /** ダミーページを描くときに使う。stub 以外では見ない */
  page: BookPageState;
}

/** data URL / http URL の画像をバイト列にする */
async function urlToBytes(url: string): Promise<Buffer> {
  if (url.startsWith('data:')) {
    return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`画像を取得できませんでした（${response.status}）`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * ページ画像を 1 枚作る。
 * 失敗したら投げる。再試行は呼び出し側（kindle-job）が受け持つ。
 */
export async function generatePageImage({
  backend,
  prompt,
  page,
}: GeneratePageOptions): Promise<Buffer> {
  switch (backend) {
    case 'stub':
      return drawStubPage(page);

    case 'huggingface':
      return generateImageOnHuggingFace({
        prompt,
        width: SOURCE_IMAGE_WIDTH,
        height: SOURCE_IMAGE_HEIGHT,
      });

    case 'openai':
    default: {
      const images = await generateImage({ prompt, size: SOURCE_IMAGE_SIZE });
      const image = images[0];
      if (!image) throw new Error('画像が返りませんでした。');
      return urlToBytes(image.url);
    }
  }
}

// ---------------------------------------------------------------
// 判型に合わせる
// ---------------------------------------------------------------

export interface KindlePageImage {
  buffer: Buffer;
  quality: number;
}

/** 画質を指定して 1 枚焼く。sharp が使えなければ jimp に落とす */
async function encodeJpeg(file: string, quality: number): Promise<Buffer> {
  try {
    // sharp は Lanczos3 で拡大するので、引き伸ばしたときの輪郭が jimp より綺麗
    return await sharp(file)
      .resize(KINDLE_PAGE_WIDTH_PX, KINDLE_PAGE_HEIGHT_PX, {
        fit: 'fill',
        kernel: 'lanczos3',
      })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
  } catch (error) {
    // sharp はネイティブ依存なので、環境によっては読み込めないことがある。
    // 1 冊まるごと落とすより、質を少し譲ってでも作り切る
    if (!warnedAboutSharp) {
      warnedAboutSharp = true;
      console.warn(`⚠️  sharp を使えないので jimp で処理します: ${error}`);
    }
    const image = await Jimp.read(file);
    const resized = image.resize({
      w: KINDLE_PAGE_WIDTH_PX,
      h: KINDLE_PAGE_HEIGHT_PX,
    });
    return Buffer.from(await resized.getBuffer('image/jpeg', { quality }));
  }
}

let warnedAboutSharp = false;

/**
 * 1 ページぶんの画像を、Kindle のページサイズちょうどの JPEG にする。
 *
 * 生成元が返すのは 1024x1536 なので、規格の 1456x2188 に伸ばす。
 * 引き伸ばしで細部が増えるわけではないが、
 * Kindle 側が求める画素数を満たしていないと弾かれるため合わせる。
 *
 * PNG のままだと 120 ページで数百 MB になるので JPEG に焼き直し、
 * 1 ページあたりの割り当てに収まる画質を上から順に試す。
 */
export async function toKindlePageJpeg(
  file: string,
  maxBytes: number,
): Promise<KindlePageImage> {
  let last: KindlePageImage | null = null;

  for (const quality of JPEG_QUALITY_STEPS) {
    const buffer = await encodeJpeg(file, quality);
    last = { buffer, quality };
    if (buffer.length <= maxBytes) return last;
  }

  // 一番低い画質でも入らなければ、それをそのまま使う。
  // ここで諦めるより、まず 1 冊分を組み上げて全体の大きさを見せたほうがよい
  return last as KindlePageImage;
}
