import {
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import JSZip from 'jszip';

import { parseBodyParts } from './scene-blocks';
import {
  ACTS,
  sortScenesByAct,
  type NovelProject,
  type SceneBlock,
} from './types';
import { toSafeFileName } from './novel-export';

/**
 * 小説プロジェクトを .docx / .zip に書き出す（ブラウザ内で生成）。
 *
 * 画像は Scene.blocks が持っている。写真は data URL、
 * 漫画は DALL-E の一時 URL のことがあるので、取得できなかったものは飛ばして数える。
 */

// ---------------------------------------------------------------
// 画像の取り出し
// ---------------------------------------------------------------

export interface ResolvedImage {
  /** 出力ファイル名（拡張子つき） */
  fileName: string;
  data: Uint8Array;
  mimeType: string;
  width: number;
  height: number;
}

/** ブロック 1 つが持つ画像の URL 一覧 */
function blockImageUrls(block: SceneBlock): string[] {
  return block.kind === 'manga' ? [block.imageUrl] : block.photos;
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  return 'jpg';
}

async function measure(blob: Blob): Promise<{ width: number; height: number }> {
  try {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return { width: 800, height: 600 };
  }
}

/**
 * ブロックの画像をすべて取り出す。
 * 取得できなかった URL は skipped に数え、処理は止めない。
 */
export async function collectImages(project: NovelProject): Promise<{
  /** ブロック ID → その画像たち */
  byBlock: Map<string, ResolvedImage[]>;
  skipped: number;
}> {
  const byBlock = new Map<string, ResolvedImage[]>();
  let skipped = 0;
  let index = 0;

  for (const scene of sortScenesByAct(project.scenes)) {
    for (const block of scene.blocks) {
      const images: ResolvedImage[] = [];
      for (const url of blockImageUrls(block)) {
        index += 1;
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(String(response.status));
          const blob = await response.blob();
          const mimeType = blob.type || 'image/jpeg';
          const { width, height } = await measure(blob);
          images.push({
            fileName: `image-${String(index).padStart(3, '0')}.${extensionFor(mimeType)}`,
            data: new Uint8Array(await blob.arrayBuffer()),
            mimeType,
            width,
            height,
          });
        } catch {
          skipped += 1;
        }
      }
      byBlock.set(block.id, images);
    }
  }

  return { byBlock, skipped };
}

// ---------------------------------------------------------------
// 共通：本文をブロック単位に並べ直す
// ---------------------------------------------------------------

type FlowItem =
  | { type: 'text'; value: string }
  | { type: 'block'; block: SceneBlock };

/** 1 シーンぶんの本文を、テキストと画像ブロックの並びに変換する */
function sceneFlow(
  body: string,
  blocks: SceneBlock[],
): FlowItem[] {
  return parseBodyParts(body).flatMap((part): FlowItem[] => {
    if (part.type === 'text') {
      const value = part.value.trim();
      return value ? [{ type: 'text', value }] : [];
    }
    const block = blocks.find(
      (b) => b.kind === part.kind && b.number === part.number,
    );
    return block ? [{ type: 'block', block }] : [];
  });
}

// ---------------------------------------------------------------
// .docx
// ---------------------------------------------------------------

/** Word で開いたときに幅が溢れないよう縮める */
function fitWidth(image: ResolvedImage, maxWidth = 450) {
  const scale = Math.min(1, maxWidth / image.width);
  return {
    width: Math.round(image.width * scale),
    height: Math.round(image.height * scale),
  };
}

export async function buildDocx(project: NovelProject): Promise<{
  blob: Blob;
  skippedImages: number;
}> {
  const { byBlock, skipped } = await collectImages(project);
  const title = project.theme.title.trim() || '無題';

  const children: Paragraph[] = [
    new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
  ];

  if (project.theme.logline.trim()) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: project.theme.logline, italics: true })],
      }),
    );
  }

  for (const act of ACTS) {
    const actScenes = sortScenesByAct(project.scenes).filter(
      (s) => s.act === act.id,
    );
    if (actScenes.length === 0) continue;

    children.push(
      new Paragraph({ text: act.label, heading: HeadingLevel.HEADING_1 }),
    );

    for (const scene of actScenes) {
      children.push(
        new Paragraph({
          text: scene.title || '無題のシーン',
          heading: HeadingLevel.HEADING_2,
        }),
      );

      for (const item of sceneFlow(scene.body, scene.blocks)) {
        if (item.type === 'text') {
          for (const line of item.value.split(/\n+/)) {
            children.push(new Paragraph({ text: line }));
          }
          continue;
        }
        for (const image of byBlock.get(item.block.id) ?? []) {
          children.push(
            new Paragraph({
              children: [
                new ImageRun({
                  type: extensionFor(image.mimeType) === 'png' ? 'png' : 'jpg',
                  data: image.data,
                  transformation: fitWidth(image),
                }),
              ],
            }),
          );
        }
      }
    }
  }

  const document = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(document);
  return { blob, skippedImages: skipped };
}

// ---------------------------------------------------------------
// .zip（ページ画像）
// ---------------------------------------------------------------

export async function buildImagesZip(project: NovelProject): Promise<{
  blob: Blob;
  count: number;
  skippedImages: number;
}> {
  const { byBlock, skipped } = await collectImages(project);
  const zip = new JSZip();
  let count = 0;

  for (const scene of sortScenesByAct(project.scenes)) {
    for (const block of scene.blocks) {
      const images = byBlock.get(block.id) ?? [];
      const folder = `${block.kind === 'manga' ? 'manga' : 'photo'}-${String(
        block.number,
      ).padStart(2, '0')}`;
      images.forEach((image, i) => {
        zip.file(
          images.length === 1
            ? `${folder}.${extensionFor(image.mimeType)}`
            : `${folder}/panel-${String(i + 1).padStart(2, '0')}.${extensionFor(image.mimeType)}`,
          image.data,
        );
        count += 1;
      });
    }
  }

  // 画像だけだと何の本か分からないので、本文も一緒に入れておく
  zip.file(
    'README.txt',
    `${project.theme.title.trim() || '無題'}\nCreative Studio から書き出したページ画像です。\n画像 ${count} 点`,
  );

  const blob = await zip.generateAsync({ type: 'blob' });
  return { blob, count, skippedImages: skipped };
}

// ---------------------------------------------------------------

/** Blob をファイルとしてダウンロードさせる */
export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function bookFileName(project: NovelProject, extension: string): string {
  return `${toSafeFileName(project.theme.title)}.${extension}`;
}
