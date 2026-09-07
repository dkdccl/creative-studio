import 'server-only';

import { generateText } from '@/lib/openai';
import {
  DEFAULT_SCENE_TYPE,
  SCENE_TYPES,
  SCENE_TYPE_DESCRIPTIONS,
  clampPages,
  getAutoFrameCount,
  normalizeSceneType,
  resolveFrameCount,
  splitStoryByPages,
  type PageConfig,
  type PanelCount,
  type SceneType,
} from '@/lib/scene-blocks';

/**
 * ストーリーを読んで、実際の漫画のようにページごとのコマ割りを決める。
 *
 * 「感動する場面は大ゴマ、会話はテンポよく細かく」という漫画の作法を
 * テキストモデルに判定させ、その結果をコマ数に落とす。
 * 失敗しても漫画自体は出したいので、例外は投げずに既定のコマ割りを返す。
 */

export interface SceneAnalysis {
  sceneType: SceneType;
  /** そのシーンに割り当てるコマ数 */
  recommendedFrames: PanelCount;
  /** そう判定した理由（UI に出す。無いこともある） */
  reason?: string;
}

/** ページ番号つきの判定結果。そのまま PageConfig として使える */
export interface ScenePageLayout extends PageConfig {
  sceneType: SceneType;
  reason?: string;
}

const SYSTEM_PROMPT = [
  'あなたは漫画のネーム（コマ割り）を決める編集者です。',
  'ストーリーの場面の性質を読み取り、実際の漫画と同じ基準でコマ数を決めます。',
  '出力は JSON だけ。説明・見出し・コードフェンスは一切書きません。',
].join('\n');

/** 判定基準。1 ページ用と全ページ用で同じものを使う */
const CRITERIA = [
  '【判定基準】',
  '1. 感動・重要シーン → 大きなコマ（1〜2コマ/ページ）',
  '2. 会話シーン → 細かいコマ（6〜8コマ/ページ）',
  '3. アクション・動き → 複雑なコマ（7〜9コマ/ページ）',
  '4. 景色描写 → 大きなコマ（1〜3コマ/ページ）',
  '5. キャラ表情アップ → 中〜大（3〜5コマ/ページ）',
].join('\n');

const SCENE_TYPE_LIST = SCENE_TYPES.map(
  (type) => `- ${type}: ${SCENE_TYPE_DESCRIPTIONS[type]}`,
).join('\n');

