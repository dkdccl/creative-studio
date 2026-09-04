import { getGridLayout, normalizePanelCount, type PanelCount } from '@/lib/scene-blocks';

/**
 * 生成済みの漫画画像に、あとからセリフを吹き出しで描き込む。
 *
 * 画像モデルに日本語を描かせると字が崩れるので、画像は文字なしで作り、
 * セリフはテキストモデルが書いたものをここで重ねる。
 * Canvas を使うのでブラウザ側でだけ動く（サーバーからは呼べない）。
 *
 * 寸法はすべて画像幅に対する比率で決める。生成画像は 1536x1024 で、
 * px 決め打ちにすると表示時に文字が小さすぎて読めなくなるため。
 */

export interface PanelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 基準の文字サイズ（画像幅に対する比率） */
const FONT_RATIO = 0.022;
/** これ以上は小さくしない下限 */
const MIN_FONT_RATIO = 0.013;
/** 吹き出しがコマ幅・コマ高さに対して占めてよい上限 */
const MAX_BUBBLE_W_RATIO = 0.85;
const MAX_BUBBLE_H_RATIO = 0.45;

const FONT_STACK = '"Yu Gothic", "Hiragino Sans", "Noto Sans JP", sans-serif';

// ------------------------------------------------------------------
// コマ枠の検出
// ------------------------------------------------------------------

/** 「ここからここまでが 1 コマ」を表す区間 */
type Band = [number, number];

/**
 * 地の色が続く区間を手がかりに、内容の端と内側の隙間から count 個の帯を切り出す。
 * うまく切れなければ null。
 */
function splitBands(
  profile: Float32Array,
  length: number,
  count: number,
): Band[] | null {
  const BG_LINE = 0.97;

  let start = 0;
  while (start < length && profile[start] >= BG_LINE) start += 1;
  let end = length - 1;
  while (end > start && profile[end] >= BG_LINE) end -= 1;
  if (end - start < length * 0.3) return null;

  if (count === 1) return [[start, end]];

  const gaps: Band[] = [];
  let runStart = -1;
  for (let i = start; i <= end; i += 1) {
    if (profile[i] >= BG_LINE) {
      if (runStart < 0) runStart = i;
    } else if (runStart >= 0) {
      gaps.push([runStart, i - 1]);
      runStart = -1;
    }
  }

  const minGap = Math.max(2, Math.round(length * 0.004));
  const usable = gaps
    .filter(([a, b]) => b - a + 1 >= minGap)
    .sort((p, q) => q[1] - q[0] - (p[1] - p[0]))
    .slice(0, count - 1)
    .sort((p, q) => p[0] - q[0]);
  if (usable.length !== count - 1) return null;

  const bands: Band[] = [];
  let cursor = start;
  for (const [from, to] of usable) {
    bands.push([cursor, from - 1]);
    cursor = to + 1;
  }
  bands.push([cursor, end]);

  // 極端に細い帯が出たら検出失敗とみなす
  const minBand = (end - start) / (count * 3);
  if (bands.some(([a, b]) => b - a < minBand)) return null;
  return bands;
}

/**
 * 画像から実際のコマ枠を読み取る。
 *
 * 生成画像は外周の余白の広さが毎回変わる（3% のこともあれば 14% のこともある）。
 * 決め打ちの比率で計算すると吹き出しが余白側にずれるので、
 * 「地の色が続いている列・行」＝コマの外側と隙間、とみなして境界を探す。
 */
