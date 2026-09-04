import 'server-only';

import { generateText } from './openai';

/**
 * 小説のどこに挿絵を入れるかを、テキストモデル（既定は gpt-5.5）に決めさせる。
 *
 * 位置の指定は「何番目のシーンの、何段落目のあとか」で受け取る。
 * 本文をそのまま返させると長くなるうえ、書き換えられる恐れがあるため、
 * 番号だけを受け取って本文の加工はクライアント側で行う。
 */

export interface IllustrationPlan {
  /** 1 始まり。渡したシーンの並び順 */
  sceneNumber: number;
  /** この段落のあとに挿し込む（0 = 冒頭、1 始まりで段落末尾） */
  afterParagraph: number;
  /** 何を描くか。絵柄の指定はここには含めない */
  description: string;
  /** 画面に出す短い説明 */
  caption: string;
}

export interface SceneForPlanning {
  id: string;
  title: string;
  /** マーカーを除いた本文 */
  body: string;
}

/** 本文の長さから挿絵の枚数を決める（1〜5 枚） */
export function planIllustrationCount(totalChars: number): number {
  if (totalChars < 800) return 1;
  if (totalChars < 1600) return 2;
  if (totalChars < 2400) return 3;
  if (totalChars < 3200) return 4;
  return 5;
}

const SYSTEM_PROMPT = [
  'あなたは小説に挿絵を入れる編集者です。',
  '本文を読み、絵にすると効果的な山場を選んで挿絵の位置と内容を決めます。',
  '出力は JSON 配列だけ。説明・見出し・コードフェンスは書きません。',
].join('\n');

/** モデルの応答から JSON 配列を取り出す */
function parseArray(response: string): unknown[] | null {
  const match = response.match(/\[[\s\S]*\]/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * 挿絵の計画を立てる。
 * 失敗したときは空配列を返す（挿絵なしで先へ進めるようにする）。
 */
export async function planIllustrations({
  title,
  scenes,
  count,
}: {
  title: string;
  scenes: SceneForPlanning[];
  count: number;
}): Promise<IllustrationPlan[]> {
  const outline = scenes
    .map((scene, i) => {
      const paragraphs = scene.body
        .split(/\n+/)
        .map((p) => p.trim())
        .filter(Boolean);
      const numbered = paragraphs
        .map((p, n) => `  ${n + 1}. ${p.slice(0, 120)}`)
        .join('\n');
      return `シーン${i + 1}「${scene.title || '無題'}」（全${paragraphs.length}段落）\n${numbered}`;
    })
    .join('\n\n');

  const user = [
    `【作品タイトル】\n${title || '無題'}`,
    `【本文】\n${outline}`,
    [
      '【指示】',
      `- 挿絵をちょうど ${count} 枚選ぶこと`,
      '- 物語が動く場面・情景が印象的な場面を選ぶ',
      '- 同じシーンに固めず、できるだけ話の流れに沿って散らす',
      '- afterParagraph はその段落の直後に絵を置くという意味。0 なら本文の前',
      '- description は「何を描くか」を英語で具体的に書く（人物の姿・場所・動き・光）',
      '- description に絵柄の指定や文字を描く指示は入れない（別途こちらで付ける）',
      '- caption は 20 文字以内の日本語',
    ].join('\n'),
    [
      '【出力形式】',
      'JSON 配列のみ。例:',
      '[{"sceneNumber":1,"afterParagraph":2,"description":"A girl standing between tall bookshelves in a dark library at night, holding a faintly glowing book","caption":"光る本との出会い"}]',
    ].join('\n'),
  ].join('\n\n');

  console.log(`🖼️ Planning ${count} illustrations with gpt-5.5...`);

  try {
    const response = await generateText({ system: SYSTEM_PROMPT, user });
    const parsed = parseArray(response);
    if (!parsed) {
      console.error('❌ 挿絵の計画を読み取れませんでした:', response.slice(0, 200));
      return [];
    }

    const plans = parsed
      .map((item): IllustrationPlan | null => {
        const raw = item as Partial<IllustrationPlan>;
        const sceneNumber = Math.round(Number(raw.sceneNumber));
        const description = String(raw.description ?? '').trim();
        if (!description || !Number.isFinite(sceneNumber)) return null;
        return {
          sceneNumber: Math.min(Math.max(1, sceneNumber), scenes.length),
          afterParagraph: Math.max(0, Math.round(Number(raw.afterParagraph)) || 0),
          description,
          caption: String(raw.caption ?? '').trim().slice(0, 20),
        };
      })
      .filter((plan): plan is IllustrationPlan => plan !== null)
      .slice(0, count);

    console.log(`✅ Planned ${plans.length} illustrations`);
    return plans;
  } catch (error) {
    console.error('❌ 挿絵の計画に失敗:', error);
    return [];
  }
}
