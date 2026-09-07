import { loadEnvConfig } from '@next/env';

/**
 * .env.local / .env を読み込む。
 *
 * Next のサーバーは自分で読んでくれるが、CLI は素の Node なので
 * OPENAI_API_KEY を自分で載せる必要がある。
 * dotenv を足さず @next/env を使うのは、
 * 画面側とまったく同じ優先順位（.env.local が .env より強い）にするため。
 *
 * lib/config.ts は読み込まれた時点で process.env を見るので、
 * このモジュールは config より先に評価されないといけない。
 * ES Modules は import を書いた順に評価するので、
 * 呼び出し側では必ずこれを一番上に置くこと。
 */
loadEnvConfig(process.cwd());
