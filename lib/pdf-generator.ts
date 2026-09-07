import fs from 'fs-extra';
import path from 'path';
import PDFDocument from 'pdfkit';

import {
  JPEG_QUALITY_STEPS,
  KINDLE_DPI,
  KINDLE_PAGE_HEIGHT_PT,
  KINDLE_PAGE_HEIGHT_PX,
  KINDLE_PAGE_WIDTH_PT,
  KINDLE_PAGE_WIDTH_PX,
  MAX_PDF_BYTES,
  pageByteBudget,
} from '@/lib/kindle-book';
import { toKindlePageJpeg } from '@/lib/image-processor';
import { getGridShape, type PanelCount } from '@/lib/scene-blocks';

/**
 * ページ画像をまとめて Kindle 用の PDF にする。
 *
 * ページの大きさは 1456x2188px / 300DPI（＝349.44 × 525.12pt）で固定。
 * 画像は PNG のままだと 120 ページで数百 MB になるので、
 * ページごとに JPEG へ焼き直し、割り当てに収まる画質を選ぶ。
 *
 * セリフはここで吹き出しとして描き込む。
 * 画像モデルに日本語を描かせると字が崩れるので、絵は文字なしで作り、
 * テキストモデルが書いたセリフを PDF の文字として重ねている
 * （PDF の文字なので拡大しても綺麗で、読み上げや検索も効く）。
 */

// ---------------------------------------------------------------
// 日本語フォント
// ---------------------------------------------------------------

/** 探すフォントの候補。OS ごとに上から順に試す */
const FONT_CANDIDATES: Array<{ file: string; postscriptName?: string }> = [
  // Windows
  { file: 'C:/Windows/Fonts/YuGothM.ttc', postscriptName: 'YuGothic-Medium' },
  { file: 'C:/Windows/Fonts/meiryo.ttc', postscriptName: 'Meiryo' },
  { file: 'C:/Windows/Fonts/msgothic.ttc', postscriptName: 'MS-Gothic' },
  // macOS
  { file: '/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc', postscriptName: 'HiraginoSans-W4' },
  { file: '/Library/Fonts/Arial Unicode.ttf' },
  // Linux
  {
    file: '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    postscriptName: 'NotoSansCJKjp-Regular',
  },
  { file: '/usr/share/fonts/truetype/fonts-japanese-gothic.ttf' },
];

export interface JapaneseFont {
  file: string;
  postscriptName?: string;
}

let cachedFont: JapaneseFont | null | undefined;

/**
 * 使える日本語フォントを 1 つ探す。
 *
 * pdfkit の標準フォントは日本語を持たないので、
 * OS に入っているフォントを埋め込む。見つからなければ null を返し、
 * そのときは吹き出しを描かずに絵だけの PDF にする。
 */
export function findJapaneseFont(): JapaneseFont | null {
  if (cachedFont !== undefined) return cachedFont;

  for (const candidate of FONT_CANDIDATES) {
    if (!fs.pathExistsSync(candidate.file)) continue;
    try {
      // 実際に登録して字が置けるところまで確かめる
      const probe = new PDFDocument({ size: [100, 100], autoFirstPage: false });
      probe.addPage({ size: [100, 100] });
      probe.registerFont('probe', candidate.file, candidate.postscriptName);
      probe.font('probe').fontSize(10).text('あ', 0, 0);
      probe.end();
      cachedFont = candidate;
      return cachedFont;
    } catch {
      // 次の候補へ
    }
  }

  cachedFont = null;
  return cachedFont;
}

// ---------------------------------------------------------------
// 吹き出しの位置
// ---------------------------------------------------------------

interface PanelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** ダミーページを描くときと同じ比率。ここを揃えないと吹き出しがずれる */
const MARGIN_RATIO = 0.05;
const GUTTER_RATIO = 0.02;

/**
 * コマの位置をページの比率から割り出す（単位はポイント）。
 *
 * 生成された絵の実際のコマ枠を読み取っているわけではないので、
 * 画像モデルが指示どおりに割ってくれた前提の概算になる。
 */
