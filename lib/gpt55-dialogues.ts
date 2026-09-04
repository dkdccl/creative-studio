import 'server-only';

import { generateText } from '@/lib/openai';
import { normalizePanelCount, type PageConfig, type PanelCount } from '@/lib/scene-blocks';

/**
 * コマごとのセリフをテキストモデル（既定は gpt-5.5）で先に書かせる。
 *
 * 画像モデルに日本語を描かせると崩れやすいので、
 * セリフはここで作って、あとから Canvas で画像に重ねる。
 * 失敗しても漫画自体は出したいので、例外は投げずに空文字で埋めて返す。
 */

/** 1 コマぶんのセリフの上限。長いと吹き出しに収まらない */
const MAX_DIALOGUE_LENGTH = 20;

export interface DialogueGenerationOptions {
  story: string;
  panelsCount: PanelCount;
  mood: string | string[];
  pageNumber?: number;
  totalPages?: number;
}

const SYSTEM_PROMPT = [
  'あなたは漫画のセリフライターです。',
  '与えられたストーリーを指定されたコマ数に分け、各コマのセリフを 1 つずつ書きます。',
  '出力は JSON 配列だけ。説明・見出し・コードフェンスは一切書きません。',
].join('\n');

/** モデルの応答から JSON 配列を取り出す。取れなければ null */
function parseDialogueArray(response: string): unknown[] | null {
  // コードフェンスや前置きが混ざっても拾えるように、最初の [ から最後の ] までを見る
  const match = response.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** コマ数ぴったりの配列に整える。多ければ切り、少なければ空文字で埋める */
function fitToPanels(dialogues: unknown[], panelsCount: number): string[] {
  const cleaned = dialogues
    .filter((d) => d !== null && d !== undefined)
    .map((d) => String(d).trim().slice(0, MAX_DIALOGUE_LENGTH))
    .slice(0, panelsCount);

  while (cleaned.length < panelsCount) cleaned.push('');
  return cleaned;
}

/** 1 ページぶんのセリフを作る */
export async function generateDialoguesWithGPT55({
  story,
  panelsCount,
  mood,
  pageNumber = 1,
  totalPages = 1,
}: DialogueGenerationOptions): Promise<string[]> {
  const panels = normalizePanelCount(panelsCount);
  const moodText = Array.isArray(mood) ? mood.join(', ') : mood;

  console.log(
    `🎭 Generating dialogues with gpt-5.5... (ページ ${pageNumber}/${totalPages}, ${panels}コマ, ${moodText})`,
  );

  const user = [
    `【ストーリー全体】\n${story}`,
    `【雰囲気】\n${moodText}`,
    `【ページ】\n全 ${totalPages} ページのうち ${pageNumber} ページ目`,
    `【コマ数】\n${panels} コマ`,
    [
      '【条件】',
      `- 要素数はちょうど ${panels} 個`,
      `- 1 つあたり ${MAX_DIALOGUE_LENGTH} 文字以内`,
      '- 日本語のみ。話し言葉で、コマ順に自然につながること',
      '- このページの場面に合う内容にすること',
      '- セリフが不要なコマは空文字 "" にする',
    ].join('\n'),
    `【出力形式】\nJSON 配列のみ。例: ["えっ…？", "本がしゃべった！", "", "どうしよう"]`,
  ].join('\n\n');

  try {
    const started = Date.now();
    // generateText は { system, user } を取る。max_tokens は送れないので長さは指示文で伝える
    const response = await generateText({ system: SYSTEM_PROMPT, user });
    console.log(`   gpt-5.5 応答 ${Date.now() - started}ms`);

    const parsed = parseDialogueArray(response);
    if (!parsed) {
      console.error('❌ セリフの JSON を取り出せませんでした:', response.slice(0, 200));
      return Array(panels).fill('');
    }

    const dialogues = fitToPanels(parsed, panels);
    console.log(`✅ Parsed ${dialogues.length} dialogues: ${JSON.stringify(dialogues)}`);
    return dialogues;
  } catch (error) {
    console.error('❌ gpt-5.5 でのセリフ生成に失敗:', error);
    return Array(panels).fill('');
  }
}

/**
 * 複数ページぶんのセリフをまとめて作る。
 * 1 ページでも失敗したら、そのページだけ空にして残りは続ける。
 */
export async function generateAllDialoguesWithGPT55(
  pageConfigs: PageConfig[],
  story: string,
  totalPages: number,
  mood: string | string[],
): Promise<string[][]> {
  const results: string[][] = [];

  for (const config of pageConfigs) {
    try {
      results.push(
        await generateDialoguesWithGPT55({
          story,
          panelsCount: config.panelsCount,
          mood,
          pageNumber: config.pageNumber,
          totalPages,
        }),
      );
    } catch (error) {
      console.error(`ページ ${config.pageNumber} のセリフ生成に失敗:`, error);
      results.push(Array(normalizePanelCount(config.panelsCount)).fill(''));
    }

    // レート制限対策
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log(`✅ Generated dialogues for ${results.length} pages`);
  return results;
}
