import { config } from 'dotenv';

/**
 * .env.local / .env を読み込む。
 *
 * Next のサーバーは自分で読んでくれるが、CLI は素の Node なので
 * OPENAI_API_KEY と HUGGINGFACE_API_KEY を自分で載せる必要がある。
 *
 * 並び順がそのまま優先順位になる（先に読んだものが勝つ）。
 * 画面側と同じく .env.local を .env より強くしている。
 *
 * lib/config.ts は読み込まれた時点で process.env を見るので、
 * このモジュールは config より先に評価されないといけない。
 * ES Modules は import を書いた順に評価するので、
 * 呼び出し側では必ずこれを一番上に置くこと。
 */
config({ path: ['.env.local', '.env'], quiet: true });
