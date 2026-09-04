import { jsPDF } from 'jspdf';

import { collectImages } from './novel-export-files';
import { parseBodyParts } from './scene-blocks';
import { ACTS, sortScenesByAct, type NovelProject } from './types';

/**
 * 小説プロジェクトを PDF に書き出す（ブラウザ内で生成）。
 *
 * jsPDF の標準フォントは日本語を持っておらず、文字を直接置くと化ける。
 * CJK フォントの埋め込みは数 MB になるので、
 * ここでは 1 ページぶんを Canvas に描いてから画像として PDF に載せている。
 * 端末の日本語フォントで描かれるので字は正しく出るが、
 * PDF 内の文字は選択・検索できない（絵と同じ扱いになる）。
 */

/** A4 を 150dpi で扱う（210mm x 297mm 相当） */
const PAGE_W = 1240;
const PAGE_H = 1754;
const MARGIN = 110;
const CONTENT_W = PAGE_W - MARGIN * 2;

const BODY_SIZE = 26;
const FONT_STACK = '"Yu Mincho", "Hiragino Mincho ProN", "Noto Serif JP", serif';

/** ページに積む 1 要素。高さが分かるので改ページを先に決められる */
interface Item {
  height: number;
  draw: (ctx: CanvasRenderingContext2D, y: number) => void;
}

interface LoadedImage {
  element: HTMLImageElement;
  width: number;
  height: number;
}

function newPage(): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  ctx.fillStyle = '#111111';
  ctx.textBaseline = 'top';
  return { canvas, ctx };
}

/** 日本語は文字単位、英数字の連なりは単語単位で折り返す */
function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];

  for (const paragraph of text.split(/\n/)) {
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }
    let current = '';
    const units = paragraph.match(/[A-Za-z0-9]+|[\s\S]/g) ?? [];
    for (const unit of units) {
      const candidate = current + unit;
      if (current && ctx.measureText(candidate).width > maxWidth) {
        lines.push(current);
        current = unit.trim() === '' ? '' : unit;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }

  return lines;
}

function textItems(
  ctx: CanvasRenderingContext2D,
  text: string,
  size: number,
  options: { indent?: boolean; gapAfter?: number } = {},
): Item[] {
  ctx.font = `${size}px ${FONT_STACK}`;
  const indent = options.indent ? size : 0;
  const lineHeight = size * 1.9;
  const lines = wrapLines(ctx, text, CONTENT_W - indent);

  const items: Item[] = lines.map((line) => ({
    height: lineHeight,
    draw: (c, y) => {
      c.font = `${size}px ${FONT_STACK}`;
      c.fillStyle = '#111111';
      c.fillText(line, MARGIN + indent, y);
    },
  }));

  if (options.gapAfter) items.push({ height: options.gapAfter, draw: () => {} });
  return items;
}

/** collectImages が集めたバイト列を、描画に使える <img> にしておく */
async function loadImages(
  byBlock: Map<string, { data: Uint8Array; mimeType: string }[]>,
): Promise<{ images: Map<string, LoadedImage[]>; revoke: () => void }> {
  const urls: string[] = [];
  const images = new Map<string, LoadedImage[]>();

  const jobs: Promise<void>[] = [];
  byBlock.forEach((list, blockId) => {
    const loaded: LoadedImage[] = [];
    images.set(blockId, loaded);

    for (const item of list) {
      // Uint8Array をそのまま渡すと型がぶれるのでコピーしてから Blob にする
      const bytes = new Uint8Array(item.data);
      const url = URL.createObjectURL(new Blob([bytes], { type: item.mimeType }));
      urls.push(url);
      jobs.push(
        new Promise<void>((resolve) => {
          const element = new Image();
          element.onload = () => {
            loaded.push({
              element,
              width: element.naturalWidth,
              height: element.naturalHeight,
            });
            resolve();
          };
          // 読めなかった画像は載せずに進む
          element.onerror = () => resolve();
          element.src = url;
        }),
      );
    }
  });

  await Promise.all(jobs);
  return { images, revoke: () => urls.forEach((url) => URL.revokeObjectURL(url)) };
}

function imageItem(image: LoadedImage): Item {
  const scale = Math.min(1, CONTENT_W / image.width);
  const w = image.width * scale;
  const h = image.height * scale;
  return {
    height: h + 40,
    draw: (ctx, y) => {
      ctx.drawImage(image.element, MARGIN + (CONTENT_W - w) / 2, y + 20, w, h);
    },
  };
}

export async function buildPdf(project: NovelProject): Promise<{
  blob: Blob;
  pageCount: number;
  skippedImages: number;
}> {
  const { byBlock, skipped } = await collectImages(project);
  const { images, revoke } = await loadImages(byBlock);

  try {
    const title = project.theme.title.trim() || '無題';
    // 文字幅を測るためだけの ctx。実際の描画は改ページを決めたあと
    const measure = newPage().ctx;
    const items: Item[] = [];

    items.push(...textItems(measure, title, 46, { gapAfter: 30 }));
    if (project.theme.logline.trim()) {
      items.push(
        ...textItems(measure, project.theme.logline.trim(), 24, {
          gapAfter: 50,
        }),
      );
    }

    for (const act of ACTS) {
      const actScenes = sortScenesByAct(project.scenes).filter(
        (s) => s.act === act.id,
      );
      if (actScenes.length === 0) continue;

      items.push(...textItems(measure, `　${act.label}`, 32, { gapAfter: 20 }));

      for (const scene of actScenes) {
        items.push(
          ...textItems(measure, `◇ ${scene.title || '無題のシーン'}`, 28, {
            gapAfter: 16,
          }),
        );

        for (const part of parseBodyParts(scene.body)) {
          if (part.type === 'text') {
            const value = part.value.trim();
            if (value) {
              items.push(
                ...textItems(measure, value, BODY_SIZE, {
                  indent: true,
                  gapAfter: 18,
                }),
              );
            }
            continue;
          }
          const block = scene.blocks.find(
            (b) => b.kind === part.kind && b.number === part.number,
          );
          if (!block) continue;
          for (const image of images.get(block.id) ?? []) {
            items.push(imageItem(image));
          }
        }

        items.push({ height: 30, draw: () => {} });
      }
    }

    const pdf = new jsPDF({ unit: 'px', format: [PAGE_W, PAGE_H] });
    let page = newPage();
    let y = MARGIN;
    let pageCount = 1;

    const flush = () =>
      pdf.addImage(
        page.canvas.toDataURL('image/jpeg', 0.85),
        'JPEG',
        0,
        0,
        PAGE_W,
        PAGE_H,
      );

    for (const item of items) {
      // 1 要素がページより高い場合は、そのページの先頭に置いてはみ出させる
      if (y > MARGIN && y + item.height > PAGE_H - MARGIN) {
        flush();
        pdf.addPage([PAGE_W, PAGE_H]);
        pageCount += 1;
        page = newPage();
        y = MARGIN;
      }
      item.draw(page.ctx, y);
      y += item.height;
    }
    flush();

    return { blob: pdf.output('blob'), pageCount, skippedImages: skipped };
  } finally {
    revoke();
  }
}
