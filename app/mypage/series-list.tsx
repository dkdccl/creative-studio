'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { EPISODE_STATUS_LABELS, type EpisodeStatus } from '@/lib/series';
import {
  episodesOfSeries,
  loadSeriesStore,
  nextEpisodeNumber,
  type SeriesStore,
} from '@/lib/series-storage';

const STATUS_STYLES: Record<EpisodeStatus, string> = {
  done: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
  editing: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
  draft: 'border-white/20 bg-white/5 text-white/50',
};

/** マイページの「連載シリーズ」セクション */
export function SeriesList() {
  const [store, setStore] = useState<SeriesStore | null>(null);

  useEffect(() => {
    setStore(loadSeriesStore());
  }, []);

  if (!store) {
    return <p className="text-sm text-blue-100/40">読み込み中…</p>;
  }

  if (store.series.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-blue-400/25 px-6 py-10 text-center">
        <div className="text-3xl">📚</div>
        <p className="mt-3 text-sm text-blue-100/50">
          まだ連載がありません。小説モードの Step 5 で保存すると、ここに並びます。
        </p>
        <Link
          href="/novel"
          className="mt-4 inline-block rounded-xl border-2 border-blue-500 bg-gradient-to-br from-[#3B82F6] to-[#1D4ED8] px-5 py-2.5 text-sm font-bold text-white transition-all hover:from-blue-400 hover:to-blue-500"
        >
          小説を書く
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {store.series.map((series) => {
        const episodes = episodesOfSeries(store, series.id);
        const next = nextEpisodeNumber(store, series.id);
        return (
          <article
            key={series.id}
            className="rounded-2xl border border-blue-400/20 bg-blue-950/30 p-5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-lg font-bold text-white">{series.name}</h3>
              <span className="text-xs text-blue-200/50">
                最新 第{Math.max(1, next - 1)}話 ／ 全{episodes.length}話
              </span>
            </div>

            <ul className="mt-3 space-y-2">
              {episodes.map((episode) => (
                <li
                  key={episode.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5"
                >
                  <span className="text-sm font-bold text-blue-50">
                    第{episode.episode}話：{episode.title}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${STATUS_STYLES[episode.status]}`}
                  >
                    {EPISODE_STATUS_LABELS[episode.status]}
                  </span>
                  <span className="ml-auto text-[11px] text-blue-200/40">
                    {episode.charCount.toLocaleString()} 字
                  </span>
                </li>
              ))}
            </ul>

            <Link
              href="/novel"
              className="mt-4 inline-block rounded-xl border-2 border-blue-500 bg-gradient-to-br from-[#3B82F6] to-[#1D4ED8] px-5 py-2.5 text-sm font-bold text-white transition-all hover:from-blue-400 hover:to-blue-500 hover:shadow-[0_0_25px_-6px_rgba(59,130,246,0.9)]"
            >
              次の話（第{next}話）を執筆
            </Link>
          </article>
        );
      })}
    </div>
  );
}
