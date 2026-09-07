/**
 * CLI の引数まわり。モードをまたいで使う。
 *
 *   npm run generate manga -- --title="..." --pages=120 --format=kindle
 *
 * npm 経由だと `--` の後ろがそのまま process.argv に並ぶので、
 * 先頭の位置引数（モード名）と --key=value をここで切り分ける。
 */

export interface ParsedArgs {
  /** 最初の位置引数。gravure / manga / novel */
  mode: string;
  flags: Record<string, string | boolean>;
}

/** --key=value / --key value / --flag のどれでも受ける */
export function parseArgs(argv: string[]): ParsedArgs {
  const flags: Record<string, string | boolean> = {};
  let mode = '';

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (!arg.startsWith('--')) {
      if (!mode) mode = arg;
      continue;
    }

    const body = arg.slice(2);
    const equals = body.indexOf('=');

    if (equals >= 0) {
      flags[body.slice(0, equals)] = body.slice(equals + 1);
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      flags[body] = next;
      i += 1;
    } else {
      flags[body] = true;
    }
  }

  return { mode: mode.toLowerCase(), flags };
}

/** フラグの読み出し */
export function readers(flags: Record<string, string | boolean>) {
  const text = (key: string, fallback = '') =>
    typeof flags[key] === 'string' ? (flags[key] as string) : fallback;

  const flag = (key: string) => flags[key] === true || flags[key] === 'true';

  const number = (key: string, fallback: number) => {
    const value = Number(text(key, ''));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };

  return { text, flag, number };
}
