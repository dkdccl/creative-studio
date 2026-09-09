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

/**
 * 水着の面積。
 *
 * standard は OUTFITS をそのまま使う。small / micro を選ぶと
 * 水着系の衣装に絞ったうえで、面積を小さくする語を足す。
 * 被写体が成人であることは SUBJECT で常に明示しているので、
 * ここを変えても年齢の指定は動かない。
 */
export type SwimwearSize = 'standard' | 'small' | 'micro';

export const SWIMWEAR_SIZE_LABELS: Record<
  SwimwearSize,
  { label: string; hint: string }
> = {
  standard: {
    label: '標準',
    hint: '衣装は一覧からランダム。水着に限定しません',
  },
  small: {
    label: '小さめ',
    hint: '水着に寄せて、面積を小さめにします',
  },
  micro: {
    label: 'かなり小さめ',
    hint: '水着に限定し、面積をさらに小さくします',
  },
};

/** 小さめを選んだときに使う水着 */
const SWIMWEAR = [
  'small triangle bikini',
  'string bikini',
  'minimal bandeau bikini',
  'thin-strap bikini',
  'high-leg one piece swimsuit',
] as const;

/** 面積を小さくする言い方。size ごとに強さを変える */
const SWIMWEAR_MODIFIERS: Record<SwimwearSize, readonly string[]> = {
  standard: [],
  small: ['small cut', 'narrow straps', 'minimal coverage'],
  micro: ['very small cut', 'thin string straps', 'micro coverage', 'skimpy fit'],
};

/**
 * 照明。
 *
 * 屋内と屋外で分けている。ひとつの一覧から選ぶと
 * 「海辺 ＋ ろうそくの灯り」のような噛み合わない組み合わせが出るため。
 */
export const INDOOR_LIGHTING = [
  'backlighting creates silhouette',
  'dramatic shadows on body',
  'subtle candlelight',
  'bedroom mood lighting',
  'warm glow highlighting curves',
  'cinematic lighting',
  'studio rim lighting',
  'intimate indoor lighting',
  'soft window light',
] as const;

export const OUTDOOR_LIGHTING = [
  'soft golden hour lighting',
  'sunset glow on skin',
  'bright natural sunlight',
  'dappled light through leaves',
  'sunlight reflecting off water',
  'backlit by the sun',
  'clear midday sky light',
  'warm afternoon sun',
  'sea breeze and open shade',
] as const;

/** 互換のために残す。中身は屋内・屋外を合わせたもの */
export const LIGHTING = [...INDOOR_LIGHTING, ...OUTDOOR_LIGHTING] as const;

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

/**
 * 表情・ムード。
 *
 * 常に笑顔にするため、すべて笑顔を前提にした言い方でそろえる。
 * 「sultry」「mysterious」のような笑っていない表情を混ぜると、
 * あとから足す笑顔の指定と打ち消し合って効きが読めなくなる。
 * 笑い方（口元・目元・強さ）だけを振って変化を出す。
 */
export const MOODS = [
  'bright cheerful smile',
  'soft gentle smile',
  'warm friendly smile',
  'playful smile with sparkling eyes',
  'relaxed happy smile',
  'confident smile',
  'smiling with slightly parted lips',
  'smiling with eyes narrowed in delight',
  'candid natural smile',
  'radiant beaming smile',
] as const;

/**
 * 常に足す笑顔の指定。
 *
 * MOODS でも笑顔を選ぶが、モデルは表情を落としがちなので
 * 仕上げ側にも重ねて入れ、さらに negative で無表情を弾く。
 */
export const ALWAYS_SMILING = 'smiling, happy expression, looking at the camera';

/** 背景（屋内） */
export const INDOOR_BACKGROUNDS = [
  'luxury bedroom',
  'modern apartment',
  'resort room',
  'silk sheets',
  'minimalist interior',
  'hotel suite',
  'upscale bathroom',
  'private villa',
] as const;

/**
 * 背景（屋外）。
 *
 * 海辺・木陰・岩場・プールなど、自然光の入る場所を並べる。
 * 「beach」だけだと人の多いビーチになりやすいので、
 * 静かな場所だと分かる語（secluded, quiet）を添えている。
 */
