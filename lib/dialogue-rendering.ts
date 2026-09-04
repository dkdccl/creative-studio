import { getGridLayout, normalizePanelCount, type PanelCount } from '@/lib/scene-blocks';

/**
 * 生成済みの漫画画像に、あとからセリフを吹き出しで描き込む。
 *
 * 画像モデルに日本語を描かせると字が崩れるので、画像は文字なしで作り、
 * セリフはテキストモデルが書いたものをここで重ねる。
 * Canvas を使うのでブラウザ側でだけ動く（サーバーからは呼べない）。
 */

export interface PanelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * コマ数からコマ枠のおおよその位置を割り出す。
 *
 * 実際の絵の枠線と完全には一致しないので、吹き出しはコマの上部内側に
 * 余白をとって置き、絵の主役（多くは中央〜下）を隠しにくいようにしている。
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

/** 1 行あたりの文字数で折り返す（日本語なので文字数で数えて十分） */
function wrapText(text: string, maxCharsPerLine: number): string[] {
  const lines: string[] = [];
  for (let i = 0; i < text.length; i += maxCharsPerLine) {
    lines.push(text.slice(i, i + maxCharsPerLine));
  }
  return lines.length > 0 ? lines : [text];
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** コマ 1 つに吹き出しを描く */
function drawBubble(
  ctx: CanvasRenderingContext2D,
  panel: PanelRect,
  text: string,
  fontSize: number,
) {
  const maxCharsPerLine = 8;
  const lines = wrapText(text, maxCharsPerLine);
  const lineHeight = fontSize * 1.3;
  const padX = fontSize * 0.6;
  const padY = fontSize * 0.5;

  ctx.font = `bold ${fontSize}px "Yu Gothic", "Hiragino Sans", "Noto Sans JP", sans-serif`;
  ctx.textBaseline = 'top';

  const textW = Math.max(...lines.map((line) => ctx.measureText(line).width));
  const bubbleW = Math.min(textW + padX * 2, panel.w * 0.85);
  const bubbleH = lines.length * lineHeight + padY * 2;

  // コマの左上寄りに置く。はみ出さないよう内側に寄せる
  const inset = fontSize * 0.5;
  const x = panel.x + inset;
  const y = panel.y + inset;

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = Math.max(2, fontSize * 0.08);
  roundedRect(ctx, x, y, bubbleW, bubbleH, fontSize * 0.5);
  ctx.fill();
  ctx.stroke();

  // 吹き出しのしっぽ（下向き）
  const tailX = x + bubbleW * 0.25;
  const tailY = y + bubbleH;
  ctx.beginPath();
  ctx.moveTo(tailX, tailY - 2);
  ctx.lineTo(tailX + fontSize * 0.5, tailY + fontSize * 0.7);
  ctx.lineTo(tailX + fontSize * 0.75, tailY - 2);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.stroke();
  // しっぽの付け根の線を白で消して吹き出しとつなげる
  ctx.beginPath();
  ctx.strokeStyle = '#ffffff';
  ctx.moveTo(tailX + 1, tailY - 1);
  ctx.lineTo(tailX + fontSize * 0.75 - 1, tailY - 1);
  ctx.stroke();

  ctx.fillStyle = '#000000';
  lines.forEach((line, i) => {
    ctx.fillText(line, x + padX, y + padY + i * lineHeight);
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
 * 失敗したときは元の画像をそのまま返す（漫画自体は見せたいので）。
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
    const ctx = canvas.getContext('2d');
    if (!ctx) return imageUrl;

    ctx.drawImage(image, 0, 0, width, height);

    const rects = getPanelRects(panelsCount, width, height);
    const fontSize = Math.round(width * 0.022);

    dialogues.forEach((text, i) => {
      const panel = rects[i];
      if (!panel || text.trim() === '') return;
      drawBubble(ctx, panel, text.trim(), fontSize);
    });

    return canvas.toDataURL('image/png');
  } catch (error) {
    console.error('セリフの描画に失敗しました:', error);
    return imageUrl;
  }
}
