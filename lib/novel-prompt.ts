import {
  POV_LABELS,
  TONE_LABELS,
  type Character,
  type NovelTheme,
} from './types';

/**
 * 小説本文を生成するときのプロンプト組み立て。
 *
 * 画面側でも同じ関数を呼んで「送信プロンプト」を見せられるように、
 * API ルートではなくここに置いている（漫画側の buildMangaGenerationPrompt と同じ方針）。
 */

/** 生成する本文の長さの目安 */
export const NOVEL_LENGTH_PRESETS = [
  { id: 'short', label: '短め', chars: 400 },
  { id: 'medium', label: '標準', chars: 800 },
  { id: 'long', label: '長め', chars: 1600 },
] as const;

export type NovelLengthId = (typeof NOVEL_LENGTH_PRESETS)[number]['id'];

export const MIN_NOVEL_CHARS = 100;
export const MAX_NOVEL_CHARS = 4000;

/** 文字数の目安を許容範囲に収める */
export function clampNovelChars(chars: number): number {
  return Math.min(
    MAX_NOVEL_CHARS,
    Math.max(MIN_NOVEL_CHARS, Math.round(chars) || 800),
  );
}

/** 直前の本文を渡すときの上限。長すぎるとプロンプトが膨らむので末尾だけ使う */
export const CONTEXT_TAIL_CHARS = 1200;

export const NOVEL_SYSTEM_PROMPT = [
  'あなたは日本語の小説を書く作家です。',
  '与えられた設定とシーンのあらすじにもとづいて、小説の本文だけを書いてください。',
  '説明や前置き、見出し、マークダウン記法、「はい、承知しました」のような返事は書かないでください。',
].join('\n');

export interface NovelScenePromptInput {
  theme: NovelTheme;
  sceneTitle: string;
  sceneSummary: string;
  /** このシーンに登場する人物 */
  characters: Character[];
  /** 続きから書くときの直前の本文（末尾だけ渡す） */
  previousBody?: string;
  /** 目安の文字数 */
  chars: number;
}

function formatCharacter(character: Character): string {
  const head = [character.name || '名前未設定', character.role]
    .filter(Boolean)
    .join('・');
  const details = [
    character.age && `年齢: ${character.age}`,
    character.personality && `性格: ${character.personality}`,
    character.goal && `目的: ${character.goal}`,
  ].filter(Boolean);
  return details.length > 0 ? `- ${head}（${details.join(' / ')}）` : `- ${head}`;
}

/** 生成リクエストの user メッセージを組み立てる */
export function buildNovelScenePrompt({
  theme,
  sceneTitle,
  sceneSummary,
  characters,
  previousBody,
  chars,
}: NovelScenePromptInput): string {
  const sections: string[] = [];

  const work = [
    theme.title && `タイトル: ${theme.title}`,
    theme.genres.length > 0 && `ジャンル: ${theme.genres.join('、')}`,
    theme.logline && `ログライン: ${theme.logline}`,
    theme.theme && `テーマ: ${theme.theme}`,
    `視点: ${POV_LABELS[theme.pov]}`,
    `文体: ${TONE_LABELS[theme.tone]}`,
  ].filter(Boolean);
  sections.push(`【作品】\n${work.join('\n')}`);

  if (characters.length > 0) {
    sections.push(`【登場人物】\n${characters.map(formatCharacter).join('\n')}`);
  }

  const scene = [
    sceneTitle && `タイトル: ${sceneTitle}`,
    sceneSummary && `あらすじ: ${sceneSummary}`,
  ].filter(Boolean);
  sections.push(`【このシーン】\n${scene.join('\n')}`);

  const tail = previousBody?.trim().slice(-CONTEXT_TAIL_CHARS);
  if (tail) {
    sections.push(`【直前までの本文】\n${tail}`);
  }

  const rules = [
    `${chars}字程度の日本語で書く`,
    '指定された視点と文体を最後まで守る',
    '説明で済ませず、描写と会話で場面を進める',
    tail
      ? '【直前までの本文】の続きとして、自然につながるように書き始める'
      : 'シーンの冒頭から書き始める',
    '本文だけを出力し、見出しや注釈は付けない',
  ];
  sections.push(`【指示】\n${rules.map((r) => `- ${r}`).join('\n')}`);

  return sections.join('\n\n');
}