function panelRects(panelsCount: PanelCount): PanelRect[] {
  const width = KINDLE_PAGE_WIDTH_PT;
  const height = KINDLE_PAGE_HEIGHT_PT;
  const { columns, gridRows, hasWideLastPanel } = getGridShape(
    panelsCount,
    'portrait',
  );

  const margin = width * MARGIN_RATIO;
  const gutter = width * GUTTER_RATIO;
  const innerW = width - margin * 2;
  const innerH = height - margin * 2;
  const rows = hasWideLastPanel ? gridRows + 1 : gridRows;
  const cellW = (innerW - gutter * (columns - 1)) / columns;
  const cellH = (innerH - gutter * (rows - 1)) / rows;

  const rects: PanelRect[] = [];
  for (let r = 0; r < gridRows; r += 1) {
    for (let c = 0; c < columns; c += 1) {
      rects.push({
        x: margin + c * (cellW + gutter),
        y: margin + r * (cellH + gutter),
        w: cellW,
        h: cellH,
      });
    }
  }
  if (hasWideLastPanel) {
    rects.push({
      x: margin,
      y: margin + gridRows * (cellH + gutter),
      w: innerW,
      h: cellH,
    });
  }
  return rects;
}

// ---------------------------------------------------------------
// 吹き出しを描く
// ---------------------------------------------------------------

/** 基準の文字サイズ（ページ幅に対する比率） */
const FONT_RATIO = 0.03;
const MIN_FONT_SIZE = 5;
/** 吹き出しがコマに対して占めてよい上限 */
const MAX_BUBBLE_W_RATIO = 0.82;
const MAX_BUBBLE_H_RATIO = 0.42;

/**
 * 指定幅に収まるように折り返す。
 * 日本語は単語の切れ目が無いので 1 文字ずつ測る。
 */
