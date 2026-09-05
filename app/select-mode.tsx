'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Mode = 'manga' | 'novel' | 'gravure';

interface ModeCard {
  mode: Mode;
  icon: string;
  title: string;
  description: string;
  /**
   * 色ごとにクラス文字列をまるごと持たせている。
   * Tailwind は文字列を静的に走査するため、`border-${color}-600` のような
   * 組み立て方だとクラスが生成されない。
   */
  className: string;
}

const MODES: ModeCard[] = [
  {
    mode: 'manga',
    icon: '🎨',
    title: '漫画を作成',
    description: 'ラフから DALL-E で作画',
    className:
      'border-red-600 bg-gradient-to-br from-[#EF4444] to-[#DC2626] shadow-red-900/40 hover:border-red-400 hover:from-red-400 hover:to-red-500 hover:shadow-[0_0_45px_-5px_rgba(239,68,68,0.85)] focus-visible:ring-red-300',
  },
  {
    mode: 'novel',
    icon: '✍️',
    title: '小説を書く',
    description: 'プロットから執筆・推敲',
    className:
      'border-blue-600 bg-gradient-to-br from-[#3B82F6] to-[#1D4ED8] shadow-blue-900/40 hover:border-blue-400 hover:from-blue-400 hover:to-blue-500 hover:shadow-[0_0_45px_-5px_rgba(59,130,246,0.85)] focus-visible:ring-blue-300',
  },
  {
    mode: 'gravure',
    icon: '📸',
    title: 'グラビア画像生成',
    description: 'FLUX.2 でプロンプトから生成',
    className:
      'border-pink-600 bg-gradient-to-br from-[#EC4899] to-[#BE185D] shadow-pink-900/40 hover:border-pink-400 hover:from-pink-400 hover:to-pink-500 hover:shadow-[0_0_45px_-5px_rgba(236,72,153,0.85)] focus-visible:ring-pink-300',
  },
];

/**
 * モード選択画面。
 * 「漫画を作成」/「小説を書く」/「グラビア画像生成」の 3 分岐から
 * /manga・/novel・/gravure へ遷移する。
 *
 * App Router ではこのファイル自体はルートにならないため、
 * app/page.tsx から呼び出してトップページとして表示している。
 */
export default function SelectMode() {
  const router = useRouter();
  const [pending, setPending] = useState<Mode | null>(null);

  const go = (mode: Mode) => {
    setPending(mode);
    router.push(`/${mode}`);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-purple-900 via-purple-950 to-black px-5 py-14 sm:px-8">
      {/* ロゴ・見出し */}
      <header className="mb-10 animate-fade-up text-center sm:mb-14">
        <h1 className="bg-gradient-to-r from-red-400 via-fuchsia-300 to-blue-400 bg-clip-text text-4xl font-black tracking-tight text-transparent drop-shadow-[0_0_25px_rgba(168,85,247,0.45)] sm:text-6xl lg:text-7xl">
          Creative Studio
        </h1>
        <p className="mt-5 text-lg font-medium text-purple-100/80 sm:mt-7 sm:text-2xl">
          何を作りますか？
        </p>
      </header>

      {/* 3 つのモードカード（スマホ：縦積み / タブレット以上：横並び） */}
      <div className="grid w-full max-w-5xl grid-cols-1 gap-6 sm:gap-8 md:grid-cols-3">
        {MODES.map((card) => (
          <button
            key={card.mode}
            type="button"
            onClick={() => go(card.mode)}
            disabled={pending !== null}
            aria-label={card.title}
            className={`group flex min-h-48 w-full flex-col items-center justify-center gap-3 rounded-3xl border-4 px-6 py-8 shadow-lg transition-all duration-300 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-offset-2 focus-visible:ring-offset-black active:translate-y-0 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70 sm:min-h-56 sm:gap-4 ${card.className}`}
          >
            <span className="text-5xl transition-transform duration-300 group-hover:scale-110 sm:text-6xl">
              {card.icon}
            </span>
            <span className="text-xl font-bold text-white drop-shadow sm:text-2xl">
              {card.title}
            </span>
            <span className="text-sm text-white/80">{card.description}</span>
            {pending === card.mode && (
              <span className="text-xs text-white/80">読み込み中…</span>
            )}
          </button>
        ))}
      </div>

      <p className="mt-10 text-center text-xs text-purple-200/50 sm:text-sm">
        あとからいつでもモードを切り替えられます
      </p>

      <Link
        href="/mypage"
        className="mt-4 text-sm font-bold text-purple-200/70 underline-offset-4 transition-colors hover:text-white hover:underline"
      >
        📚 マイページ（連載シリーズ）
      </Link>
    </main>
  );
}