function detectPanelRects(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  panels: number,
): PanelRect[] | null {
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, width, height).data;
  } catch {
    // CORS で汚れた canvas は読めない
    return null;
  }

  const at = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return [data[i], data[i + 1], data[i + 2]] as const;
  };
  const corners = [
    at(1, 1),
    at(width - 2, 1),
    at(1, height - 2),
    at(width - 2, height - 2),
  ];
  const bg = [0, 1, 2].map(
    (c) => corners.reduce((sum, p) => sum + p[c], 0) / corners.length,
  );

  const STEP = 4;
  const TOLERANCE = 60;
  const isBg = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return (
      Math.abs(data[i] - bg[0]) +
        Math.abs(data[i + 1] - bg[1]) +
        Math.abs(data[i + 2] - bg[2]) <
      TOLERANCE
    );
  };

  /** 縦方向に走査した「地の色の割合」を列ごとに出す（y の範囲を絞れる） */
  const columnProfile = (y0: number, y1: number): Float32Array => {
    const profile = new Float32Array(width);
    let samples = 0;
    for (let y = y0; y <= y1; y += STEP) samples += 1;
    if (samples === 0) return profile;
    for (let x = 0; x < width; x += 1) {
      let bgCount = 0;
      for (let y = y0; y <= y1; y += STEP) if (isBg(x, y)) bgCount += 1;
      profile[x] = bgCount / samples;
    }
    return profile;
  };

  const rowProfile = (): Float32Array => {
    const profile = new Float32Array(height);
    const samples = Math.floor(width / STEP);
    for (let y = 0; y < height; y += 1) {
      let bgCount = 0;
      for (let x = 0; x < width; x += STEP) if (isBg(x, y)) bgCount += 1;
      profile[y] = bgCount / samples;
    }
    return profile;
  };

  if (panels === 5) {
    // 上 2 段が 2 列、最下段だけ横いっぱい。
    // 列の隙間は下段には無いので、上 2 段だけを見て列を割り出す
    const rowBands = splitBands(rowProfile(), height, 3);
    if (!rowBands) return null;
    const colBands = splitBands(
      columnProfile(rowBands[0][0], rowBands[1][1]),
      width,
      2,
    );
    if (!colBands) return null;

    const rects: PanelRect[] = [];
    for (const [y0, y1] of rowBands.slice(0, 2)) {
      for (const [x0, x1] of colBands) {
        rects.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      }
    }
    const [by0, by1] = rowBands[2];
    rects.push({
      x: colBands[0][0],
      y: by0,
      w: colBands[1][1] - colBands[0][0],
      h: by1 - by0,
    });
    return rects;
  }

  const { columns, rows } = getGridLayout(normalizePanelCount(panels));
  const rowBands = splitBands(rowProfile(), height, rows);
  if (!rowBands) return null;
  const colBands = splitBands(columnProfile(0, height - 1), width, columns);
  if (!colBands) return null;

  const rects: PanelRect[] = [];
  for (const [y0, y1] of rowBands) {
    for (const [x0, x1] of colBands) {
      rects.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
  }
  return rects;
}

/**
 * コマ数からコマ枠のおおよその位置を割り出す（実測できなかったときの概算）。
 *
 * 生成画像は外周に余白があり、コマ同士にも隙間があるので、
 * 単純に画像を等分するのではなく余白とコマ間を差し引いて計算する。
 */
export function getPanelRects(
  panelsCount: PanelCount,
  width: number,
  height: number,
): PanelRect[] {
  const panels = normalizePanelCount(panelsCount);
  const margin = Math.round(width * 0.035);
  const gutter = Math.round(width * 0.015);
  const innerW = width - margin * 2;
  const innerH = height - margin * 2;

  const gridRects = (cols: number, rows: number, rowCount = rows): PanelRect[] => {
    const cellW = (innerW - gutter * (cols - 1)) / cols;
    const cellH = (innerH - gutter * (rowCount - 1)) / rowCount;
    const rects: PanelRect[] = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        rects.push({
          x: margin + c * (cellW + gutter),
          y: margin + r * (cellH + gutter),
          w: cellW,
          h: cellH,
        });
      }
    }
    return rects;
  };

  if (panels === 5) {
    // 2×2 の 4 コマ + 最下段に横いっぱいの大ゴマ 1 つ
    const rects = gridRects(2, 2, 3);
    const cellH = (innerH - gutter * 2) / 3;
    rects.push({
      x: margin,
      y: margin + 2 * (cellH + gutter),
      w: innerW,
      h: cellH,
    });
    return rects;
  }

  const { columns, rows } = getGridLayout(panels);
  return gridRects(columns, rows);
}

// ------------------------------------------------------------------
// 吹き出しの組版
// ------------------------------------------------------------------

/**
 * 指定幅に収まるように折り返す。
 * 日本語は単語の区切りが無いので 1 文字ずつ、英語は単語ごとに測る。
 */
function wrapByMeasure(
  ctx: CanvasRenderingContext2D,
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
    if (current && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = unit;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);

  return lines.length > 0 ? lines : [text];
}

interface BubbleLayout {
  lines: string[];
  fontSize: number;
  w: number;
  h: number;
  padX: number;
  padY: number;
  lineHeight: number;
}

/**
 * コマに収まる吹き出しの寸法を決める。
 * 縦にはみ出すあいだは文字を少しずつ小さくして測り直す。
 */