export const OUTDOOR_BACKGROUNDS = [
  'secluded sandy beach at the shoreline',
  'shallow clear sea water by the shore',
  // 照明は OUTDOOR_LIGHTING 側で付くので、ここには場所だけ書く。
  // 両方に光の指定を入れると重なって効きが読めなくなる。
  'shade under a large seaside tree',
  'rocky coastal outcrop with tide pools',
  'weathered rocks by the sea',
  'poolside of a quiet resort',
  'edge of an infinity pool overlooking the sea',
  'palm grove near the beach',
  'grassy cliff overlooking the ocean',
  'wooden deck facing the sea',
  'quiet cove surrounded by rocks',
  'sandbar at low tide',
] as const;

/** 互換のために残す。中身は屋内・屋外を合わせたもの */
export const BACKGROUNDS = [
  ...INDOOR_BACKGROUNDS,
  ...OUTDOOR_BACKGROUNDS,
] as const;

/**
 * どこで撮るか。
 * 背景と照明をここで揃えて選ぶので、噛み合わない組み合わせが出ない。
 */
export type SceneSetting = 'outdoor' | 'indoor' | 'mixed';

export const SCENE_SETTING_LABELS: Record<
  SceneSetting,
  { label: string; hint: string }
> = {
  outdoor: {
    label: '🌊 屋外（自然光）',
    hint: '海辺・木陰・岩場・プールなど。自然光で仕上げます',
  },
  indoor: {
    label: '🛏 屋内',
    hint: '寝室・ホテル・室内。照明で雰囲気を作ります',
  },
  mixed: {
    label: '🔀 混在',
    hint: '屋外と屋内をどちらも使います',
  },
};

/** 背景と、それに合う照明をひと組で選ぶ */
function selectScene(
  setting: SceneSetting,
  random: () => number,
): { background: string; lighting: string } {
  const outdoor =
    setting === 'outdoor' || (setting === 'mixed' && random() < 0.5);

  return outdoor
    ? {
        background: pick(OUTDOOR_BACKGROUNDS, random),
        lighting: pick(OUTDOOR_LIGHTING, random),
      }
    : {
        background: pick(INDOOR_BACKGROUNDS, random),
        lighting: pick(INDOOR_LIGHTING, random),
      };
}

/** 毎回付ける仕上げの指定 */
const FINISH = [
  ALWAYS_SMILING,
  'professional gravure photography',
  'photorealistic, high resolution, sharp focus',
  'natural skin texture, detailed hair',
  'clean composition, balanced framing',
  'sensual and elegant',
  '50mm lens, f/2.8, shallow depth of field',
  'masterpiece, aesthetic',
] as const;

/**
 * 避けたいもの。
 *
 * これまで negative を渡していなかったので、指の破綻や
 * 文字の描き込みがそのまま出ていた。
 * 「no 〜」を positive 側に書くと逆に効くため、ここにまとめる。
 */
export const GRAVURE_NEGATIVE = [
  'deformed hands, extra fingers, fused fingers, malformed limbs',
  'extra arms, extra legs, disfigured, bad anatomy',
  'text, letters, watermark, signature, logo, caption',
  'blurry, low quality, jpeg artifacts, oversaturated',
  'plastic skin, waxy skin, airbrushed to plastic',
  'cluttered background, crowded beach, many people',
  // 常に笑顔にするため、笑っていない表情を弾く
  'expressionless, blank stare, frowning, sad, angry, pouting, serious face',
].join(', ');

/** 被写体の指定。年齢を曖昧にしない */
const SUBJECT = 'a beautiful adult woman in her 20s';

/**
 * 体型の指定。
 *
 * 「スタイルが良い」だけだと痩身に寄りやすいので、
 * 曲線のある体型だと分かる語を並べる。
 * 成人であることは SUBJECT 側で必ず言い続ける。
 */
export type BodyType = 'natural' | 'glamorous';

/**
 * 既定は glamorous。体型を選ぶ画面は無いので、実際には常にこれが使われる。
 * natural を残してあるのは、あとから選べるようにしたくなったときのため。
 */
export const DEFAULT_BODY_TYPE: BodyType = 'glamorous';

export const BODY_TYPE_LABELS: Record<
  BodyType,
  { label: string; hint: string }
> = {
  natural: {
    label: '自然体',
    hint: '体型は指定せず、モデル任せにします',
  },
  glamorous: {
    label: 'グラマー',
    hint: 'スタイルが良く、曲線のある体型に寄せます',
  },
};

