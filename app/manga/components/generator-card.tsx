'use client';

import { useState } from 'react';

import {
  MANGA_MOODS,
  MANGA_PAGE_OPTIONS,
  PANEL_COUNT_OPTIONS,
  buildMangaGenerationPrompt,
  defaultPageConfigs,
  getGridLayout,
  normalizePanelCount,
  pageConfigLabel,
  resizePageConfigs,
  type PageConfig,
  type PanelCount,
} from '@/lib/scene-blocks';
import { Chip, Field, Select, TextArea } from '@/app/novel/components/ui';

export interface MangaPage {
  pageNumber: number;
  panelsCount: PanelCount;
  imageUrl: string;
  prompt: string;
}

interface GenerateResponse {
  pages?: MangaPage[];
  error?: string;
}

/**
 * 漫画モードの生成カード。
 * ページ数（1〜5）と、ページごとのコマ数（4 / 5 / 6）と雰囲気を選んで
 * 画像モデルを呼ぶ。コマ数はページごとに混在させられる。
 *
 * 画像モデルは 1 回で 1 枚しか返さないので、ページごとに API を呼ぶ。
 * 出来たページから順に表示して、残りは進捗として出す。
 */
export function GeneratorCard() {
  const [story, setStory] = useState('');
  const [pages, setPages] = useState(1);
  const [pageConfigs, setPageConfigs] = useState<PageConfig[]>(
    defaultPageConfigs(1),
  );
  const [mood, setMood] = useState<string>(MANGA_MOODS[0]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewPages, setPreviewPages] = useState<MangaPage[]>([]);
  /** 生成中のページ番号。未生成のときは null */
  const [currentPage, setCurrentPage] = useState<number | null>(null);

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

  const prompt = buildMangaGenerationPrompt({
    story: story.trim() || '（ストーリー未入力）',
    pageNumber: 1,
    totalPages: pages,
    panelsCount: pageConfigs[0]?.panelsCount ?? 6,
    mood,
  });

  const canGenerate = story.trim().length > 0 && !generating;

  const generate = async () => {
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
          body: JSON.stringify({ story, pages, mood, pageConfigs, pageNumber }),
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

        collected.push(...data.pages);
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

  return (
    <div className="w-full max-w-2xl space-y-6 rounded-2xl border border-red-400/25 bg-black/30 p-6 text-left sm:p-8">
      <div>
        <p className="mb-2 text-sm font-bold text-red-50">ページ数</p>
        <div className="flex flex-wrap gap-2">
          {MANGA_PAGE_OPTIONS.map((option) => (
            <Chip
              key={option}
              active={pages === option}
              onClick={() => changePages(option)}
            >
              {option}ページ
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-bold text-red-50">
          各ページのコマ数
          <span className="ml-2 text-xs font-normal text-white/40">
            ページごとに変えられます
          </span>
        </p>
        <div className="space-y-2">
          {pageConfigs.map((config) => (
            <div
              key={config.pageNumber}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5"
            >
              <span className="w-28 shrink-0 text-sm font-bold text-white/80">
                ページ {config.pageNumber}
              </span>
              <Select
                aria-label={`ページ ${config.pageNumber} のコマ数`}
                value={config.panelsCount}
                onChange={(e) =>
                  changePanelsCount(
                    config.pageNumber,
                    normalizePanelCount(e.target.value),
                  )
                }
                className="max-w-[9rem]"
              >
                {PANEL_COUNT_OPTIONS.map((count) => (
                  <option key={count} value={count}>
                    {count}コマ ({getGridLayout(count).label})
                  </option>
                ))}
              </Select>
              <span className="text-xs text-white/40">
                {pageConfigLabel(config)}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-white/40">
          総コマ数{' '}
          {pageConfigs.reduce((sum, config) => sum + config.panelsCount, 0)}コマ
        </p>
      </div>

      <div>
        <p className="mb-2 text-sm font-bold text-red-50">漫画の雰囲気</p>
        <div className="flex flex-wrap gap-2">
          {MANGA_MOODS.map((option) => (
            <Chip
              key={option}
              active={mood === option}
              onClick={() => setMood(option)}
            >
              {option}
            </Chip>
          ))}
        </div>
      </div>

      <Field label="ストーリー" hint="画像モデルに渡す内容">
        <TextArea
          rows={4}
          value={story}
          onChange={(e) => setStory(e.target.value)}
          placeholder="例：閉館後の図書館で、少女が読めない本と出会う"
        />
      </Field>

      <div>
        <p className="mb-1.5 text-xs font-bold text-white/50">
          送信プロンプト（1ページ目）
        </p>
        <p className="whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-xs text-white/60">
          {prompt}
        </p>
      </div>

      <button
        type="button"
        onClick={generate}
        disabled={!canGenerate}
        className="w-full rounded-xl border-2 border-red-600 bg-gradient-to-br from-[#EF4444] to-[#DC2626] px-6 py-3.5 text-base font-bold text-white transition-all hover:border-red-400 hover:from-red-400 hover:to-red-500 hover:shadow-[0_0_30px_-8px_rgba(239,68,68,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {generating
          ? `ページ ${currentPage ?? 1}/${pages} 生成中…`
          : '漫画を生成する'}
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

      {previewPages.length > 0 && (
        <div className="space-y-6">
          <p className="text-sm font-bold text-red-50">
            生成結果（{previewPages.length}/{pages} ページ）
          </p>
          {previewPages.map((page) => (
            <div key={page.pageNumber}>
              <p className="mb-1.5 text-xs font-bold text-white/50">
                ページ {page.pageNumber}・{page.panelsCount}コマ (
                {getGridLayout(page.panelsCount).label})
              </p>
              {/* 一時 URL / data URL を扱うため next/image は使わない */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={page.imageUrl}
                alt={`ページ ${page.pageNumber}（${page.panelsCount}コマ）`}
                className="w-full rounded-xl border border-white/10 bg-black object-contain"
              />
              <p className="mt-2 whitespace-pre-wrap break-words text-[11px] text-white/40">
                {page.prompt}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