function layoutBubble(
  ctx: CanvasRenderingContext2D,
  panel: PanelRect,
  text: string,
  imageWidth: number,
): BubbleLayout {
  const maxBubbleW = panel.w * MAX_BUBBLE_W_RATIO;
  const maxBubbleH = panel.h * MAX_BUBBLE_H_RATIO;
  const minFontSize = imageWidth * MIN_FONT_RATIO;

  // 長いセリフは最初から少し小さめに始める
  let fontSize = imageWidth * FONT_RATIO;
  if (text.length > 14) fontSize *= 0.88;
  if (text.length > 20) fontSize *= 0.8;

  for (;;) {
    ctx.font = `bold ${fontSize}px ${FONT_STACK}`;
    const padX = fontSize * 0.6;
    const padY = fontSize * 0.45;
    const lineHeight = fontSize * 1.3;

    // 折り返し幅は「吹き出しの上限 - 左右の余白」。ここを測って決めるので
    // 枠だけ縮んで文字がはみ出す、ということが起きない
    const lines = wrapByMeasure(ctx, text, maxBubbleW - padX * 2);
    const textW = Math.max(...lines.map((line) => ctx.measureText(line).width));
    const w = Math.min(textW + padX * 2, maxBubbleW);
    const h = lines.length * lineHeight + padY * 2;

    if (h <= maxBubbleH || fontSize <= minFontSize) {
      return { lines, fontSize, w, h, padX, padY, lineHeight };
    }
    fontSize = Math.max(minFontSize, fontSize * 0.9);
  }
}

/** 角丸 + 下向きの尻尾を 1 本のパスで描く */
function bubblePath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  tailSize: number,
) {
  const tailCenter = x + w * 0.28;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  // 尻尾
  ctx.lineTo(tailCenter + tailSize / 2, y + h);
  ctx.lineTo(tailCenter, y + h + tailSize);
  ctx.lineTo(tailCenter - tailSize / 2, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/** コマ 1 つに吹き出しを描く */
function drawBubble(
  ctx: CanvasRenderingContext2D,
  panel: PanelRect,
  text: string,
  imageWidth: number,
) {
  const layout = layoutBubble(ctx, panel, text, imageWidth);
  const { lines, fontSize, w, h, padY, lineHeight } = layout;

  const inset = fontSize * 0.45;
  const tailSize = fontSize * 0.55;

  // コマの左上寄り。右端・下端をはみ出さないよう必ず内側へ収める
  const x = Math.max(
    panel.x + inset,
    Math.min(panel.x + inset, panel.x + panel.w - w - inset),
  );
  const y = Math.max(
    panel.y + inset,
    Math.min(panel.y + inset, panel.y + panel.h - h - tailSize - inset),
  );

  ctx.save();
  ctx.font = `bold ${fontSize}px ${FONT_STACK}`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = Math.max(1.5, fontSize * 0.07);
  bubblePath(ctx, x, y, w, h, fontSize * 0.45, tailSize);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => {
    ctx.fillText(line, x + w / 2, y + padY + lineHeight * (i + 0.5));
  });
  ctx.restore();
}

/** data URL / URL から画像を読む */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // data URL 以外（外部 URL）でも canvas を汚さないようにしておく
    if (!src.startsWith('data:')) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('画像を読み込めませんでした'));
    image.src = src;
  });
}

/**
 * 画像にセリフを描き込んで、新しい data URL を返す。
 * 失敗したときは元の画像をそのまま返す（漫画自体は見せたいので、ここでは投げない）。
 */
export async function drawDialoguesOnImage(
  imageUrl: string,
  dialogues: string[],
  panelsCount: PanelCount,
): Promise<string> {
  if (!dialogues.some((d) => d.trim() !== '')) return imageUrl;

  try {
    const image = await loadImage(imageUrl);
    const width = image.naturalWidth;
    const height = image.naturalHeight;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return imageUrl;

    ctx.drawImage(image, 0, 0, width, height);

    const panels = normalizePanelCount(panelsCount);
    // まず実際のコマ枠を読み取り、読めなければ比率での概算に切り替える
    const rects =
      detectPanelRects(ctx, width, height, panels) ??
      getPanelRects(panelsCount, width, height);

    dialogues.forEach((text, i) => {
      const panel = rects[i];
      if (!panel || text.trim() === '') return;
      drawBubble(ctx, panel, text.trim(), width);
    });

    return canvas.toDataURL('image/png');
  } catch (error) {
    console.error('セリフの描画に失敗しました:', error);
    return imageUrl;
  }
}
