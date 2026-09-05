'use client';

import {
  SECONDS_PER_IMAGE,
  formatRemaining,
  type PromptSettings,
} from '@/lib/gravure';

import { downloadShot } from '@/lib/gravure-export';

import { Card, ErrorNote, PrimaryButton, SecondaryButton, StepShell } from './ui';
import type { useBatchGeneration } from './use-batch-generation';

type Batch = ReturnType<typeof useBatchGeneration>;

export function StepBatch({
  batch,
  count,
  settings,
  reference,
  onNext,
}: {
  batch: Batch;
  count: number;
  settings: PromptSettings;
  reference: File | null;
  onNext: () => void;
}) {
  const { shots, failures, status, completed, total, fatalError, isRunning } = batch;

  const denominator = total || count;
  const percent = denominator === 0 ? 0 : (completed / denominator) * 100;
  const remainingSeconds = Math.max(0, denominator - completed) * SECONDS_PER_IMAGE;

  return (
    <StepShell
      step={2}
      title="一括生成"
      description={`設定した内容で ${count} 枚を順番に生成します。途中でキャンセルできます。`}
    >
      {status === 'idle' ? (
        <div className="flex flex-col items-start gap-4">
          <Card className="w-full">
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="flex gap-2">
                <dt className="text-violet-200/50">枚数</dt>
                <dd className="font-bold text-white">{count} 枚</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-violet-200/50">サイズ</dt>
                <dd className="font-bold text-white">
                  {settings.width}×{settings.height}
                </dd>
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <dt className="shrink-0 text-violet-200/50">プロンプト</dt>
                <dd className="truncate text-violet-50">{settings.prompt}</dd>
              </div>
            </dl>
          </Card>
          <PrimaryButton type="button" onClick={() => batch.start(count, settings, reference)}>
            ⚡ 一括生成開始
          </PrimaryButton>
          <p className="text-xs text-violet-200/40">
            所要時間の目安 {formatRemaining(count * SECONDS_PER_IMAGE).replace('残り約 ', '約 ')}
            。生成中はこのページを開いたままにしてください。
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* 進捗バー */}
          <div role="status" aria-live="polite">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-bold text-white">
                {isRunning
                  ? `${completed}/${denominator} 生成中…`
                  : status === 'cancelled'
                    ? `キャンセルしました（${shots.length} 枚生成済み）`
                    : `完了：${shots.length}/${denominator} 枚`}
              </p>
              <p className="text-xs text-violet-200/50">
                {isRunning ? formatRemaining(remainingSeconds) : `失敗 ${failures.length} 枚`}
              </p>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-violet-900/60">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-400 transition-[width] duration-300 ease-out"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {isRunning ? (
              <SecondaryButton type="button" onClick={batch.cancel}>
                ✕ キャンセル
              </SecondaryButton>
            ) : (
              <>
                <SecondaryButton type="button" onClick={() => batch.start(count, settings, reference)}>
                  ↻ もう一度生成
                </SecondaryButton>
                <PrimaryButton
                  type="button"
                  onClick={onNext}
                  disabled={shots.length === 0}
                >
                  メタデータ設定へ →
                </PrimaryButton>
              </>
            )}
          </div>

          {fatalError && <ErrorNote>{fatalError}</ErrorNote>}

          {/* サムネイル */}
          {shots.length > 0 && (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {shots.map((shot) => (
                <li key={shot.id} className="group relative">
                  {/* object URL のため next/image では最適化できない */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={shot.objectUrl}
                    alt={`生成画像 ${shot.index}`}
                    loading="lazy"
                    className="aspect-[3/4] w-full rounded-lg object-cover ring-1 ring-violet-400/20"
                  />
                  <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {shot.index}
                  </span>
                  <button
                    type="button"
                    onClick={() => downloadShot(shot)}
                    aria-label={`${shot.index} 枚目を JPEG でダウンロード`}
                    title="JPEG でダウンロード"
                    className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-bold text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    ⬇
                  </button>
                </li>
              ))}
            </ul>
          )}

          {failures.length > 0 && (
            <details className="rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3">
              <summary className="cursor-pointer text-sm font-bold text-red-200">
                失敗 {failures.length} 件の内訳
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-red-200/80">
                {failures.map((failure) => (
                  <li key={failure.index}>
                    {failure.index} 枚目: {failure.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </StepShell>
  );
}
