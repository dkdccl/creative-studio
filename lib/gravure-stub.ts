import { config } from './config';

/**
 * Prodia を呼ばずに生成を通す「から回し」モード。
 *
 * NEXT_PUBLIC_USE_STUB=true のときだけ有効。プロンプトと種が
 * 意図どおり組み立てられているかを、API 料金をかけずに確かめるためのもの。
 * 送るはずだったペイロードをそのままコンソールに出す。
 */

export const isStubMode = config.useStub;

/** 生成 API が返す形。実物と同じ形にしておく */
export interface StubResult {
  imageUrl: string;
  prompt: string;
  jobType: string;
  seed: number;
}

/** 実際の待ち時間を模した遅延（ミリ秒） */
const STUB_DELAY = 500;

/** 種を書いただけのダミー画像。カードに並べたときに見分けが付く */
function dummyImage(seed: number, label: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 416;
  canvas.height = 608;
  const context = canvas.getContext('2d');
  if (!context) return '';

  context.fillStyle = '#2e1065';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#c4b5fd';
  context.font = 'bold 28px sans-serif';
  context.textAlign = 'center';
  context.fillText('STUB', canvas.width / 2, 280);
  context.font = '20px sans-serif';
  context.fillText(`seed ${seed}`, canvas.width / 2, 320);
  context.font = '16px sans-serif';
  context.fillText(label, canvas.width / 2, 356);

  return canvas.toDataURL('image/png');
}

/**
 * 生成 1 回ぶんの代わり。
 * 実際に送るはずだったプロンプトと種をそのまま受け取って記録する。
 */
export async function stubGenerate(
  prompt: string,
  seed: number,
  jobType: string,
  label: string,
): Promise<StubResult> {
  // 仕様どおり、1 回ぶんをまとめてコンソールに出す
  console.log('=== STUB CALL ===');
  console.log(`Seed: ${seed}`);
  console.log(`Prompt: ${prompt}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('================\n');

  await new Promise((resolve) => setTimeout(resolve, STUB_DELAY));

  return { imageUrl: dummyImage(seed, label), prompt, jobType, seed };
}
