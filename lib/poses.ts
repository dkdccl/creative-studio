/**
 * 組み込みのポーズ参考画像。
 *
 * 生成のたびに参考画像を配り替えて、ポーズを自動で散らすためのもの。
 * 画像そのものは public/poses/ に置き、img2img の入力として渡す。
 *
 * file は置かれている実ファイル名をそのまま書く。改名させると
 * 「どれがどのポーズか」の対応を人が覚えておく必要が出るため、
 * ここで名前と説明を結び付けておく。
 *
 * description は英語で書く。プロンプトの他の部分（衣装・照明・背景）が
 * すべて英語なので、ここだけ日本語を混ぜると指示として弱くなるため。
 * 画面に出す名前は label（日本語）を使う。
 *
 * description は実際の画像を見て書いてある。画像を差し替えるときは
 * 説明も直すこと。画像と言葉が食い違うと、両方から別々のポーズを
 * 指定することになって精度が落ちる。
 *
 * 表情はすべて笑顔で統一している（常に笑顔にする方針のため）。
 */

export interface PoseReference {
  id: number;
  /** 画面に出す名前 */
  label: string;
  /** public/poses/ に置いた実ファイル名 */
  file: string;
  /** プロンプトに足すポーズ説明（英語） */
  description: string;
}

export const POSE_REFERENCES: PoseReference[] = [
  {
    id: 1,
    label: 'ポーズ1（立ち・正面・浜辺）',
    file: '2026-09-08_175344.jpg',
    description:
      'standing facing the camera, upper body framed from the thighs up, ' +
      'arms relaxed at her sides, hair blown by the wind, ' +
      'at the shoreline with the sea behind, warm sunset light, bright smile',
  },
  {
    id: 2,
    label: 'ポーズ2（仰向け・両腕を頭上へ）',
    file: '2026-09-08_175357.jpg',
    description:
      'lying on her back on a bed, both arms raised and bent above her head, ' +
      'one knee slightly drawn up, photographed from directly above, ' +
      'soft even light on rumpled sheets, cheerful smile looking up at the camera',
  },
  {
    id: 3,
    label: 'ポーズ3（ベッドで膝立ち・正面）',
    file: '2026-09-08_175409.jpg',
    description:
      'kneeling upright on a bed facing the camera, torso straight, ' +
      'thighs apart, hands resting beside her, shoulders squared, ' +
      'warm dim indoor lighting, gentle smile',
  },
  {
    id: 4,
    label: 'ポーズ4（立ち・室内・正面）',
    file: '2026-09-08_175421.jpg',
    description:
      'standing facing the camera beside a bed, framed from the thighs up, ' +
      'arms relaxed at her sides, long hair over her shoulders, ' +
      'bright window light in a bedroom, soft smile',
  },
  {
    id: 5,
    label: 'ポーズ5（ベッドでもたれる）',
    file: '2026-09-08_175434.jpg',
    description:
      'reclining against pillows on a bed, upper body turned toward the camera, ' +
      'one hand raised near her jaw, the other arm across her waist, ' +
      'knees drawn up, soft morning light, relaxed happy smile',
  },
  {
    id: 6,
    label: 'ポーズ6（座り・脚を広げる）',
    file: '2026-09-08_175445.jpg',
    description:
      'seated facing the camera with knees apart, leaning slightly back, ' +
      'one hand resting on her thigh, framed from the thighs up, ' +
      'plain bright interior, warm smile',
  },
  {
    id: 7,
    label: 'ポーズ7（しゃがみ・ワンピース水着）',
    file: '2026-09-08_175513.jpg',
    description:
      'squatting low on her heels facing the camera, knees wide apart, ' +
      'hands resting on the floor between her feet, torso upright, ' +
      'high heels on, plain studio wall behind, soft smile looking at the camera',
  },
  {
    id: 8,
    label: 'ポーズ8（しゃがみ・肩出し）',
    file: '2026-09-08_175527.jpg',
    description:
      'squatting low facing the camera, knees wide apart, bare shoulders, ' +
      'hands lowered between her feet, hair tied back over one shoulder, ' +
      'plain studio wall behind, bright confident smile',
  },
  {
    id: 9,
    label: 'ポーズ9（しゃがみ・正面やや上から）',
    file: '2026-09-08_175539.jpg',
    description:
      'squatting on her heels facing the camera, knees wide apart, ' +
      'hands resting on the floor beside her feet, long dark hair down, ' +
      'photographed from slightly above, plain studio wall behind, calm smile',
  },
  {
    id: 10,
    label: 'ポーズ10（立ち・全身・手を胸元へ）',
    file: '2026-09-08_175626.jpg',
    description:
      'standing upright facing the camera, full body in frame including heels, ' +
      'one hand raised near her collarbone, the other arm relaxed at her side, ' +
      'weight on one leg, plain studio wall behind, bright happy smile',
  },
];

