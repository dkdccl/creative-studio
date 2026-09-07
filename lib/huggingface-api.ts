import { assertHuggingFaceConfig, config } from '@/lib/config';

/**
 * Hugging Face の Inference API で画像を作る。
 *
 * 既定は stabilityai/stable-diffusion-xl-base-1.0。
 * OpenAI の画像モデルより 1 枚あたりが一桁安いので、
 * 120 ページの単行本はこちらを既定の生成元にしている。
 *
 * ── やりとり ─────────────────────────────────
 *   POST <baseUrl>/<model>
 *   Authorization: Bearer hf_xxx
 *   { "inputs": "...", "parameters": { "width": 1024, "height": 1536, ... } }
 *   → 画像のバイト列（Content-Type: image/png）
 *
 * 気をつける点が 2 つある。
 *  - モデルが眠っていると 503 と「estimated_time」を返す。
 *    起きるまで待って掛け直す必要がある。
 *  - 混んでいると 429 を返す。これも待てば通る。
 * どちらもここで待ち直し、それでも駄目なら投げて
 * ページ単位の再試行（kindle-job）に任せる。
 */

export interface HuggingFaceGenerateOptions {
  prompt: string;
  /** 絵に出したくないもの。省略すると設定の既定値 */
  negativePrompt?: string;
  width: number;
  height: number;
  /** 同じ絵を作り直したいときに固定する */
  seed?: number;
}

/** モデルが起きるのを待つ回数 */
const MAX_WAIT_ROUNDS = 4;

/** 待ち時間が分からないときの既定 */
const DEFAULT_WAIT_MS = 20000;

/** 一時的な失敗をここで掛け直す回数 */
const MAX_RETRIES = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** エンドポイントを組み立てる。末尾のスラッシュは重ねない */
export function huggingFaceEndpoint(): string {
  const { baseUrl, model } = config.huggingface;
  return `${baseUrl.replace(/\/+$/, '')}/${model}`;
}

/** 応答の中のエラーメッセージを拾う */
function readError(text: string): { message: string; waitMs: number | null } {
  try {
    const payload = JSON.parse(text) as Record<string, unknown>;
    const message =
      typeof payload.error === 'string'
        ? payload.error
        : Array.isArray(payload.error)
          ? payload.error.join(', ')
          : text.slice(0, 200);
    const estimated = Number(payload.estimated_time);
    return {
      message,
      waitMs: Number.isFinite(estimated) ? Math.ceil(estimated * 1000) : null,
    };
  } catch {
    return { message: text.slice(0, 200), waitMs: null };
  }
}

/** 掛け直しても意味がない失敗か。キーの誤りやモデル名の誤りは何度やっても同じ */
function isPermanent(message: string): boolean {
  return /認証に失敗|モデルが見つかりません/.test(message);
}

/**
 * 画像を 1 枚作る。
 *
 * 通信の切れや 5xx は一時的なことが多いので、ここで最大 3 回まで掛け直す。
 * キーの誤りなど直らない失敗はすぐ投げる。
 * それでも駄目ならページ単位の再試行（kindle-job）に引き継ぐ。
 */
export async function generateImageOnHuggingFace(
  options: HuggingFaceGenerateOptions,
): Promise<Buffer> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await requestImage(options);
    } catch (error: any) {
      lastError = error;
      const message = error?.message ?? String(error);
      if (isPermanent(message)) throw error;

      if (attempt < MAX_RETRIES) {
        const wait = 3000 * attempt;
        console.log(
          `⏳ 画像生成に失敗（${attempt}/${MAX_RETRIES}）。` +
            `${wait / 1000} 秒後に掛け直します: ${message.slice(0, 120)}`,
        );
        await sleep(wait);
      }
    }
  }

  throw lastError;
}

/** 実際に 1 回呼ぶ */
async function requestImage({
  prompt,
  negativePrompt,
  width,
  height,
  seed,
}: HuggingFaceGenerateOptions): Promise<Buffer> {
  const { apiKey } = assertHuggingFaceConfig();
  const { timeoutMs, steps, guidanceScale } = config.huggingface;
  const url = huggingFaceEndpoint();

  const body = JSON.stringify({
    inputs: prompt,
    parameters: {
      negative_prompt: negativePrompt ?? config.huggingface.negativePrompt,
      width,
      height,
      num_inference_steps: steps,
      guidance_scale: guidanceScale,
      ...(seed === undefined ? {} : { seed }),
    },
    options: {
      // 眠っているモデルを起こして待つ
      wait_for_model: true,
      use_cache: false,
    },
  });

  for (let round = 1; round <= MAX_WAIT_ROUNDS; round += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'image/png',
          'x-wait-for-model': 'true',
        },
        signal: controller.signal,
        body,
      });
    } catch (error: any) {
      clearTimeout(timer);
      if (error?.name === 'AbortError') {
        throw new Error(
          `Hugging Face が ${Math.round(timeoutMs / 1000)} 秒以内に応答しませんでした。`,
        );
      }
      throw new Error(
        `Hugging Face に接続できませんでした: ${error?.message ?? error}`,
      );
    }
    clearTimeout(timer);

    const contentType = response.headers.get('content-type') ?? '';

    if (response.ok && contentType.startsWith('image/')) {
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0) {
        throw new Error('Hugging Face から受け取った画像が空でした。');
      }
      return bytes;
    }

    const text = await response.text();
    const { message, waitMs } = readError(text);

    // モデルの起動待ち・混雑は、待てば通ることが多い
    if (response.status === 503 || response.status === 429) {
      if (round < MAX_WAIT_ROUNDS) {
        const wait = waitMs ?? DEFAULT_WAIT_MS * round;
        console.log(
          `⏳ Hugging Face が${response.status === 503 ? 'モデルを起動中' : '混雑中'}。` +
            `${Math.round(wait / 1000)} 秒待って掛け直します（${round}/${MAX_WAIT_ROUNDS}）`,
        );
        await sleep(wait);
        continue;
      }
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Hugging Face の認証に失敗しました（${response.status}）。` +
          'HUGGINGFACE_API_KEY を確かめてください。',
      );
    }

    if (response.status === 404) {
      throw new Error(
        `モデルが見つかりません（404）: ${config.huggingface.model}。` +
          'HUGGINGFACE_MODEL の綴りと、そのモデルが Inference API に対応しているか確かめてください。',
      );
    }

    throw new Error(
      `Hugging Face がエラーを返しました（${response.status}）: ${message}`,
    );
  }

  throw new Error(
    `Hugging Face のモデルが ${MAX_WAIT_ROUNDS} 回待っても起きませんでした。`,
  );
}

/**
 * キーとモデルが使えるか、小さい画像を 1 枚だけ作って確かめる。
 * 120 ページを流し始めてから 401 で全滅するのを防ぐ。
 */
export async function checkHuggingFace(): Promise<{ ok: boolean; detail: string }> {
  if (!config.huggingface.apiKey) {
    return { ok: false, detail: 'HUGGINGFACE_API_KEY が未設定です。' };
  }

  try {
    const bytes = await generateImageOnHuggingFace({
      prompt: 'a simple pencil sketch of a cat, manga style',
      width: 512,
      height: 512,
    });
    return {
      ok: true,
      detail: `${config.huggingface.model} で ${Math.round(bytes.length / 1024)}KB の画像を受け取りました`,
    };
  } catch (error: any) {
    return { ok: false, detail: error?.message ?? String(error) };
  }
}
