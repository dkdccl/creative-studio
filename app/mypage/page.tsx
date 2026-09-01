import Link from 'next/link';
import type { Metadata } from 'next';

import { SeriesList } from './series-list';

export const metadata: Metadata = {
  title: 'マイページ',
  description: '連載シリーズの一覧と、次の話の執筆。',
};

export default function MyPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-purple-900 via-purple-950 to-black px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-8">
          <Link
            href="/"
            className="text-sm font-bold text-purple-200/70 transition-colors hover:text-white"
          >
            ← モード選択
          </Link>
          <h1 className="mt-4 text-2xl font-bold text-white sm:text-3xl">
            マイページ
          </h1>
        </header>

        <section>
          <h2 className="mb-4 text-lg font-bold text-white">📚 連載シリーズ</h2>
          <SeriesList />
        </section>
      </div>
    </main>
  );
}
