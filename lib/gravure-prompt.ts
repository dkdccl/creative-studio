/**
 * グラビア用のプロンプト自動生成。
 *
 * ポーズは自然なものに寄せ、衣装・照明・アングル・表情の側で雰囲気を作る。
 * 要素を組み合わせるだけなので、回ごとに違う絵柄になりつつ方向性は揃う。
 *
 * 被写体は必ず成人と明記する。年齢が曖昧なまま生成すると、モデル側が
 * 意図しない出力を返すことがあり、Amazon KDP でも弾かれるため。
 */

/** 自然なポーズ。ここは「決めポーズ」にしない */
export const NATURAL_POSES = [
  'relaxed sitting position',
  'casual stretching',
  'natural lounging',
  'resting on bed',
  'standing casually',
  'leaning against wall',
  'lying down comfortably',
  'sitting cross-legged',
  'bending forward naturally',
  'looking over shoulder',
] as const;

/** 衣装 */
export const OUTFITS = [
  'sheer silk robe',
  'delicate lace lingerie',
  'minimal bikini',
  'transparent nightwear',
  'silk negligee',
  'lace bodysuit',
  'semi-sheer dress',
  'leather lingerie',
  'sheer stockings',
  'silk slip dress',
] as const;

/** 照明 */
export const LIGHTING = [
  'backlighting creates silhouette',
  'dramatic shadows on body',
  'soft golden hour lighting',
  'subtle candlelight',
  'bedroom mood lighting',
  'warm glow highlighting curves',
  'cinematic lighting',
  'studio rim lighting',
  'sunset glow on skin',
  'intimate indoor lighting',
] as const;

/** カメラアングル */
export const ANGLES = [
  'low angle shot',
  'upward camera perspective',
  'close-up focus on details',
  'full body in frame',
  'side profile angle',
  'over-the-shoulder view',
  'looking directly at camera',
  'camera at eye level',
  'slightly upward gaze',
  'confident direct look',
] as const;

/** 表情・ムード */
export const MOODS = [
  'confident and sensual',
  'sultry expression',
  'seductive gaze',
  'playful and flirty',
  'intimate mood',
  'mysterious and alluring',
  'confident beauty',
  'inviting expression',
  'alluring look',
  'subtle seduction',
] as const;

/** 背景 */
export const BACKGROUNDS = [
  'luxury bedroom',
  'modern apartment',
  'resort room',
  'silk sheets',
  'minimalist interior',
  'hotel suite',
  'upscale bathroom',
  'outdoor garden',
  'beach resort',
  'private villa',
] as const;

/** 毎回付ける仕上げの指定 */
const FINISH = [
  'professional gravure photography',
  'high quality, sharp focus',
  'sensual and elegant',
  '50mm lens, f/2.8',
  'masterpiece, aesthetic',
] as const;

/** 被写体の指定。年齢を曖昧にしない */
const SUBJECT = 'a beautiful adult woman in her 20s';

function pick<T>(list: readonly T[], random: () => number): T {
  return list[Math.floor(random() * list.length)];
}

/**
 * ポーズの決め方。
 *
 * random は毎回ばらけるので一番多様になる。cycle は一覧を順番に回すので
 * 何が出るか読める。manual は 1 つに固定して、衣装や照明だけ変える。
 */
export type PoseMode = 'random' | 'cycle' | 'manual';

export const POSE_MODE_LABELS: Record<PoseMode, { label: string; hint: string }> = {
  random: {
    label: '🎲 Random（ランダム）',
    hint: '毎回ちがうポーズになります。一番ばらけます',
  },
  cycle: {
    label: '🔄 Cycle（順番に回す）',
    hint: '一覧の上から順に使います。何が出るか読めます',
  },
  manual: {
    label: '🎯 Manual（手動指定）',
    hint: '選んだポーズで固定し、衣装・背景・照明だけ変わります',
  },
};

export function selectPose(
  mode: PoseMode,
  session: number,
  manualPose: string | undefined,
  random: () => number,
): string {
  if (mode === 'manual') return manualPose || NATURAL_POSES[0];
  if (mode === 'cycle') {
    return NATURAL_POSES[(Math.max(1, session) - 1) % NATURAL_POSES.length];
  }
  return pick(NATURAL_POSES, random);
}

/** プロンプトの組み立て方 */
export interface PromptOptions {
  poseMode?: PoseMode;
  manualPose?: string;
}

/**
 * 1 回ぶんのプロンプトを組み立てる。
 *
 * ポーズの決め方だけ選べるようにして、残りは常にランダムにする。
 * ポーズを固定しても衣装・背景・照明・表情は変わるので、
 * 同じ構図の中で違いが出る。
 */
export function composeGravurePrompt(
  session: number,
  { poseMode = 'random', manualPose }: PromptOptions = {},
  random: () => number = Math.random,
): string {
  const pose = selectPose(poseMode, session, manualPose, random);

  return [
    `${SUBJECT} in a ${pick(OUTFITS, random)}`,
    pose,
    `in a ${pick(BACKGROUNDS, random)}`,
    pick(LIGHTING, random),
    pick(ANGLES, random),
    `expression: ${pick(MOODS, random)}`,
    ...FINISH,
  ].join(', ');
}

/** 回数ぶんまとめて作る。画面のプレビューと実際の生成で同じものを使う */
export function composeGravurePrompts(
  sessions: number,
  options: PromptOptions = {},
  random: () => number = Math.random,
): string[] {
  return Array.from({ length: Math.max(1, sessions) }, (_, i) =>
    composeGravurePrompt(i + 1, options, random),
  );
}