/** モデルの応答から最初の JSON オブジェクトを取り出す。取れなければ null */
function parseObject(response: string): Record<string, unknown> | null {
  const match = response.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** モデルの応答から JSON 配列を取り出す。取れなければ null */
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

/** 判定結果 1 件を安全な形に整える */
function toAnalysis(raw: Record<string, unknown> | null): SceneAnalysis {
  if (!raw) {
    return {
      sceneType: DEFAULT_SCENE_TYPE,
      recommendedFrames: getAutoFrameCount(DEFAULT_SCENE_TYPE),
    };
  }
  const sceneType = normalizeSceneType(raw.sceneType);
  const reason =
    typeof raw.reason === 'string' && raw.reason.trim()
      ? raw.reason.trim().slice(0, 60)
      : undefined;
  return {
    sceneType,
    recommendedFrames: resolveFrameCount(sceneType, raw.recommendedFrames),
    reason,
  };
}

/**
 * 1 場面ぶんのテキストを見て、シーンの種類と適したコマ数を判定する。
 */
export async function analyzeScene(storyText: string): Promise<SceneAnalysis> {
  const text = storyText.trim();
  if (!text) {
    return {
      sceneType: DEFAULT_SCENE_TYPE,
      recommendedFrames: getAutoFrameCount(DEFAULT_SCENE_TYPE),
    };
  }

  const user = [
    `【ストーリーシーン】\n${text}`,
    `【シーンの種類】\n${SCENE_TYPE_LIST}`,
    CRITERIA,
    [
      '【出力形式】',
      'JSON オブジェクトのみ。reason は 30 文字以内の日本語。',
      '例: {"sceneType": "会話", "recommendedFrames": 6, "reason": "掛け合いが続くため"}',
    ].join('\n'),
  ].join('\n\n');

  try {
    const started = Date.now();
    const response = await generateText({ system: SYSTEM_PROMPT, user });
    console.log(`🧠 シーン判定 ${Date.now() - started}ms`);
    return toAnalysis(parseObject(response));
  } catch (error) {
    console.error('❌ シーン判定に失敗:', error);
    return {
      sceneType: DEFAULT_SCENE_TYPE,
      recommendedFrames: getAutoFrameCount(DEFAULT_SCENE_TYPE),
    };
  }
}

/**
 * ストーリー全体を読んで、全ページぶんのコマ割りを一度に決める。
 *
 * ページごとに呼ぶと前後のつながりが見えず、どのページも同じ判定になりやすい。
 * まとめて 1 回で聞き、失敗したときだけページごとの判定に切り替える。
 */
export async function analyzeStoryLayout(
  story: string,
  totalPages: number,
): Promise<ScenePageLayout[]> {
  const pages = clampPages(totalPages);
  const segments = splitStoryByPages(story, pages);

  const user = [
    `【ストーリー全体】\n${story.trim()}`,
    `【ページ数】\n全 ${pages} ページ`,
    `【各ページで描く場面】\n${segments
      .map((segment, i) => `${i + 1}ページ目: ${segment}`)
      .join('\n')}`,
    `【シーンの種類】\n${SCENE_TYPE_LIST}`,
    CRITERIA,
    [
      '【条件】',
      `- 要素数はちょうど ${pages} 個。1 ページ目から順に並べること`,
      '- 全ページを同じ種類にせず、物語の流れに合わせて緩急をつけること',
      '- 山場は大ゴマ、会話やアクションは細かいコマ、と漫画らしい構成にすること',
      '- reason は 30 文字以内の日本語',
    ].join('\n'),
    [
      '【出力形式】',
      'JSON 配列のみ。例:',
      '[{"pageNumber": 1, "sceneType": "景色", "recommendedFrames": 2, "reason": "舞台を見せる導入"},',
      ' {"pageNumber": 2, "sceneType": "会話", "recommendedFrames": 6, "reason": "掛け合いが続く"}]',
    ].join('\n'),
  ].join('\n\n');

  let parsed: unknown[] | null = null;
  try {
    const started = Date.now();
    const response = await generateText({ system: SYSTEM_PROMPT, user });
    console.log(`🧠 全 ${pages} ページのコマ割り判定 ${Date.now() - started}ms`);
    parsed = parseArray(response);
    if (!parsed) {
      console.error('❌ コマ割りの JSON を取り出せませんでした:', response.slice(0, 200));
    }
  } catch (error) {
    console.error('❌ コマ割りの一括判定に失敗:', error);
  }

  // 一括で取れなかったときは、ページごとに判定し直す
  if (!parsed) {
    const perPage = await Promise.all(
      segments.map((segment) => analyzeScene(segment)),
    );
    return perPage.map((analysis, i) => ({
      pageNumber: i + 1,
      panelsCount: analysis.recommendedFrames,
      sceneType: analysis.sceneType,
      reason: analysis.reason,
    }));
  }

  // 足りない・多いページがあっても崩れないよう、ページ番号で引き直す
  const items = parsed;
  const asRecord = (value: unknown): Record<string, unknown> | null =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;

  return Array.from({ length: pages }, (_, i) => {
    const pageNumber = i + 1;
    const found = items
      .map(asRecord)
      .find(
        (item) => item && Math.round(Number(item.pageNumber)) === pageNumber,
      );

    const analysis = toAnalysis(found ?? asRecord(items[i]));
    return {
      pageNumber,
      panelsCount: analysis.recommendedFrames,
      sceneType: analysis.sceneType,
      reason: analysis.reason,
    };
  });
}