function wrapText(
  doc: PDFKit.PDFDocument,
  text: string,
  maxWidth: number,
): string[] {
  const isJapanese = /[぀-ゟ゠-ヿ一-鿿]/.test(text);
  const units = isJapanese ? Array.from(text) : text.split(' ');
  const joiner = isJapanese ? '' : ' ';

  const lines: string[] = [];
  let current = '';

  for (const unit of units) {
    const candidate = current ? current + joiner + unit : unit;
    if (current && doc.widthOfString(candidate) > maxWidth) {
      lines.push(current);
      current = unit;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

/** 角丸 + 下向きの尻尾を 1 本のパスで描く */
function bubblePath(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  tail: number,
) {
  const tailCenter = x + w * 0.28;
  doc
    .moveTo(x + radius, y)
    .lineTo(x + w - radius, y)
    .quadraticCurveTo(x + w, y, x + w, y + radius)
    .lineTo(x + w, y + h - radius)
    .quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
    .lineTo(tailCenter + tail / 2, y + h)
    .lineTo(tailCenter, y + h + tail)
    .lineTo(tailCenter - tail / 2, y + h)
    .lineTo(x + radius, y + h)
    .quadraticCurveTo(x, y + h, x, y + h - radius)
    .lineTo(x, y + radius)
    .quadraticCurveTo(x, y, x + radius, y)
    .closePath();
}

/** コマ 1 つに吹き出しを 1 つ描く */
function drawBubble(
  doc: PDFKit.PDFDocument,
  panel: PanelRect,
  text: string,
  fontName: string,
) {
  const maxW = panel.w * MAX_BUBBLE_W_RATIO;
  const maxH = panel.h * MAX_BUBBLE_H_RATIO;

  // 縦にはみ出すあいだは字を小さくして測り直す
  let fontSize = KINDLE_PAGE_WIDTH_PT * FONT_RATIO;
  let lines: string[] = [];
  let padX = 0;
  let padY = 0;
  let lineHeight = 0;
  let w = 0;
  let h = 0;

  for (;;) {
    doc.font(fontName).fontSize(fontSize);
    padX = fontSize * 0.6;
    padY = fontSize * 0.45;
    lineHeight = fontSize * 1.32;

    lines = wrapText(doc, text, maxW - padX * 2);
    const textW = Math.max(...lines.map((line) => doc.widthOfString(line)));
    w = Math.min(textW + padX * 2, maxW);
    h = lines.length * lineHeight + padY * 2;

    if (h <= maxH || fontSize <= MIN_FONT_SIZE) break;
    fontSize = Math.max(MIN_FONT_SIZE, fontSize * 0.9);
  }

  const inset = fontSize * 0.45;
  const tail = fontSize * 0.55;
  const x = panel.x + inset;
  const y = panel.y + inset;

  doc.save();
  bubblePath(doc, x, y, w, h, fontSize * 0.45, tail);
  doc
    .fillColor('#ffffff')
    .fillOpacity(0.95)
    .fill();
  doc.fillOpacity(1);
  bubblePath(doc, x, y, w, h, fontSize * 0.45, tail);
  doc.lineWidth(Math.max(0.6, fontSize * 0.06)).strokeColor('#000000').stroke();

  doc.fillColor('#000000');
  lines.forEach((line, i) => {
    doc.text(line, x + padX, y + padY + lineHeight * i, {
      width: w - padX * 2,
      align: 'center',
      lineBreak: false,
    });
  });
  doc.restore();
}

/** 1 ページぶんのセリフを吹き出しで描く */
function drawDialogues(
  doc: PDFKit.PDFDocument,
  panelsCount: PanelCount,
  dialogues: string[],
  fontName: string,
) {
  const rects = panelRects(panelsCount);
  dialogues.forEach((text, i) => {
    const panel = rects[i];
    const trimmed = text?.trim();
    if (!panel || !trimmed) return;
    drawBubble(doc, panel, trimmed, fontName);
  });
}

// ---------------------------------------------------------------
// 組み立て
// ---------------------------------------------------------------

export interface PdfPageInput {
  /** ページ画像の絶対パス */
  file: string;
  panelsCount: PanelCount;
  /** コマ順のセリフ。空なら吹き出しを描かない */
  dialogues?: string[];
}

export interface BuildPdfOptions {
  /** ページ順に並べておくこと */
  pages: PdfPageInput[];
  /** 書き出し先 */
  outputFile: string;
  /** 途中経過を伝える */
  onPage?: (pageNumber: number, totalPages: number) => void;
}

export interface BuildPdfResult {
  file: string;
  bytes: number;
  pages: number;
  /** 実際に使った JPEG 画質の下限 */
  lowestQuality: number;
  /** 50MB に収まったか */
  withinLimit: boolean;
  /** 吹き出しを描いたか。日本語フォントが無ければ false */
  withDialogues: boolean;
}

export async function buildKindlePdf({
  pages,
  outputFile,
  onPage,
}: BuildPdfOptions): Promise<BuildPdfResult> {
  if (pages.length === 0) {
    throw new Error('PDF にするページがありません。');
  }

  const budget = pageByteBudget(pages.length);
  const hasDialogues = pages.some((page) =>
    page.dialogues?.some((line) => line.trim() !== ''),
  );
  const font = hasDialogues ? findJapaneseFont() : null;

  const document = new PDFDocument({
    size: [KINDLE_PAGE_WIDTH_PT, KINDLE_PAGE_HEIGHT_PT],
    margin: 0,
    autoFirstPage: false,
    // Kindle 側の取り込みで参照される情報
    info: {
      Producer: `Creative Studio (${KINDLE_PAGE_WIDTH_PX}x${KINDLE_PAGE_HEIGHT_PX}px / ${KINDLE_DPI}DPI)`,
    },
  });

  const FONT_NAME = 'jp';
  if (font) {
    document.registerFont(FONT_NAME, font.file, font.postscriptName);
  }

  await fs.ensureDir(path.dirname(outputFile));
  const stream = fs.createWriteStream(outputFile);
  document.pipe(stream);

  let lowestQuality = JPEG_QUALITY_STEPS[0] as number;

  for (const [index, page] of pages.entries()) {
    const { buffer, quality } = await toKindlePageJpeg(page.file, budget);
    lowestQuality = Math.min(lowestQuality, quality);

    document.addPage({
      size: [KINDLE_PAGE_WIDTH_PT, KINDLE_PAGE_HEIGHT_PT],
      margin: 0,
    });
    // 余白なしでページ全面に貼る
    document.image(buffer, 0, 0, {
      width: KINDLE_PAGE_WIDTH_PT,
      height: KINDLE_PAGE_HEIGHT_PT,
    });

    if (font && page.dialogues?.length) {
      drawDialogues(document, page.panelsCount, page.dialogues, FONT_NAME);
    }

    onPage?.(index + 1, pages.length);
  }

  document.end();
  await new Promise<void>((resolve, reject) => {
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });

  const { size } = await fs.stat(outputFile);

  return {
    file: outputFile,
    bytes: size,
    pages: pages.length,
    lowestQuality,
    withinLimit: size <= MAX_PDF_BYTES,
    withDialogues: Boolean(font),
  };
}
