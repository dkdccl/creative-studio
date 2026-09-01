import { createId } from './novel-storage';
import type { EpisodeRecord, SeriesRecord } from './series';

/**
 * 連載シリーズと各話の保存（ブラウザ）。
 *
 * Supabase の series / novels テーブルを用意したら、
 * ここの読み書きを /api/series/* と /api/novels/save に差し替える。
 */

const STORAGE_KEY = 'creative-studio:series:v1';

export interface SeriesStore {
  series: SeriesRecord[];
  episodes: EpisodeRecord[];
}

const EMPTY: SeriesStore = { series: [], episodes: [] };

export function loadSeriesStore(): SeriesStore {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<SeriesStore>;
    return {
      series: parsed.series ?? [],
      episodes: parsed.episodes ?? [],
    };
  } catch {
    return EMPTY;
  }
}

/** 保存できたら true */
export function saveSeriesStore(store: SeriesStore): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

/** シリーズを作る（同名があればそれを返す） */
export function createSeries(name: string): SeriesRecord {
  const store = loadSeriesStore();
  const trimmed = name.trim() || '無題のシリーズ';
  const existing = store.series.find((s) => s.name === trimmed);
  if (existing) return existing;

  const now = new Date().toISOString();
  const series: SeriesRecord = {
    id: createId('series'),
    name: trimmed,
    createdAt: now,
    updatedAt: now,
  };
  saveSeriesStore({ ...store, series: [...store.series, series] });
  return series;
}

/** 同じシリーズ・同じ話数があれば上書き、なければ追加 */
export function upsertEpisode(episode: EpisodeRecord): boolean {
  const store = loadSeriesStore();
  const index = store.episodes.findIndex(
    (e) => e.seriesId === episode.seriesId && e.episode === episode.episode,
  );
  const episodes =
    index === -1
      ? [...store.episodes, episode]
      : store.episodes.map((e, i) => (i === index ? episode : e));

  const series = store.series.map((s) =>
    s.id === episode.seriesId ? { ...s, updatedAt: episode.updatedAt } : s,
  );

  return saveSeriesStore({ series, episodes });
}

/** 話数の小さい順 */
export function episodesOfSeries(
  store: SeriesStore,
  seriesId: string,
): EpisodeRecord[] {
  return store.episodes
    .filter((e) => e.seriesId === seriesId)
    .sort((a, b) => a.episode - b.episode);
}

/** そのシリーズの最新話（まだ 1 話も無ければ null） */
export function latestEpisode(
  store: SeriesStore,
  seriesId: string,
): EpisodeRecord | null {
  const episodes = episodesOfSeries(store, seriesId);
  return episodes.length === 0 ? null : episodes[episodes.length - 1];
}

/** 次に書く話数 */
export function nextEpisodeNumber(
  store: SeriesStore,
  seriesId: string,
): number {
  const latest = latestEpisode(store, seriesId);
  return latest ? latest.episode + 1 : 1;
}

/** 指定の話の 1 つ前の話 */
export function previousEpisode(
  store: SeriesStore,
  seriesId: string,
  episode: number,
): EpisodeRecord | null {
  return (
    episodesOfSeries(store, seriesId)
      .filter((e) => e.episode < episode)
      .pop() ?? null
  );
}