const BODY_DESCRIPTIONS: Record<BodyType, string> = {
  natural: '',
  glamorous:
    'glamorous curvy figure, hourglass proportions, toned waist, long legs, elegant posture',
};

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

/**
 * まとめて作るとき用の、重複しないポーズの並び。
 *
 * random で 1 枚ずつ引くと、毎回そこから独立に選ぶので同じポーズが出る。
 * 10 種から 5 枚引けば、6 割ほどの確率でどこかが重なる。
 * そこで一覧を混ぜてから順に配り、使い切ったらまた混ぜ直す。
 * こうすると 10 枚までは必ず全部ちがうポーズになる。
 *
 * 画像モデルには «前回と違うポーズで» と言っても通じない。
 * 1 回ごとに独立して描くので、前に何を描いたか覚えていない。
 * 変化は言葉で頼むのではなく、こちらで配り分けて作る。
 */
export function buildPoseSequence(
  count: number,
  random: () => number = Math.random,
): string[] {
  const out: string[] = [];

  while (out.length < count) {
    // Fisher-Yates。混ぜてから前から配る
    const deck = [...NATURAL_POSES];
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    // 山を配り直すときに、前の最後と次の先頭が同じにならないようにする
    if (out.length && deck[0] === out[out.length - 1] && deck.length > 1) {
      [deck[0], deck[1]] = [deck[1], deck[0]];
    }

    out.push(...deck.slice(0, count - out.length));
  }

  return out;
}

/**
 * 参考画像の使う順を決める。
 *
 * 毎回ばらばらに引くと、登録した画像に当たり外れが出る。
 * 3 枚あるのに 1 枚も選ばれないものが出てしまうので、
 * ポーズと同じく «混ぜて配る» 形にして、全部の画像が同じ回数だけ
 * 使われるようにする。山を配り直すときは、境目で同じものが
 * 続かないよう入れ替える。
 */
export function buildReferenceSequence(
  total: number,
  count: number,
  random: () => number = Math.random,
): (number | undefined)[] {
  if (total <= 0) return Array.from({ length: count }, () => undefined);
  if (total === 1) return Array.from({ length: count }, () => 1);

  const out: number[] = [];
  while (out.length < count) {
    const deck = Array.from({ length: total }, (_, i) => i + 1);
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    if (out.length && deck[0] === out[out.length - 1] && deck.length > 1) {
      [deck[0], deck[1]] = [deck[1], deck[0]];
    }
    out.push(...deck.slice(0, count - out.length));
  }
  return out;
}

/** 衣装を決める。水着サイズの指定があれば水着に寄せる */
function selectOutfit(size: SwimwearSize, random: () => number): string {
  if (size === 'standard') return pick(OUTFITS, random);

  const modifiers = SWIMWEAR_MODIFIERS[size];
  return `${pick(SWIMWEAR, random)}, ${modifiers.join(', ')}`;
}

/** プロンプトの組み立て方 */
export interface PromptOptions {
  poseMode?: PoseMode;
  manualPose?: string;
  /** 水着の面積 */
  swimwearSize?: SwimwearSize;
  /** 体型 */
  bodyType?: BodyType;
  /** 参考画像の枚数。1 以上ならその中から 1 枚ずつ選ぶ */
  referenceCount?: number;
  /** 屋外・屋内。背景と照明をここで揃える */
  sceneSetting?: SceneSetting;
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
  options: PromptOptions = {},
  random: () => number = Math.random,
  /** まとめて作るときに、外から重ならないポーズを渡す */
  presetPose?: string,
): string {
  const {
    poseMode = 'random',
    manualPose,
    swimwearSize = 'standard',
    bodyType = DEFAULT_BODY_TYPE,
    sceneSetting = 'outdoor',
  } = options;

  const pose = presetPose ?? selectPose(poseMode, session, manualPose, random);
  const body = BODY_DESCRIPTIONS[bodyType];
  // 背景と照明はひと組で選ぶ。別々に引くと噛み合わない絵になる
  const scene = selectScene(sceneSetting, random);

  return [
    `${SUBJECT} in a ${selectOutfit(swimwearSize, random)}`,
    ...(body ? [body] : []),
    pose,
    `at ${scene.background}`,
    scene.lighting,
    pick(ANGLES, random),
    `expression: ${pick(MOODS, random)}`,
    ...FINISH,
  ].join(', ');
}

