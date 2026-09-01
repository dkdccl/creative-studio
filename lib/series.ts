import { sortScenesByAct, type Character, type NovelProject } from './types';

/**
 * 連載（シリーズ）と各話の記録。
 *
 * 現段階では localStorage に持ち（lib/series-storage.ts）、
 * Supabase の series / novels テーブルへ移せるよう同じ形にしてある。
 */

/** あらすじに使う文字数 */
export const SUMMARY_LENGTH = 100;

/** エンディングに使う文字数 */
export const ENDING_LENGTH = 50;

export type EpisodeStatus = 'draft' | 'editing' | 'done';

export const EPISODE_STATUS_LABELS: Record<EpisodeStatus, string> = {
  draft: '下書き',
  editing: '編集中',
  done: '完成',
};

/** 各話に登場した人物（次の話へ引き継ぐ元になる） */
export interface EpisodeCharacter {
  name: string;
  role: string;
  description: string;
}

export interface SeriesRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface EpisodeRecord {
  id: string;
  seriesId: string;
  /** 話数（第 N 話） */
  episode: number;
  title: string;
  /** 本文の最初の 100 字 */
  summary: string;
  /** 本文の最後の 50 字 */
  ending: string;
  characters: EpisodeCharacter[];
  status: EpisodeStatus;
  charCount: number;
  updatedAt: string;
}

/** マーカーと空白を落とした本文（あらすじ・エンディングの抽出用） */
export function plainBody(project: NovelProject): string {
  return sortScenesByAct(project.scenes)
    .map((scene) => scene.body)
    .join('')
    .replace(/\[(🎨 漫画シーン|📸 写真シーン) \d+\]/g, '')
    .replace(/\s+/g, '');
}

export function extractSummary(project: NovelProject): string {
  return plainBody(project).slice(0, SUMMARY_LENGTH);
}

export function extractEnding(project: NovelProject): string {
  const text = plainBody(project);
  return text.slice(Math.max(0, text.length - ENDING_LENGTH));
}

export function toEpisodeCharacters(characters: Character[]): EpisodeCharacter[] {
  return characters
    .filter((character) => character.name.trim())
    .map((character) => ({
      name: character.name.trim(),
      role: character.role,
      description: [character.personality, character.goal]
        .filter(Boolean)
        .join(' / '),
    }));
}

/** 執筆の進み具合から話のステータスを決める */
export function deriveStatus(project: NovelProject): EpisodeStatus {
  const scenes = project.scenes;
  if (scenes.length === 0) return 'draft';
  const written = scenes.filter((scene) => scene.body.trim().length > 0);
  if (written.length === 0) return 'draft';
  return written.length === scenes.length ? 'done' : 'editing';
}

/** 保存時に記録する 1 話分のデータを組み立てる */
export function buildEpisodeRecord({
  id,
  seriesId,
  episode,
  project,
}: {
  id: string;
  seriesId: string;
  episode: number;
  project: NovelProject;
}): EpisodeRecord {
  return {
    id,
    seriesId,
    episode,
    title: project.theme.title.trim() || `第${episode}話`,
    summary: extractSummary(project),
    ending: extractEnding(project),
    characters: toEpisodeCharacters(project.characters),
    status: deriveStatus(project),
    charCount: plainBody(project).length,
    updatedAt: new Date().toISOString(),
  };
}