/** public/poses/ 配下の URL。ブラウザからも Electron からも同じ形で読める */
export function poseImageUrl(pose: PoseReference): string {
  return `/poses/${encodeURIComponent(pose.file)}`;
}

/**
 * ポーズ説明をプロンプトの末尾に足す。
 *
 * 参考画像だけだと構図は寄っても細部（手の位置・視線）が流れるので、
 * 同じ内容を言葉でも重ねて指定する。
 */
export function withPoseDescription(prompt: string, pose: PoseReference): string {
  const body = prompt.trim();
  if (!body) return pose.description;
  return `${body}, ${pose.description}`;
}

/**
 * ファイル名から、そのポーズの説明を引く。
 *
 * 参考画像は File として持ち回るので、組み込みのポーズかどうかは
 * 名前で見分ける。利用者が同名のファイルを上げた場合も説明が付くが、
 * 実害が無いのでそこは見ていない。
 */
export function poseDescriptionForFileName(name: string): string | undefined {
  return POSE_REFERENCES.find((pose) => pose.file === name)?.description;
}

/**
 * public/poses/ に実際に置かれている画像のファイル名。
 *
 * ブラウザからフォルダの中身は見られないので、API に聞く。
 * こうしておくと、コードを触らずファイルを足すだけでポーズが増える。
 */
export async function listPoseFiles(): Promise<string[]> {
  try {
    const response = await fetch('/api/gravure/poses');
    if (!response.ok) return [];
    const data = (await response.json()) as { files?: string[] };
    return data.files ?? [];
  } catch {
    return [];
  }
}

/** 画面に出す 1 件ぶん。説明が無いファイルもここに並ぶ */
export interface PoseEntry {
  file: string;
  label: string;
  /** 説明が書かれていれば入る。無ければ画像だけで似せる */
  description?: string;
  /** lib/poses.ts に説明があるか */
  known: boolean;
}

/**
 * 置いてあるファイルと、書いてある説明を突き合わせる。
 *
 * 説明があるものは画像と言葉の両方でポーズを指定する。
 * 説明が無いものは画像だけを手がかりに似せて作る（種や
 * テーマで変化が付くので、同じ絵の複製にはならない）。
 */
export async function listPoseEntries(): Promise<PoseEntry[]> {
  const files = await listPoseFiles();

  return files.map((file) => {
    const known = POSE_REFERENCES.find((pose) => pose.file === file);
    return {
      file,
      label: known?.label ?? file,
      description: known?.description,
      known: Boolean(known),
    };
  });
}

/**
 * public/poses/ に置いた画像を読み込む。
 *
 * 説明が書かれていないファイルも読む。画像だけでも参考として使えるので、
 * 増やしたぶんをそのまま利用できるようにするため。
 * 読めないものは飛ばす。
 */
export async function loadPoseFiles(): Promise<File[]> {
  const names = await listPoseFiles();
  const files: File[] = [];

  for (const name of names) {
    try {
      const response = await fetch(`/poses/${encodeURIComponent(name)}`);
      if (!response.ok) continue;

      const blob = await response.blob();
      // 置き忘れたときに README が返ることがあるので、画像かどうか見る
      if (!blob.type.startsWith('image/')) continue;

      files.push(new File([blob], name, { type: blob.type }));
    } catch {
      // 読めないものは飛ばす
    }
  }

  return files;
}
