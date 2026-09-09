/**
 * 組み込みのポーズ参考画像。
 *
 * 生成のたびに参考画像を配り替えて、ポーズを自動で散らすためのもの。
 * 画像そのものは public/poses/ に置き、img2img の入力として渡す。
 *
 * description は英語で書く。プロンプトの他の部分（衣装・照明・背景）が
 * すべて英語なので、ここだけ日本語を混ぜると指示として弱くなるため。
 * 画面に出す名前は label（日本語）を使う。
 *
 * 並びを変えるとローテーションの順番も変わる。id は画面の表示や
 * 保存済みの設定と結びつくので、あとから振り直さないこと。
 */

export interface PoseReference {
  id: number;
  /** 画面に出す名前 */
  label: string;
  /** public/poses/ からの相対パス */
  file: string;
  /** プロンプトに足すポーズ説明（英語） */
  description: string;
}

export const POSE_REFERENCES: PoseReference[] = [
  {
    id: 1,
    label: 'ポーズ1（立ち・正面）',
    file: 'pose_001.jpg',
    description:
      'standing upright facing the camera, full body in frame, weight on one leg, ' +
      'one hand raised near the collarbone, the other arm relaxed at her side, ' +
      'plain studio wall behind, confident and open expression',
  },
  {
    id: 2,
    label: 'ポーズ2（しゃがみ・正面）',
    file: 'pose_002.jpg',
    description:
      'squatting low on her heels facing the camera, knees apart, ' +
      'hands lowered between her feet, torso upright, ' +
      'plain studio wall behind, calm direct gaze',
  },
  {
    id: 3,
    label: 'ポーズ3（座り・片膝立て）',
    file: 'pose_003.jpg',
    description:
      'seated leaning back on one arm, one knee raised, ' +
      'the other hand resting on her thigh, torso turned slightly to the camera, ' +
      'photographed from slightly above, indoor setting',
  },
  {
    id: 4,
    label: 'ポーズ4（ベッドで横たわる）',
    file: 'pose_004.jpg',
    description:
      'reclining on a bed leaning against pillows, one forearm bent near her head, ' +
      'knees slightly drawn up, body turned toward the camera, ' +
      'soft morning light, relaxed intimate mood',
  },
  {
    id: 5,
    label: 'ポーズ5（ベッドで膝立ち）',
    file: 'pose_005.jpg',
    description:
      'kneeling upright on a bed facing the camera, torso straight, ' +
      'both hands resting on her thighs, shoulders squared, ' +
      'warm indoor lighting, quiet composed expression',
  },
  {
    id: 6,
    label: 'ポーズ6（仰向け・真上から）',
    file: 'pose_006.jpg',
    description:
      'lying on her back on a bed, both arms raised above her head, ' +
      'legs relaxed, photographed from directly above, ' +
      'soft even light, calm expression looking up at the camera',
  },
];

/** public/poses/ 配下の URL。ブラウザからも Electron からも同じ形で読める */
export function poseImageUrl(pose: PoseReference): string {
  return `/poses/${pose.file}`;
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
