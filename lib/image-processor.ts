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
import { getGridShape, type PanelCount } from '@/lib/scene-blocks';

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

  // setPixelColor はページあたり数百万回になるので、ビットマップに直接書く
  const data = image.bitmap.data;

  /** 一色で塗る。行ごとに Buffer.fill へ任せる */
  const fillRect = (box: PanelBox, rgb: [number, number, number]) => {
    const x0 = Math.max(0, box.x);
    const y0 = Math.max(0, box.y);
    const x1 = Math.min(width, box.x + box.w);
    const y1 = Math.min(height, box.y + box.h);
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
  const fillGradient = (box: PanelBox) => {
    const x1 = Math.min(width, box.x + box.w);
    const y1 = Math.min(height, box.y + box.h);
    const seed = page.pageNumber * 37;

    for (let py = Math.max(0, box.y); py < y1; py += 1) {
      let index = (py * width + Math.max(0, box.x)) * 4;
      for (let px = Math.max(0, box.x); px < x1; px += 1) {
        const tone = 120 + (((px - box.x) + (py - box.y) * 2 + seed) % 120);
        data[index] = tone;
        data[index + 1] = tone;
        data[index + 2] = 255 - (tone % 60);
        data[index + 3] = 255;
        index += 4;
      }
    }
  };

  const border = 6;
  // 吹き出しと同じ panelBoxes を使う。ここがずれると吹き出しもずれる
  for (const box of panelBoxes(page.panelsCount)) {
    fillRect(box, [0, 0, 0]);
    fillGradient({
      x: box.x + border,
      y: box.y + border,
      w: box.w - border * 2,
      h: box.h - border * 2,
    });
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
// コマ個別生成と組版
// ---------------------------------------------------------------

/** コマ 1 つの作り直しの上限 */
const MAX_PANEL_ATTEMPTS = 3;

/**
 * 絵が入っているか確かめる。
 *
 * 生成が滑ると真っ黒／真っ白の画像が返ることがある。
 * 明るさのばらつきを見て、一様に潰れているものだけを弾く。
 */
async function hasContent(bytes: Buffer): Promise<boolean> {
  try {
    const { channels } = await sharp(bytes).stats();
    // どれかのチャンネルに濃淡があれば絵は入っている
    return channels.some((c) => c.stdev > 6);
  } catch {
    // 判定できないときは通す。捨てるより残すほうが害が小さい
    return true;
  }
}

/** ページ上のコマの位置（画素） */
export interface PanelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** ダミーページを描くときと同じ比率。ここを揃えないと吹き出しがずれる */
const MARGIN_RATIO = 0.05;
const GUTTER_RATIO = 0.02;

/**
 * ページ上のコマの位置を出す（画素）。
 *
 * 組版もダミーページも吹き出しもこの 1 つの計算に揃えてある。
 * 揃っていないと「絵はここ、吹き出しはあそこ」になる。
 */
export function panelBoxes(panelsCount: PanelCount): PanelBox[] {
  const width = KINDLE_PAGE_WIDTH_PX;
  const height = KINDLE_PAGE_HEIGHT_PX;
  const { columns, gridRows, hasWideLastPanel } = getGridShape(
    panelsCount,
    'portrait',
  );

  const margin = Math.round(width * MARGIN_RATIO);
  const gutter = Math.round(width * GUTTER_RATIO);
  const innerW = width - margin * 2;
  const innerH = height - margin * 2;
  const rows = hasWideLastPanel ? gridRows + 1 : gridRows;
  const cellW = (innerW - gutter * (columns - 1)) / columns;
  const cellH = (innerH - gutter * (rows - 1)) / rows;

  const boxes: PanelBox[] = [];
  for (let r = 0; r < gridRows; r += 1) {
    for (let c = 0; c < columns; c += 1) {
      boxes.push({
        x: Math.round(margin + c * (cellW + gutter)),
        y: Math.round(margin + r * (cellH + gutter)),
        w: Math.round(cellW),
        h: Math.round(cellH),
      });
    }
  }
  if (hasWideLastPanel) {
    boxes.push({
      x: margin,
      y: Math.round(margin + gridRows * (cellH + gutter)),
      w: innerW,
      h: Math.round(cellH),
    });
  }
  return boxes;
}

/**
 * コマ 1 つを生成するときの画素数。
 *
 * コマの縦横比に合わせつつ、長辺を 768 前後に収める。
 * 提供元は 8 の倍数を好むので丸めておく。
 */
function panelGenerationSize(box: PanelBox): { width: number; height: number } {
  const target = 768;
  const scale = target / Math.max(box.w, box.h);
  const round8 = (n: number) => Math.max(256, Math.round(n / 8) * 8);
  return { width: round8(box.w * scale), height: round8(box.h * scale) };
}

export interface GeneratePanelsOptions {
  backend: ImageBackend;
  panelsCount: PanelCount;
  /** コマ順の英語プロンプト。要素数はコマ数と同じ */
  panelPrompts: string[];
  /** 進捗を伝える。コマ 1 つごとに呼ばれる */
  onPanel?: (index: number, total: number) => void;
}

/**
 * コマを 1 つずつ描いて、1 枚のページに組み上げる。
 *
 * ページ丸ごと 1 枚で頼むと、画像モデルはコマ数の指示をほとんど守らない
 * （6 コマと言って 10 コマ返る、など）。見せ場のページだけは
 * コマごとに描かせて、枠と余白はこちらで引く。
 * こうすると狙ったコマ数になり、吹き出しの位置もぴたりと合う。
 */
export async function generateComposedPage({
  backend,
  panelsCount,
  panelPrompts,
  onPanel,
}: GeneratePanelsOptions): Promise<Buffer> {
  const boxes = panelBoxes(panelsCount);
  const border = 6;

  // 白地に黒枠を敷き、その内側にコマを貼る
  const page = new Jimp({
    width: KINDLE_PAGE_WIDTH_PX,
    height: KINDLE_PAGE_HEIGHT_PX,
    color: 0xffffffff,
  });
  const data = page.bitmap.data;
  const fillBlack = (box: PanelBox) => {
    const pattern = Buffer.from([0, 0, 0, 255]);
    for (let py = box.y; py < box.y + box.h; py += 1) {
      const start = (py * KINDLE_PAGE_WIDTH_PX + box.x) * 4;
      data.fill(pattern, start, start + box.w * 4);
    }
  };

  for (const [index, box] of boxes.entries()) {
    const prompt = panelPrompts[index];
    if (!prompt) continue;

    const size = panelGenerationSize(box);

    // ときどき真っ黒（または真っ白）のコマが返ってくる。
    // 1 コマでも潰れると紙面が壊れるので、中身があるまで作り直す
    let bytes: Buffer | null = null;
    for (let attempt = 1; attempt <= MAX_PANEL_ATTEMPTS; attempt += 1) {
      const candidate =
        backend === 'stub'
          ? await drawStubPanel(size.width, size.height, index)
          : await generateImageOnHuggingFace({
              prompt: buildPanelPrompt(prompt),
              width: size.width,
              height: size.height,
            });

      if (await hasContent(candidate)) {
        bytes = candidate;
        break;
      }
      console.warn(
        `⚠️  ${index + 1} コマ目が真っ黒／真っ白でした。作り直します（${attempt}/${MAX_PANEL_ATTEMPTS}）`,
      );
    }

    // 作り直しても駄目なら、そのコマは白のままにして先へ進む。
    // 1 コマのために 1 冊を止めるほうが損
    if (!bytes) {
      console.warn(`⚠️  ${index + 1} コマ目は空白のままにします。`);
      onPanel?.(index + 1, boxes.length);
      continue;
    }

    // 枠を描いてから、その内側にコマを貼る
    fillBlack(box);
    const inner = {
      x: box.x + border,
      y: box.y + border,
      w: box.w - border * 2,
      h: box.h - border * 2,
    };
    const panel = (await Jimp.read(bytes)).resize({ w: inner.w, h: inner.h });
    page.composite(panel, inner.x, inner.y);

    onPanel?.(index + 1, boxes.length);
  }

  return Buffer.from(await page.getBuffer('image/png'));
}

/**
 * コマ 1 つぶんの英語プロンプト。
 *
 * SDXL は 77 トークン（約 60 語）で読むのをやめるので、
 * 場面を先に置き、画風の指定は短く後ろに付ける。
 * 「描かないでほしいもの」は positive 側に書いても効きが薄いため、
 * ネガティブプロンプト（config.huggingface.negativePrompt）に寄せてある。
 */
function buildPanelPrompt(prompt: string): string {
  const words = `${prompt.trim()}, black and white manga panel, screentone, clean ink lines, single illustration`
    .split(/\s+/);
  return words.slice(0, 58).join(' ');
}

/** スタブ用のコマ。無料で組版まで確かめられるようにする */
async function drawStubPanel(
  width: number,
  height: number,
  seed: number,
): Promise<Buffer> {
  const image = new Jimp({ width, height, color: 0xffffffff });
  const data = image.bitmap.data;
  for (let y = 0; y < height; y += 1) {
    let index = (y * width) * 4;
    for (let x = 0; x < width; x += 1) {
      const tone = 130 + ((x + y * 2 + seed * 41) % 110);
      data[index] = tone;
      data[index + 1] = tone;
      data[index + 2] = 255 - (tone % 50);
      data[index + 3] = 255;
      index += 4;
    }
  }
  return Buffer.from(await image.getBuffer('image/png'));
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
