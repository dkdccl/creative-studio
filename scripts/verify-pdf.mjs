/**
 * 出来上がった PDF が Kindle の規格どおりか確かめる小道具。
 *
 *   node scripts/verify-pdf.mjs "<本のフォルダ>"
 *
 * ページ寸法・ページ数・ファイルサイズと、
 * metadata.json の中身が食い違っていないかを見る。
 */

import { PDFDocument } from 'pdf-lib';
import fs from 'fs-extra';
import path from 'path';

const dir = process.argv[2];
if (!dir) {
  console.error('使い方: node scripts/verify-pdf.mjs "<本のフォルダ>"');
  process.exit(1);
}

const pdfPath = path.join(dir, 'output.pdf');
const bytes = await fs.readFile(pdfPath);
const pdf = await PDFDocument.load(bytes);
const { width, height } = pdf.getPage(0).getSize();
const px = (pt) => Math.round((pt / 72) * 300);

const meta = await fs.readJSON(path.join(dir, 'metadata.json'));
const pages = await fs.readdir(path.join(dir, 'pages'));
const done = meta.pages.filter((page) => page.status === 'done').length;

const ok = (label, value, pass) =>
  console.log(`${pass ? '✅' : '❌'} ${label}: ${value}`);

console.log(`\n📕 ${meta.title}  (${dir})\n`);
ok('ページ数', `${pdf.getPageCount()} ページ`, pdf.getPageCount() === meta.totalPages);
ok(
  'ページ寸法',
  `${width.toFixed(2)} × ${height.toFixed(2)}pt = ${px(width)} × ${px(height)}px @300DPI`,
  px(width) === meta.page.widthPx && px(height) === meta.page.heightPx,
);
ok(
  'ファイルサイズ',
  `${(bytes.length / 1024 / 1024).toFixed(2)} MB`,
  bytes.length <= 50 * 1024 * 1024,
);
ok('pages/*.png', `${pages.length} 枚`, pages.length === meta.totalPages);
ok('metadata の完成ページ', `${done} / ${meta.totalPages}`, done === meta.totalPages);
ok('status', meta.status, meta.status === 'done');

console.log(`\nJPEG 画質の下限: ${meta.jpegQuality}`);
console.log(
  'コマ数の分布   :',
  JSON.stringify(
    meta.pages.reduce((acc, page) => {
      acc[`${page.panelsCount}コマ`] = (acc[`${page.panelsCount}コマ`] ?? 0) + 1;
      return acc;
    }, {}),
  ),
);
const scenes = meta.pages.reduce((acc, page) => {
  if (page.sceneType) acc[page.sceneType] = (acc[page.sceneType] ?? 0) + 1;
  return acc;
}, {});
console.log(
  'シーン種別     :',
  Object.keys(scenes).length ? JSON.stringify(scenes) : '(スタブのため判定なし)',
);
