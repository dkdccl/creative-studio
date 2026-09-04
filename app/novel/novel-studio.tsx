'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { countChars } from '@/lib/novel-export';
import {
  clearNovelProject,
  createId,
  loadNovelProject,
  saveNovelProject,
} from '@/lib/novel-storage';
import { buildEpisodeRecord } from '@/lib/series';
import {
  createSeries,
  loadSeriesStore,
  nextEpisodeNumber,
  previousEpisode,
  upsertEpisode,
  type SeriesStore,
} from '@/lib/series-storage';
import {
  createEmptyNovelProject,
  type Character,
  type NovelProject,
  type NovelTheme,
  type Scene,
  type SerialSettings,
} from '@/lib/types';
import { StepCharacters } from './components/step-characters';
import { StepEditor } from './components/step-editor';
import { StepExport } from './components/step-export';
import { StepPlot } from './components/step-plot';
import { StepTheme } from './components/step-theme';
import { NOVEL_STEPS, Stepper } from './components/stepper';
import { Button } from './components/ui';

const LAST_STEP = NOVEL_STEPS.length;

export function NovelStudio() {
  const [project, setProject] = useState<NovelProject>(createEmptyNovelProject);
  const [step, setStep] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [seriesStore, setSeriesStore] = useState<SeriesStore>({
    series: [],
    episodes: [],
  });

  // 保存済みの下書き・連載情報を読み込む（SSR とのズレを避けるためマウント後）
  useEffect(() => {
    const stored = loadNovelProject();
    if (stored) {
      setProject(stored);
      setSavedAt(stored.updatedAt || null);
    }
    setSeriesStore(loadSeriesStore());
    setLoaded(true);
  }, []);

  // 入力が止まったタイミングで自動保存
  useEffect(() => {
    if (!loaded) return;
    const timer = window.setTimeout(() => {
      const updatedAt = new Date().toISOString();
      const ok = saveNovelProject({ ...project, updatedAt });
      setSaveFailed(!ok);
      if (ok) setSavedAt(updatedAt);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [project, loaded]);

  /** 保存済みの下書きを読み直す（エクスポート画面の「再度表示」） */
  const reloadSaved = (): { ok: boolean; message: string } => {
    const stored = loadNovelProject();
    if (!stored) {
      return {
        ok: false,
        message: 'このブラウザに保存された小説が見つかりませんでした。',
      };
    }
    setProject(stored);
    setSavedAt(stored.updatedAt || null);
    const chars = stored.scenes.reduce(
      (sum, scene) => sum + scene.body.replace(/\s/g, '').length,
      0,
    );
    return {
      ok: true,
      message: `『${stored.theme.title.trim() || '無題'}』を読み込みました（${chars.toLocaleString()} 字）。`,
    };
  };

  const updateTheme = (patch: Partial<NovelTheme>) =>
    setProject((p) => ({ ...p, theme: { ...p.theme, ...patch } }));

  const updateSerial = (patch: Partial<SerialSettings>) =>
    setProject((p) => ({ ...p, serial: { ...p.serial, ...patch } }));

  /** 連載中なら 1 つ前の話 */
  const previous = useMemo(() => {
    const { seriesId, episode } = project.serial;
    if (!seriesId) return null;
    return previousEpisode(seriesStore, seriesId, episode);
  }, [seriesStore, project.serial]);

  /** Step 5 で「この話を保存」したときに連載情報を記録する */
  const saveEpisode = (): { ok: boolean; message: string } => {
    const { mode, seriesId, seriesName, episode } = project.serial;

    const series =
      mode === 'new'
        ? createSeries(seriesName || project.theme.title)
        : seriesStore.series.find((s) => s.id === seriesId);

    if (!series) {
      return { ok: false, message: '続きを書くシリーズを選んでください。' };
    }

    const current = loadSeriesStore();
    const existing = current.episodes.find(
      (e) => e.seriesId === series.id && e.episode === episode,
    );

    const ok = upsertEpisode(
      buildEpisodeRecord({
        id: existing?.id ?? createId('novel'),
        seriesId: series.id,
        episode,
        project,
      }),
    );

    setSeriesStore(loadSeriesStore());
    if (ok) {
      // 次の保存で同じシリーズを更新できるようにしておく
      updateSerial({ mode: 'continue', seriesId: series.id });
    }

    return {
      ok,
      message: ok
        ? `「${series.name}」第${episode}話として保存しました。`
        : '保存できませんでした（保存容量の上限かもしれません）。',
    };
  };

  const updateCharacters = (characters: Character[]) =>
    setProject((p) => ({ ...p, characters }));

  const updateScenes = (scenes: Scene[]) => setProject((p) => ({ ...p, scenes }));

  const reset = () => {
    if (!window.confirm('保存中の下書きをすべて削除して最初からやり直しますか？')) {
      return;
    }
    clearNovelProject();
    setProject(createEmptyNovelProject());
    setSavedAt(null);
    setSaveFailed(false);
    setStep(1);
  };

  // ステッパーに ✅ を出す判定
  const completed = useMemo(() => {
    const done: number[] = [];
    const { theme, characters, scenes } = project;
    if (theme.title.trim() && theme.genres.length > 0) done.push(1);
    if (characters.some((c) => c.name.trim())) done.push(2);
    if (scenes.length > 0) done.push(3);
    if (scenes.some((s) => countChars(s.body) > 0)) done.push(4);
    return done;
  }, [project]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-950 via-purple-950 to-black">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        {/* ヘッダー */}
        <header className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/"
              className="text-sm font-bold text-blue-200/70 transition-colors hover:text-white"
            >
              ← モード選択
            </Link>
            <div className="flex items-center gap-3">
              <span className="text-xs text-blue-200/40">
                {savedAt
                  ? `自動保存済み ${new Date(savedAt).toLocaleTimeString('ja-JP')}`
                  : '未保存'}
              </span>
              <Button
                variant="ghost"
                onClick={reset}
                className="px-3 py-1 text-xs"
              >
                リセット
              </Button>
            </div>
          </div>

          <h1 className="mt-4 flex items-center gap-3 text-2xl font-bold text-white sm:text-3xl">
            <span className="text-3xl sm:text-4xl">✍️</span>
            <span>
              {project.theme.title.trim() || '小説モード'}
              <span className="ml-2 align-middle text-xs font-normal text-blue-200/40">
                Creative Studio
              </span>
            </span>
          </h1>

          {saveFailed && (
            <p className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-2.5 text-xs text-amber-100">
              このブラウザに保存できませんでした（保存容量の上限に達している可能性があります）。
              写真シーンを減らすか、Step 5 でエクスポートして退避してください。
            </p>
          )}
        </header>

        {/* ステップナビ */}
        <div className="mb-8">
          <Stepper current={step} completed={completed} onSelect={setStep} />
        </div>

        {/* 各ステップ */}
        {step === 1 && (
          <StepTheme
            theme={project.theme}
            onChange={updateTheme}
            serial={project.serial}
            seriesList={seriesStore.series}
            nextEpisodeFor={(seriesId) =>
              nextEpisodeNumber(seriesStore, seriesId)
            }
            onSerialChange={updateSerial}
          />
        )}
        {step === 2 && (
          <StepCharacters
            characters={project.characters}
            onChange={updateCharacters}
            previousEpisode={previous}
          />
        )}
        {step === 3 && (
          <StepPlot
            scenes={project.scenes}
            characters={project.characters}
            onChange={updateScenes}
          />
        )}
        {step === 4 && (
          <StepEditor
            scenes={project.scenes}
            characters={project.characters}
            theme={project.theme}
            onChange={updateScenes}
            onBackToPlot={() => setStep(3)}
            previousEpisode={previous}
          />
        )}
        {step === 5 && (
          <StepExport
            project={project}
            onSaveEpisode={saveEpisode}
            onReloadSaved={reloadSaved}
          />
        )}

        {/* 前後移動 */}
        <div className="mt-10 flex items-center justify-between gap-4 border-t border-blue-400/15 pt-6">
          <Button
            variant="ghost"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
          >
            ← 戻る
          </Button>
          <span className="text-xs text-blue-200/40">
            Step {step} / {LAST_STEP}
          </span>
          <Button
            onClick={() => setStep((s) => Math.min(LAST_STEP, s + 1))}
            disabled={step === LAST_STEP}
          >
            次へ →
          </Button>
        </div>
      </div>
    </main>
  );
}
