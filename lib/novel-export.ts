import {
  ACTS,
  POV_LABELS,
  TARGET_LENGTH_LABELS,
  TONE_LABELS,
  sortScenesByAct,
  type NovelProject,
} from './types';

/** 空白・改行を除いた文字数 */
export function countChars(text: string): number {
  return text.replace(/\s/g, '').length;
}

/** 本文のみの原稿（.txt 用） */
export function buildManuscript(project: NovelProject): string {
  const { theme, scenes } = project;
  const lines: string[] = [];

  lines.push(theme.title || '無題');
  lines.push('');

  for (const act of ACTS) {
    const actScenes = sortScenesByAct(scenes).filter((s) => s.act === act.id);
    if (actScenes.length === 0) continue;

    lines.push(`　　${act.label}`);
    lines.push('');

    for (const scene of actScenes) {
      lines.push(`◇ ${scene.title || '無題のシーン'}`);
      lines.push('');
      lines.push(scene.body.trim() || '（未執筆）');
      lines.push('');
    }
  }

  return lines.join('\n');
}

/** 企画書 + 本文をまとめた Markdown（.md 用） */
export function buildProjectMarkdown(project: NovelProject): string {
  const { theme, characters, scenes } = project;
  const ordered = sortScenesByAct(scenes);
  const lines: string[] = [];

  lines.push(`# ${theme.title || '無題'}`);
  lines.push('');

  if (theme.logline) {
    lines.push(`> ${theme.logline}`);
    lines.push('');
  }

  lines.push('## 企画');
  lines.push('');
  lines.push(`- ジャンル：${theme.genres.join('・') || '未設定'}`);
  lines.push(`- 視点：${POV_LABELS[theme.pov]}`);
  lines.push(`- 文体：${TONE_LABELS[theme.tone]}`);
  lines.push(`- 想定分量：${TARGET_LENGTH_LABELS[theme.targetLength]}`);
  if (theme.theme) lines.push(`- テーマ：${theme.theme}`);
  lines.push('');

  if (characters.length > 0) {
    lines.push('## 登場人物');
    lines.push('');
    for (const character of characters) {
      lines.push(`### ${character.name || '名前未設定'}（${character.role}）`);
      lines.push('');
      if (character.age) lines.push(`- 年齢：${character.age}`);
      if (character.appearance) lines.push(`- 外見：${character.appearance}`);
      if (character.personality) lines.push(`- 性格：${character.personality}`);
      if (character.background) lines.push(`- 背景：${character.background}`);
      if (character.goal) lines.push(`- 目的：${character.goal}`);
      lines.push('');
    }
  }

  if (ordered.length > 0) {
    lines.push('## 本文');
    lines.push('');
    for (const act of ACTS) {
      const actScenes = ordered.filter((s) => s.act === act.id);
      if (actScenes.length === 0) continue;

      lines.push(`### ${act.label}`);
      lines.push('');
      for (const scene of actScenes) {
        lines.push(`#### ${scene.title || '無題のシーン'}`);
        lines.push('');
        if (scene.summary) {
          lines.push(`*${scene.summary}*`);
          lines.push('');
        }
        lines.push(scene.body.trim() || '（未執筆）');
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

/** ファイル名に使えない文字を落とす */
export function toSafeFileName(title: string, fallback = 'novel'): string {
  const cleaned = title.replace(/[\\/:*?"<>|]/g, '').trim();
  return cleaned || fallback;
}

/** テキストをファイルとしてダウンロードさせる（ブラウザ専用） */
export function downloadTextFile(fileName: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
