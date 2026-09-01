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
 * 小説プロジェクトを .epub / .docx / .zip に書き出す（ブラウザ内で生成）。
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

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------
// .epub
// ---------------------------------------------------------------

const EPUB_CSS = `body { font-family: serif; line-height: 1.8; margin: 1em; }
h1 { font-size: 1.4em; margin: 1.5em 0 1em; }
h2 { font-size: 1.15em; margin: 1.5em 0 0.8em; }
p { text-indent: 1em; margin: 0 0 0.6em; }
.figure { margin: 1.2em 0; text-align: center; }
.figure img { max-width: 100%; }
.panels img { max-width: 32%; margin: 1%; }`;

/**
 * EPUB 3 を組み立てる。
 * mimetype だけは無圧縮で先頭に入れる必要がある。
 */
export async function buildEpub(project: NovelProject): Promise<{
  blob: Blob;
  skippedImages: number;
}> {
  const { byBlock, skipped } = await collectImages(project);
  const zip = new JSZip();
  const title = project.theme.title.trim() || '無題';
  const bookId = `creative-studio-${Date.now()}`;

  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  );

  zip.file('OEBPS/style.css', EPUB_CSS);

  const scenes = sortScenesByAct(project.scenes);
  const chapters: { id: string; href: string; title: string }[] = [];
  const manifestImages: ResolvedImage[] = [];

  scenes.forEach((scene, sceneIndex) => {
    const act = ACTS.find((a) => a.id === scene.act);
    const chapterId = `chapter-${sceneIndex + 1}`;
    const href = `text/${chapterId}.xhtml`;

    const parts = sceneFlow(scene.body, scene.blocks).map((item) => {
      if (item.type === 'text') {
        return item.value
          .split(/\n+/)
          .map((line) => `<p>${escapeXml(line)}</p>`)
          .join('\n');
      }
      const images = byBlock.get(item.block.id) ?? [];
      images.forEach((image) => {
        if (!manifestImages.some((m) => m.fileName === image.fileName)) {
          manifestImages.push(image);
          zip.file(`OEBPS/images/${image.fileName}`, image.data);
        }
      });
      if (images.length === 0) return '';
      const className = item.block.kind === 'photo' ? 'figure panels' : 'figure';
      const tags = images
        .map(
          (image) =>
            `<img src="../images/${image.fileName}" alt="${escapeXml(
              item.block.kind === 'manga' ? '漫画シーン' : '写真シーン',
            )}"/>`,
        )
        .join('');
      return `<div class="${className}">${tags}</div>`;
    });

    zip.file(
      `OEBPS/${href}`,
      `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ja">
<head><title>${escapeXml(scene.title || `シーン${sceneIndex + 1}`)}</title>
<link rel="stylesheet" type="text/css" href="../style.css"/></head>
<body>
<h2>${escapeXml(act?.label ?? '')}</h2>
<h1>${escapeXml(scene.title || `シーン${sceneIndex + 1}`)}</h1>
${parts.join('\n')}
</body></html>`,
    );

    chapters.push({
      id: chapterId,
      href,
      title: scene.title || `シーン${sceneIndex + 1}`,
    });
  });

  const manifest = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="css" href="style.css" media-type="text/css"/>',
    ...chapters.map(
      (c) =>
        `<item id="${c.id}" href="${c.href}" media-type="application/xhtml+xml"/>`,
    ),
    ...manifestImages.map(
      (image, i) =>
        `<item id="img-${i}" href="images/${image.fileName}" media-type="${image.mimeType}"/>`,
    ),
  ].join('\n    ');

  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${bookId}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:language>ja</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
    ${manifest}
  </manifest>
  <spine>
    ${chapters.map((c) => `<itemref idref="${c.id}"/>`).join('\n    ')}
  </spine>
</package>`,
  );

  zip.file(
    'OEBPS/nav.xhtml',
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ja">
<head><title>目次</title></head>
<body>
<nav epub:type="toc" id="toc"><h1>目次</h1><ol>
${chapters.map((c) => `<li><a href="${c.href}">${escapeXml(c.title)}</a></li>`).join('\n')}
</ol></nav>
</body></html>`,
  );

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/epub+zip',
  });
  return { blob, skippedImages: skipped };
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
