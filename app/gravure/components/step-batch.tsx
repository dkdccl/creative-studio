'use client';

import { useState } from 'react';

import {
  SECONDS_PER_IMAGE,
  formatRemaining,
  type PromptSettings,
} from '@/lib/gravure';
import type { DetectResult } from '@/app/api/gravure/detect-people/route';

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
  const {
    shots,
    excludedIds,
    toggleExcluded,
    failures,
    status,
    completed,
    total,
    fatalError,
    isRunning,
  } = batch;

  const denominator = total || count;
  const percent = denominator === 0 ? 0 : (completed / denominator) * 100;
  const remainingSeconds = Math.max(0, denominator - completed) * SECONDS_PER_IMAGE;

  const [isDetecting, setIsDetecting] = useState(false);
  const [detectNote, setDetectNote] = useState<string | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);

  /** 人物が写っていないコマを OpenAI に見てもらって外す */
  async function onAutoExclude() {
    setIsDetecting(true);
    setDetectNote(null);
    setDetectError(null);

    try {
      const form = new FormData();
      shots.forEach((shot) => {
        form.append('images', shot.blob, `${shot.index}.jpg`);
        form.append('indexes', String(shot.index));
      });

      const response = await fetch('/api/gravure/detect-people', {
        method: 'POST',
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);

      const results: DetectResult[] = data.results ?? [];
      const withoutPerson = results.filter((result) => !result.hasPerson);
      const collages = results.filter((result) => result.isCollage);
      const drop = results.filter((r) => !r.hasPerson || r.isCollage);
      const undecided = results.filter((result) => result.error);

      // すでに除外済みのものを二重に切り替えないよう、状態を見てから押す
      drop.forEach((result) => {
        const shot = shots.find((item) => item.index === result.index);
        if (shot && !excludedIds.includes(shot.id)) toggleExcluded(shot.id);
      });

      const reasons = [
        withoutPerson.length > 0 ? `人物なし ${withoutPerson.length} 枚` : '',
        collages.length > 0 ? `グリッド合成 ${collages.length} 枚` : '',
      ].filter(Boolean);

      setDetectNote(
        drop.length === 0
          ? `${results.length} 枚とも 1 枚 1 人の単独写真でした。除外はありません。`
          : `${reasons.join('・')}を除外しました（計 ${drop.length} 枚）。` +
              (undecided.length > 0
                ? `${undecided.length} 枚は判定できなかったため残しています。`
                : ''),
      );
    } catch (err) {
      setDetectError(
        err instanceof Error ? `判定に失敗しました: ${err.message}` : '判定に失敗しました。',
      );
    } finally {
      setIsDetecting(false);
    }
  }

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
                  disabled={batch.includedShots.length === 0}
                >
                  メタデータ設定へ →
                </PrimaryButton>
              </>
            )}
          </div>

          {fatalError && <ErrorNote>{fatalError}</ErrorNote>}

          {/* 1 枚ずつのカード。隙間なく並べると 1 枚の合成画像に見えてしまうので離す */}
          {shots.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <SecondaryButton
                  type="button"
                  className="px-3 py-1.5 text-xs"
                  onClick={onAutoExclude}
                  disabled={isDetecting || shots.length === 0}
                >
                  {isDetecting ? '判定中…' : '🔍 人物なし・グリッド合成を自動判定して除外'}
                </SecondaryButton>
                <span className="text-[11px] text-violet-200/40">
                  OpenAI の画像判定を使います（1 枚につき 1 回ぶんの料金）
                </span>
              </div>

              {detectNote && (
                <p className="text-xs text-violet-200/60">{detectNote}</p>
              )}
              {detectError && <ErrorNote>{detectError}</ErrorNote>}

              <p className="text-xs text-violet-200/50">
                {shots.length} 枚とも別々のファイルです。書き出しに含めない画像は
                「除外」を押してください（{excludedIds.length} 枚を除外中）。
              </p>
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {shots.map((shot) => {
                  const excluded = excludedIds.includes(shot.id);
                  return (
                    <li
                      key={shot.id}
                      className={`overflow-hidden rounded-2xl border bg-black/25 transition ${
                        excluded
                          ? 'border-white/10 opacity-40'
                          : 'border-violet-400/25'
                      }`}
                    >
                      <div className="flex items-center justify-between px-3 py-2">
                        <span className="text-xs font-bold text-violet-100">
                          画像 {shot.index}
                        </span>
                        <span className="text-[11px] text-violet-200/40">
                          {shot.width}×{shot.height}
                        </span>
                      </div>

                      {/* object URL のため next/image では最適化できない */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={shot.objectUrl}
                        alt={`生成画像 ${shot.index}`}
                        loading="lazy"
                        className="max-h-80 w-full bg-black/40 object-contain"
                      />

                      <div className="flex flex-wrap gap-2 px-3 py-3">
                        <SecondaryButton
                          type="button"
                          className="px-3 py-1.5 text-xs"
                          onClick={() => downloadShot(shot)}
                        >
                          ⬇ この画像を保存
                        </SecondaryButton>
                        <SecondaryButton
                          type="button"
                          className="px-3 py-1.5 text-xs"
                          onClick={() => toggleExcluded(shot.id)}
                        >
                          {excluded ? '↩ 戻す' : '✕ 除外'}
                        </SecondaryButton>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
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
