import Link from 'next/link';
import type { Metadata } from 'next';

import ImageGenerator from './components/image-generator';

export const metadata: Metadata = {
  title: 'グラビア画像生成',
  description: 'Prodia の FLUX.2 [dev] でプロンプトから画像を生成します。',
};

export default function GravurePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-violet-950 via-purple-950 to-black px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col">
        <header className="mb-8 w-full">
          <Link
            href="/"
            className="text-sm font-bold text-violet-200/70 transition-colors hover:text-white"
          >
            ← モード選択
          </Link>
          <h1 className="mt-4 flex items-center gap-3 text-2xl font-bold text-white sm:text-3xl">
            <span className="text-3xl sm:text-4xl">📸</span>
            <span>
              グラビアモード
              <span className="ml-2 align-middle text-xs font-normal text-violet-200/40">
                Creative Studio
              </span>
            </span>
          </h1>
          <p className="mt-2 text-sm text-violet-100/60">
            Prodia の FLUX.2 [dev] で画像を生成します。プロンプトは英語のほうが
            安定した結果になります。
          </p>
        </header>

        <ImageGenerator />
      </div>
    </main>
  );
}
