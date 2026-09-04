'use client';

import { useState } from 'react';

import {
  MANGA_MOODS,
  MANGA_PAGE_OPTIONS,
  PANEL_COUNT_OPTIONS,
  defaultPageConfigs,
  getGridLayout,
  normalizePanelCount,
  resizePageConfigs,
  type PageConfig,
  type PanelCount,
} from '@/lib/scene-blocks';
import { drawDialoguesOnImage } from '@/lib/dialogue-rendering';

export interface MangaPage {
  pageNumber: number;
  panelsCount: PanelCount;
  imageUrl: string;
  prompt: string;
  /** コマ順のセリフ。gpt-5.5 で生成したときだけ入る */
  dialogues?: string[];
}

interface GenerateResponse {
  pages?: MangaPage[];
  error?: string;
}

/**
 * 生成した画像を保存する。
 * 画像は data URL（gpt-image 系は base64 を返す）なので、
 * a[download] にそのまま渡せばサーバーを経由せずに保存できる。
 */
function downloadPage(page: MangaPage) {
  const link = document.createElement('a');
  link.href = page.imageUrl;
  link.download = `manga-page-${page.pageNumber}-${page.panelsCount}panels.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 漫画モードの生成カード。
 *
 * 設定画面 → 生成 → 漫画だけを大きく見せる画面、の 2 段構え。
 * 画像モデルは 1 回で 1 枚しか返さないのでページごとに API を呼び、
 * 出来たページから順に表示する。
 */
export function GeneratorCard() {
  const [story, setStory] = useState('');
  const [pages, setPages] = useState(3);
  const [pageConfigs, setPageConfigs] = useState<PageConfig[]>(
    defaultPageConfigs(3),
  );
  const [mood, setMood] = useState<string>(MANGA_MOODS[0]);
  const [useGPT55, setUseGPT55] = useState(true);

  const [generating, setGenerating] = useState(false);
  const [currentPage, setCurrentPage] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewPages, setPreviewPages] = useState<MangaPage[]>([]);
  const [downloading, setDownloading] = useState(false);

  const changePages = (next: number) => {
    setPages(next);
    // 選択済みのコマ数は引き継ぐ
    setPageConfigs((current) => resizePageConfigs(current, next));
  };

  const changePanelsCount = (pageNumber: number, panelsCount: PanelCount) => {
    setPageConfigs((current) =>
      current.map((config) =>
        config.pageNumber === pageNumber ? { ...config, panelsCount } : config,
      ),
    );
  };

  const downloadAll = async () => {
    setDownloading(true);
    try {
      for (const page of previewPages) {
        downloadPage(page);
        // 連続でクリックするとブラウザに弾かれることがあるので少し空ける
        await sleep(300);
      }
    } finally {
      setDownloading(false);
    }
  };

  const generate = async () => {
    if (!story.trim()) {
      setError('ストーリーを入力してください。');
      return;
    }

    setGenerating(true);
    setError(null);
    setPreviewPages([]);

    const collected: MangaPage[] = [];

    try {
      for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
        setCurrentPage(pageNumber);

        const response = await fetch('/api/manga/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            story,
            pages,
            mood,
            pageConfigs,
            pageNumber,
            useGPT55,
          }),
        });
        const data = (await response.json()) as GenerateResponse;

        if (!response.ok || !data.pages?.length) {
          setError(
            data.error ??
              `${pageNumber}ページ目の画像を生成できませんでした。` +
                (collected.length > 0 ? 'ここまでの結果を表示します。' : ''),
          );
          return;
        }

        // セリフがあれば Canvas で吹き出しを描き込む
        for (const page of data.pages) {
          if (page.dialogues?.length) {
            console.log(`Drawing dialogues on page ${page.pageNumber}...`);
            const imageUrl = await drawDialoguesOnImage(
              page.imageUrl,
              page.dialogues,
              page.panelsCount,
            );
            collected.push({ ...page, imageUrl });
          } else {
            collected.push(page);
          }
        }

        // 出来たページから順に見せる
        setPreviewPages([...collected]);
      }
    } catch {
      setError('生成リクエストに失敗しました。通信状況を確認してください。');
    } finally {
      setGenerating(false);
      setCurrentPage(null);
    }
  };

  // ------------------------------------------------------------------
  // 生成後: 漫画だけを大きく見せる
  // ------------------------------------------------------------------
  if (previewPages.length > 0 && !generating) {
    return (
      <div className="w-full">
        {error && (
          <p className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-200">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-4 pb-24">
          {previewPages.map((page) => (
            <figure key={page.pageNumber} className="w-full">
              {/* 一時 URL / data URL を扱うため next/image は使わない */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={page.imageUrl}
                alt={`ページ ${page.pageNumber}（${page.panelsCount}コマ）`}
                className="w-full rounded-xl border border-white/10 bg-black"
              />
              <figcaption className="mt-1.5 flex items-center justify-between text-xs text-white/40">
                <span>
                  ページ {page.pageNumber}・{page.panelsCount}コマ (
                  {getGridLayout(page.panelsCount).label})
                </span>
                <button
                  type="button"
                  onClick={() => downloadPage(page)}
                  className="rounded-lg border border-white/15 px-3 py-1 font-bold text-white/70 transition-colors hover:border-white/40 hover:text-white"
                >
                  ⬇ 保存
                </button>
              </figcaption>
            </figure>
          ))}
        </div>

        {/* 下部に固定した操作ボタン */}
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-white/10 bg-black/80 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-2xl gap-3">
            <button
              type="button"
              onClick={() => {
                setPreviewPages([]);
                setError(null);
              }}
              className="flex-1 rounded-xl border-2 border-red-600 bg-gradient-to-br from-[#EF4444] to-[#DC2626] px-4 py-3 text-sm font-bold text-white transition-all hover:border-red-400 hover:from-red-400 hover:to-red-500"
            >
              新規生成
            </button>
            <button
              type="button"
              onClick={downloadAll}
              disabled={downloading}
              className="flex-1 rounded-xl border-2 border-white/20 px-4 py-3 text-sm font-bold text-white transition-colors hover:border-white/50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {downloading ? '保存中…' : `⬇ 全${previewPages.length}ページ保存`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // 生成前 / 生成中: 設定画面
  // ------------------------------------------------------------------
  return (
    <div className="w-full max-w-2xl space-y-4 rounded-2xl border border-red-400/25 bg-black/30 p-6 text-left sm:p-8">
      <div>
        <p className="mb-2 text-sm font-bold text-red-50">ページ数</p>
        <div className="flex flex-wrap gap-2">
          {MANGA_PAGE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => changePages(option)}
              className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
                pages === option
                  ? 'bg-red-500 text-white'
                  : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-bold text-red-50">各ページのコマ数</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {pageConfigs.map((config) => (
            <div key={config.pageNumber} className="flex flex-col items-center">
              <span className="mb-1 text-xs font-bold text-white/50">
                P{config.pageNumber}
              </span>
              <select
                aria-label={`ページ ${config.pageNumber} のコマ数`}
                value={config.panelsCount}
                onChange={(e) =>
                  changePanelsCount(
                    config.pageNumber,
                    normalizePanelCount(e.target.value),
                  )
                }
                className="w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-center text-sm text-white focus:border-red-400 focus:outline-none"
              >
                {PANEL_COUNT_OPTIONS.map((count) => (
                  <option key={count} value={count}>
                    {count}コマ
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-white/40">
          総コマ数{' '}
          {pageConfigs.reduce((sum, config) => sum + config.panelsCount, 0)}コマ
        </p>
      </div>

      <div>
        <p className="mb-2 text-sm font-bold text-red-50">雰囲気</p>
        <div className="flex flex-wrap gap-2">
          {MANGA_MOODS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMood(option)}
              className={`rounded-lg px-3 py-1.5 text-sm font-bold transition-colors ${
                mood === option
                  ? 'bg-blue-500 text-white'
                  : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-purple-400/30 bg-purple-500/10 px-4 py-3 text-sm font-bold text-purple-50">
        <input
          type="checkbox"
          checked={useGPT55}
          onChange={(e) => setUseGPT55(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-purple-400"
        />
        <span>
          🎭 セリフ自動生成（gpt-5.5）
          <span className="mt-1 block text-xs font-normal text-purple-100/60">
            セリフを先に文章で書かせ、絵は文字なしで生成して、あとから吹き出しを重ねます。
          </span>
        </span>
      </label>

      <div>
        <p className="mb-2 text-sm font-bold text-red-50">ストーリー</p>
        <textarea
          rows={5}
          value={story}
          onChange={(e) => setStory(e.target.value)}
          placeholder="例：閉館後の図書館で、少女が読めない本と出会う"
          className="w-full resize-y rounded-xl border border-white/15 bg-black/40 px-4 py-2.5 text-sm leading-relaxed text-white placeholder:text-white/25 focus:border-red-400 focus:outline-none"
        />
      </div>

      <button
        type="button"
        onClick={generate}
        disabled={generating || story.trim().length === 0}
        className="w-full rounded-xl border-2 border-red-600 bg-gradient-to-br from-[#EF4444] to-[#DC2626] px-6 py-3.5 text-base font-bold text-white transition-all hover:border-red-400 hover:from-red-400 hover:to-red-500 hover:shadow-[0_0_30px_-8px_rgba(239,68,68,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {generating
          ? `ページ ${currentPage ?? 1}/${pages} 生成中…`
          : '漫画を生成'}
      </button>

      {generating && (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={pages}
          aria-valuenow={previewPages.length}
        >
          <div
            className="h-full rounded-full bg-red-500 transition-all"
            style={{ width: `${(previewPages.length / pages) * 100}%` }}
          />
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-200">
          {error}
        </p>
      )}
    </div>
  );
}
