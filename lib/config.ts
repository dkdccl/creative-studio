/**
 * 環境変数の入口。
 *
 * process.env を直接読むのはこのファイルだけにして、
 * 「未設定」「テンプレートのまま」をここで一括判定する。
 *
 * 検証はモジュール読み込み時ではなく assert*() を呼んだときに行う。
 * 読み込み時に throw すると、キーが無いだけで全ページが落ちてしまうため。
 */

/** .env.example / .env.local の雛形のまま残っている値を弾く */
function resolve(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/_here$/.test(trimmed)) return undefined;
  if (/^your_/.test(trimmed)) return undefined;
  if (/^https:\/\/x+\.supabase\.co$/.test(trimmed)) return undefined;
  return trimmed;
}

export const config = {
  supabase: {
    url: resolve(process.env.NEXT_PUBLIC_SUPABASE_URL),
    anonKey: resolve(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    serviceRoleKey: resolve(process.env.SUPABASE_SERVICE_ROLE_KEY),
  },
  openai: {
    apiKey: resolve(process.env.OPENAI_API_KEY),
    imageModel: resolve(process.env.OPENAI_IMAGE_MODEL) ?? 'gpt-image-1',
    textModel: resolve(process.env.OPENAI_TEXT_MODEL) ?? 'gpt-5.5',
  },
  stability: {
    apiKey: resolve(process.env.STABILITY_API_KEY),
    /** v2beta の生成エンドポイント。core / sd3 / ultra から選ぶ */
    model: resolve(process.env.STABILITY_MODEL) ?? 'core',
  },
  siteUrl: resolve(process.env.NEXT_PUBLIC_SITE_URL) ?? 'http://localhost:3000',
  env: process.env.NODE_ENV,
} as const;

export const isStabilityConfigured = Boolean(config.stability.apiKey);

export const isSupabaseConfigured = Boolean(
  config.supabase.url && config.supabase.anonKey,
);

export const isOpenAIConfigured = Boolean(config.openai.apiKey);

/** Supabase を使う直前に呼ぶ。未設定なら理由の分かる例外を投げる */
export function assertSupabaseConfig(): {
  url: string;
  anonKey: string;
} {
  const { url, anonKey } = config.supabase;
  if (!url || !anonKey) {
    throw new Error(
      'Supabase の環境変数が未設定です。.env.local の NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY を設定してください。',
    );
  }
  return { url, anonKey };
}

/** OpenAI を使う直前に呼ぶ */
export function assertOpenAIConfig(): { apiKey: string } {
  const { apiKey } = config.openai;
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY が未設定です。.env.local に API キーを設定してください。',
    );
  }
  return { apiKey };
}
