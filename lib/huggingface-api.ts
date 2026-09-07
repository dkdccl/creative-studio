import axios from 'axios';

import { assertHuggingFaceConfig, config } from '@/lib/config';

/**
 * Hugging Face の Inference Providers で画像を作る。
 *
 * 以前の api-inference（hf-inference）は画像生成の提供を終えていて、
 * 呼ぶと 410「deprecated and no longer supported」が返る。
 * いまは fal-ai / nscale などの提供元へルーター越しに振り分ける形になっている。
 *
 *   https://router.huggingface.co/<提供元>/<提供元ごとのモデルパス>
 *
 * 提供元によってリクエストとレスポンスの形が違うので、
 * 下の PROVIDERS でモデルごとに対応づけてある。
 */

export interface HuggingFaceGenerateOptions {
  prompt: string;
  /** 絵に出したくないもの。省略すると設定の既定値 */
  negativePrompt?: string;
  /** 希望サイズ。提供元の上限を超えると縮められることがある */
  width: number;
  height: number;
  /** 同じ絵を作り直したいときに固定する */
  seed?: number;
}

/** 一時的な失敗をここで掛け直す回数 */
const MAX_RETRIES = 3;

/** モデルの起動待ち・混雑で待ち直す回数 */
const MAX_WAIT_ROUNDS = 4;

/** 待ち時間が分からないときの既定 */
const DEFAULT_WAIT_MS = 20000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------
// 提供元ごとの違い
// ---------------------------------------------------------------

/**
 * リクエストとレスポンスの形。
 *
 * - fal    : POST <router>/<提供元>/<パス> → { images: [{ url }] }
 * - openai : POST <router>/<提供元>/v1/images/generations → { data: [{ b64_json }] }
 */
type ProviderShape = 'fal' | 'openai';

interface ProviderRoute {
  provider: string;
  /** 提供元側でのモデルの呼び名 */
  providerId: string;
  shape: ProviderShape;
  /** その提供元が素直に返してくれる縦長サイズ */
  width: number;
  height: number;
}

/**
 * 動作を確かめた組み合わせ。
 * ここに無いモデルは fal-ai へ、モデル名そのままで投げる。
 */
const PROVIDERS: Record<string, ProviderRoute> = {
  // 指示どおりの SDXL。fal-ai が提供している
  'stabilityai/stable-diffusion-xl-base-1.0': {
    provider: 'fal-ai',
    providerId: 'fal-ai/fast-sdxl',
    shape: 'fal',
    // 1024x1536 を頼むと 1024x1344 に丸められるので、比を保てる範囲にする
    width: 832,
    height: 1248,
  },
  // より高い解像度で返る。Kindle の判型に近いのはこちら
  'black-forest-labs/FLUX.1-schnell': {
    provider: 'nscale',
    providerId: 'black-forest-labs/FLUX.1-schnell',
    shape: 'openai',
    width: 1024,
    height: 1536,
  },
  'black-forest-labs/FLUX.1-dev': {
    provider: 'fal-ai',
    providerId: 'fal-ai/flux/dev',
    shape: 'fal',
    width: 832,
    height: 1248,
  },
};

/** 設定から、実際に叩く先を決める */
export function resolveRoute(): ProviderRoute {
  const { model, provider, width, height } = config.huggingface;
  const known = PROVIDERS[model];

  const route: ProviderRoute = known ?? {
    provider: 'fal-ai',
    providerId: model,
    shape: 'fal',
    width: 832,
    height: 1248,
  };

  return {
    ...route,
    // 環境変数があればそちらを優先する
    provider: provider ?? route.provider,
    width: width > 0 ? width : route.width,
    height: height > 0 ? height : route.height,
  };
}

/** 叩く URL */
export function huggingFaceEndpoint(route = resolveRoute()): string {
  const base = config.huggingface.baseUrl.replace(/\/+$/, '');
  return route.shape === 'openai'
    ? `${base}/${route.provider}/v1/images/generations`
    : `${base}/${route.provider}/${route.providerId}`;
}

// ---------------------------------------------------------------
// 応答の読み取り
// ---------------------------------------------------------------

/** 応答からエラーの理由と待ち時間を拾う */
function readError(payload: unknown): { message: string; waitMs: number | null } {
  const asText = typeof payload === 'string' ? payload : JSON.stringify(payload);
  try {
    const parsed =
      typeof payload === 'string' ? JSON.parse(payload) : (payload as any);
    const raw = parsed?.error ?? parsed?.message ?? parsed?.detail;
    const message = Array.isArray(raw)
      ? raw.join(', ')
      : typeof raw === 'string'
        ? raw
        : String(asText).slice(0, 200);
    const estimated = Number(parsed?.estimated_time);
    return {
      message,
      waitMs: Number.isFinite(estimated) ? Math.ceil(estimated * 1000) : null,
    };
  } catch {
    return { message: String(asText).slice(0, 200), waitMs: null };
  }
}