/** 1 回ぶんの組み立て結果。どの参考画像を使うかも返す */
export interface ComposedShot {
  prompt: string;
  pose: string;
  /** 1 始まり。参考画像を使わないときは未設定 */
  referenceIndex?: number;
}

/**
 * 回数ぶんまとめて作る。画面のプレビューと実際の生成で同じものを使う。
 *
 * poseMode が random のときは、ここで重ならないポーズを配る。
 * 1 枚ずつ独立に選ぶと同じポーズが出てしまうため。
 */
export function composeGravureShots(
  sessions: number,
  options: PromptOptions = {},
  random: () => number = Math.random,
): ComposedShot[] {
  const count = Math.max(1, sessions);
  const poses =
    (options.poseMode ?? 'random') === 'random'
      ? buildPoseSequence(count, random)
      : null;

  const references = buildReferenceSequence(
    options.referenceCount ?? 0,
    count,
    random,
  );

  const shots: ComposedShot[] = [];

  for (let i = 0; i < count; i += 1) {
    const referenceIndex = references[i];

    const pose = poses
      ? poses[i]
      : selectPose(
          options.poseMode ?? 'random',
          i + 1,
          options.manualPose,
          random,
        );

    shots.push({
      prompt: composeGravurePrompt(i + 1, options, random, pose),
      pose,
      referenceIndex,
    });
  }

  return shots;
}

// ---------------------------------------------------------------
// 参考画像から作るとき（img2img）の指示
// ---------------------------------------------------------------

/**
 * 顔・上半身だけの参考画像から、全身を作らせる指示。
 *
 * img2img は入力の構図をそのまま引き継ぐ。顔のアップを渡せば
 * 顔のアップが返り、全身にはならない。「全身で」と言葉で頼み、
 * 同時に strength を上げて構図を作り直させる必要がある。
 *
 * 顔立ちは残したいので、同一人物であることを明示する語を添える。
 */
export const FULL_BODY_FROM_REFERENCE = [
  'full body shot, head to toe, entire figure visible',
  'same woman as the reference, same face, same facial features',
  'same hairstyle and hair color',
  'consistent identity with the reference photo',
  'natural full-body proportions',
].join(', ');

/**
 * 参考画像が服を着ていても水着にするための指示。
 *
 * img2img は入力の服も引き継ぐ。着替えさせるには
 * 「水着を着ている」と肯定形で言い、元の服は negative で外す。
 * 「no clothes」とは書かない。拡散モデルは否定を読めないので
 * 打ち消したいものは negative 側に置く。
 */
export const SWIMWEAR_OVERRIDE = [
  'wearing a swimsuit',
  'beachwear outfit',
  'changed into swimwear',
].join(', ');

/** 元の服を引きずらないための negative */
export const CLOTHING_NEGATIVE = [
  'business suit, blazer, office wear, jacket, coat',
  'long sleeves, trousers, jeans, skirt, sweater',
  'winter clothes, uniform, dress shirt, necktie',
].join(', ');

export interface ReferenceOptions {
  /** 顔・上半身だけの参考から全身を作る */
  fullBodyFromReference?: boolean;
  /** 服を着た参考でも水着にする */
  forceSwimwear?: boolean;
}

/** 参考画像を使うときに、プロンプトへ足す指示を組み立てる */
export function buildReferenceGuidance({
  fullBodyFromReference = true,
  forceSwimwear = true,
}: ReferenceOptions = {}): { positive: string; negative: string } {
  const positive: string[] = [];
  const negative: string[] = [GRAVURE_NEGATIVE];

  if (fullBodyFromReference) positive.push(FULL_BODY_FROM_REFERENCE);
  if (forceSwimwear) {
    positive.push(SWIMWEAR_OVERRIDE);
    negative.push(CLOTHING_NEGATIVE);
  }

  return { positive: positive.join(', '), negative: negative.join(', ') };
}

/**
 * 顔を残しつつ構図を作り直すのに向く strength。
 *
 * 低いと入力の構図（顔のアップ・服）がそのまま残り、
 * 高すぎると別人になる。全身に組み替えるにはある程度上げる必要がある。
 */
export const STRENGTH_FOR_FULL_BODY = 0.75;

/** 文字列だけ欲しいとき */
export function composeGravurePrompts(
  sessions: number,
  options: PromptOptions = {},
  random: () => number = Math.random,
): string[] {
  return composeGravureShots(sessions, options, random).map((s) => s.prompt);
}
