import Link from 'next/link';
import type { Metadata } from 'next';

import { GeneratorCard } from './components/generator-card';

export const metadata: Metadata = {
  title: '漫画を作る',
  description:
    'ページ数と雰囲気を選んで、1ページ6コマ（3x2）の漫画を DALL-E で生成します。',
};

export default function MangaPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-red-950 via-purple-950 to-black px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center">
        <header className="mb-8 w-full">
          <Link
            href="/"
            className="text-sm font-bold text-red-200/70 transition-colors hover:text-white"
          >
            ← モード選択
          </Link>
          <h1 className="mt-4 flex items-center gap-3 text-2xl font-bold text-white sm:text-3xl">
            <span className="text-3xl sm:text-4xl">🎨</span>
            <span>
              漫画モード
              <span className="ml-2 align-middle text-xs font-normal text-red-200/40">
                Creative Studio
              </span>
            </span>
          </h1>
          <p className="mt-2 text-sm text-red-100/60">
            ページ数と雰囲気を選んで生成します。コマ割りは 1ページ 6コマ（3x2）固定です。
          </p>
        </header>

        <GeneratorCard />
      </div>
    </main>
  );
}