/** 掛け直しても直らない失敗か */
function isPermanent(message: string): boolean {
  return /認証に失敗|提供が終了|対応していません|残高が足りません/.test(message);
}

/** 応答の中から画像のバイト列を取り出す */
async function extractImage(payload: any): Promise<Buffer> {
  // fal 形: { images: [{ url }] }
  const url = payload?.images?.[0]?.url;
  if (typeof url === 'string') {
    const image = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: config.huggingface.timeoutMs,
    });
    return Buffer.from(image.data);
  }

  // OpenAI 互換: { data: [{ b64_json }] }
  const base64 =
    payload?.data?.[0]?.b64_json ??
    payload?.images?.[0]?.b64_json ??
    payload?.image;
  if (typeof base64 === 'string' && base64.length > 0) {
    const body = base64.startsWith('data:')
      ? base64.slice(base64.indexOf(',') + 1)
      : base64;
    return Buffer.from(body, 'base64');
  }

  throw new Error(
    `応答から画像を取り出せませんでした: ${JSON.stringify(payload).slice(0, 200)}`,
  );
}

// ---------------------------------------------------------------
// 生成
// ---------------------------------------------------------------

/**
 * 画像を 1 枚作る。
 *
 * 通信の切れや 5xx は一時的なことが多いので、ここで最大 3 回まで掛け直す。
 * キーやモデル名の誤りは何度やっても直らないのですぐ投げる。
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
  seed,
}: HuggingFaceGenerateOptions): Promise<Buffer> {
  const { apiKey } = assertHuggingFaceConfig();
  const { timeoutMs, steps, guidanceScale } = config.huggingface;
  const route = resolveRoute();
  const url = huggingFaceEndpoint(route);
  const negative = negativePrompt ?? config.huggingface.negativePrompt;

  const body =
    route.shape === 'openai'
      ? {
          model: route.providerId,
          prompt,
          size: `${route.width}x${route.height}`,
          response_format: 'b64_json',
          ...(seed === undefined ? {} : { seed }),
        }
      : {
          prompt,
          negative_prompt: negative,
          image_size: { width: route.width, height: route.height },
          num_inference_steps: steps,
          guidance_scale: guidanceScale,
          ...(seed === undefined ? {} : { seed }),
        };

  for (let round = 1; round <= MAX_WAIT_ROUNDS; round += 1) {
    const response = await axios
      .post(url, body, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: timeoutMs,
        validateStatus: () => true,
      })
      .catch((error: unknown) => {
        const message = axios.isAxiosError(error)
          ? error.code === 'ECONNABORTED'
            ? `Hugging Face が ${Math.round(timeoutMs / 1000)} 秒以内に応答しませんでした。`
            : `Hugging Face に接続できませんでした: ${error.message}`
          : `Hugging Face に接続できませんでした: ${String(error)}`;
        throw new Error(message);
      });

    if (response.status >= 200 && response.status < 300) {
      return extractImage(response.data);
    }

    const { message, waitMs } = readError(response.data);

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

    if (response.status === 410 || /deprecated/i.test(message)) {
      throw new Error(
        `${config.huggingface.model} は ${route.provider} での提供が終了しています（410）。` +
          'HUGGINGFACE_MODEL か HUGGINGFACE_PROVIDER を変えてください。',
      );
    }

    if (response.status === 404 || /not supported by provider/i.test(message)) {
      throw new Error(
        `${route.provider} は ${config.huggingface.model} に対応していません（${response.status}）。` +
          'HUGGINGFACE_PROVIDER を変えるか、対応しているモデルを選んでください。',
      );
    }

    if (response.status === 402) {
      throw new Error(
        'Hugging Face の残高が足りません（402）。' +
          'https://huggingface.co/settings/billing を確かめてください。',
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
 * 120 ページを流し始めてから全滅するのを防ぐ。
 */
export async function checkHuggingFace(): Promise<{ ok: boolean; detail: string }> {
  if (!config.huggingface.apiKey) {
    return { ok: false, detail: 'HUGGINGFACE_API_KEY が未設定です。' };
  }

  const route = resolveRoute();
  try {
    const bytes = await generateImageOnHuggingFace({
      prompt: 'a simple pencil sketch of a cat, manga style',
      width: route.width,
      height: route.height,
    });
    return {
      ok: true,
      detail:
        `${config.huggingface.model} / ${route.provider} で ` +
        `${route.width}x${route.height} の画像（${Math.round(bytes.length / 1024)}KB）を受け取りました`,
    };
  } catch (error: any) {
    return { ok: false, detail: error?.message ?? String(error) };
  }
}
