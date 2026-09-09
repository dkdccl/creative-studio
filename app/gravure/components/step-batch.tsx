'use client';

import { useState } from 'react';

import {
  SECONDS_PER_IMAGE,
  formatDuration,
  formatRemaining,
  type PromptSettings,
} from '@/lib/gravure';
import type { DetectResult } from '@/app/api/gravure/detect-people/route';

import { downloadPromptCsv, downloadShot } from '@/lib/gravure-export';
import { isStubMode } from '@/lib/gravure-stub';
import { isDesktop, openWorkspaceFolder } from '@/lib/filesystem';

import { DeleteConfirmModal } from './delete-confirm-modal';
import {
  Card,
  DangerButton,
  ErrorNote,
  PrimaryButton,
  SecondaryButton,
  StepShell,
} from './ui';
import type { ReferenceMode, useBatchGeneration } from './use-batch-generation';

type Batch = ReturnType<typeof useBatchGeneration>;

export function StepBatch({
  batch,
  count,
  sessions,
  themes,
  sessionPrompts,
  referenceMode,
  settings,
  references,
  onNext,
}: {
  batch: Batch;
  count: number;
  sessions: number;
  themes: string[];
  sessionPrompts: string[];
  referenceMode: ReferenceMode;
  settings: PromptSettings;
  references: File[];
  onNext: () => void;
}) {
  const {
    shots,
    excludedIds,
    toggleExcluded,
    removeShot,
    failures,
    status,
    completed,
    total,
    fatalError,
    session,
    sessionTotal,
    stopRequested,
    savedVolume,
    isRunning,
  } = batch;

  const usingReferences = settings.mode === 'img2img' && references.length > 0;
  // perPose は 1 周で各ポーズ 1 枚ずつ（枚数の指定は使わない）
  const perPose = usingReferences && referenceMode === 'perPose';
  const multiplying = usingReferences && referenceMode === 'multiply';
  const perSession = perPose
    ? references.length
    : multiplying
      ? count * references.length
      : count;
  const planned = perSession * sessions;
  const denominator = total || planned;
  const percent = denominator === 0 ? 0 : (completed / denominator) * 100;
  const remainingSeconds = Math.max(0, denominator - completed) * SECONDS_PER_IMAGE;

  const [isDetecting, setIsDetecting] = useState(false);
  const [detectNote, setDetectNote] = useState<string | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);

  // 削除の確認待ちにしている画像。null なら確認ダイアログは出さない
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteNote, setDeleteNote] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const pendingDeleteShot = shots.find((shot) => shot.id === pendingDeleteId);

  /** 生成し直すと前回の判定結果や削除の知らせは古くなるので、一緒に消す */
  function startBatch() {
    setDetectNote(null);
    setDetectError(null);
    setDeleteNote(null);
    setDeleteError(null);
    batch.start({
      count,
      sessions,
      settings,
      references,
      themes,
      sessionPrompts,
      referenceMode,
    });
  }

  /**
   * 確認ダイアログで「削除」を押されたときの後始末。
   *
   * Supabase に保存済みの画像だけ Storage とテーブルからも消す。
   * 生成しただけの画像はブラウザの中にしか無いので、一覧から外して終わり。
   */
  async function onConfirmDelete() {
    if (!pendingDeleteShot) {
      setPendingDeleteId(null);
      return;
    }

    setIsDeleting(true);
    setDeleteNote(null);
    setDeleteError(null);

    try {
      if (pendingDeleteShot.imageId) {
        const response = await fetch('/api/gravure/delete-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageId: pendingDeleteShot.imageId }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);
      }

      removeShot(pendingDeleteShot.id);
      setDeleteNote(`画像 ${pendingDeleteShot.index} を削除しました。`);
      setPendingDeleteId(null);
    } catch (err) {
      // 消せなかったときはカードを残す。もう一度押せば再試行になる
      setDeleteError(
        err instanceof Error ? `削除に失敗しました: ${err.message}` : '削除に失敗しました。',
      );
      setPendingDeleteId(null);
    } finally {
      setIsDeleting(false);
    }
  }

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
      description={
        perPose
          ? `参考画像 ${references.length} 種を 1 枚ずつ作る周を ${sessions} 回くり返し、合計 ${planned} 枚を生成します。途中で止められます。`
          : `${count} 枚 × ${sessions} 回${
              multiplying ? ` × 参考 ${references.length} 枚` : ''
            } = 合計 ${planned} 枚を順番に生成します。${
              usingReferences ? `参考画像 ${references.length} 枚を 1 枚ごとに切り替えます。` : ''
            }途中で止められます。`
      }
    >
      {isStubMode && (
        <p className="mb-4 rounded-xl border border-amber-500/50 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
          🧪 スタブモードです（NEXT_PUBLIC_USE_STUB=true）。Prodia は呼ばれず、
          プロンプトと種をコンソールに出すだけで、実際の画像は作られません。
          本番で生成するには .env.local を false にしてサーバーを再起動してください。
        </p>
      )}

      {status === 'idle' ? (
        <div className="flex flex-col items-start gap-4">
          <Card className="w-full">
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div className="flex gap-2">
                <dt className="text-violet-200/50">枚数</dt>
                <dd className="font-bold text-white">
                  {perPose
                    ? `${planned} 枚（参考 ${references.length} 種 × ${sessions} 回）`
                    : `${planned} 枚（${count} 枚 × ${sessions} 回${
                        multiplying ? ` × 参考 ${references.length} 枚` : ''
                      }）`}
                </dd>
              </div>
              {usingReferences && (
                <div className="flex gap-2">
                  <dt className="text-violet-200/50">参考画像</dt>
                  <dd className="font-bold text-white">
                    {references.length} 枚を
                    {perPose
                      ? '1 周で 1 枚ずつ'
                      : multiplying
                        ? `それぞれ ${count} 枚ずつ`
                        : '1 枚ごとに切り替え'}
                  </dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="text-violet-200/50">回ごと</dt>
                <dd className="font-bold text-white">
                  {sessionPrompts.length > 0
                    ? `自動生成 ${sessionPrompts.length} 個`
                    : themes.length > 0
                      ? `テーマ ${themes.length} 個を回す`
                      : '毎回同じ'}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-violet-200/50">サイズ</dt>
                <dd className="font-bold text-white">
                  {settings.width}×{settings.height}
                </dd>
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <dt className="shrink-0 text-violet-200/50">プロンプト</dt>
                <dd className="truncate text-violet-50">
                  {sessionPrompts.length > 0 ? sessionPrompts[0] : settings.prompt}
                </dd>
              </div>
            </dl>
          </Card>
          <PrimaryButton type="button" onClick={startBatch}>
            ⚡ 自動生成を開始
          </PrimaryButton>
          <p className="text-xs text-violet-200/40">
            所要時間の目安 約 {formatDuration(planned * SECONDS_PER_IMAGE)}
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
                  ? `${completed}/${denominator} 生成中…` +
                    (sessionTotal > 1 ? `（${session}/${sessionTotal} 回目）` : '')
                  : status === 'cancelled'
                    ? `停止しました（${shots.length} 枚生成済み）`
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
              <>
                {/* 区切りまで作り切る停止と、その場で打ち切る停止を分ける。
                    1 回だけの生成では両者に差が無いので区切り停止は出さない */}
                {sessionTotal > 1 && (
                  <SecondaryButton
                    type="button"
                    onClick={batch.stopAfterSession}
                    disabled={stopRequested}
                  >
                    {stopRequested
                      ? `⏸️ ${session} 回目の完了後に停止します`
                      : '⏸️ この回で停止'}
                  </SecondaryButton>
                )}
                <SecondaryButton type="button" onClick={batch.cancel}>
                  ✕ すぐに中止
                </SecondaryButton>
              </>
            ) : (
              <>
                <SecondaryButton type="button" onClick={startBatch}>
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

          {/* デスクトップ版では生成と同時にフォルダへ残るので、その旨を出す */}
          {isDesktop() && savedVolume !== null && (
            <p className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-500/40 bg-emerald-950/25 px-4 py-3 text-sm text-emerald-200">
              <span>
                📁 生成した画像を{' '}
                <code className="text-emerald-100">
                  creative-studio-workspace/gravure/vol-
                  {String(savedVolume).padStart(2, '0')}/images/
                </code>{' '}
                にも保存しています。
              </span>
              <SecondaryButton
                type="button"
                className="px-3 py-1 text-xs"
                onClick={() => void openWorkspaceFolder()}
              >
                フォルダを開く
              </SecondaryButton>
            </p>
          )}

          {/* 最後の 1 枚を消すと一覧ごと消えるので、結果は一覧の外に出しておく */}
          {deleteNote && (
            <p className="text-xs text-violet-200/60" role="status">
              {deleteNote}
            </p>
          )}
          {deleteError && <ErrorNote>{deleteError}</ErrorNote>}

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

                <SecondaryButton
                  type="button"
                  className="px-3 py-1.5 text-xs"
                  onClick={() => downloadPromptCsv(shots)}
                >
                  📊 プロンプトをエクスポート
                </SecondaryButton>
              </div>

              {detectNote && (
                <p className="text-xs text-violet-200/60">{detectNote}</p>
              )}
              {detectError && <ErrorNote>{detectError}</ErrorNote>}

              <p className="text-xs text-violet-200/50">
                {shots.length} 枚とも別々のファイルです。書き出しに含めない画像は
                「除外」を押してください（{excludedIds.length} 枚を除外中）。
                「削除」は一覧から消してしまうので、元には戻せません。
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
                          {/* 回ごとに枚数が 1 始まりに戻るので、
                              2 回以上あるときは何回目かも出さないと見分けが付かない */}
                          {sessionTotal > 1 && shot.session !== undefined &&
                            `${shot.session} 回目 / `}
                          {shot.referenceIndex !== undefined &&
                            `参考 ${shot.referenceIndex} / `}
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
                        <DangerButton
                          type="button"
                          className="px-3 py-1.5 text-xs"
                          onClick={() => setPendingDeleteId(shot.id)}
                          disabled={isDeleting}
                        >
                          🗑️ 削除
                        </DangerButton>
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
                  <li key={`${failure.referenceIndex ?? 0}-${failure.index}`}>
                    {failure.referenceIndex !== undefined &&
                      `参考 ${failure.referenceIndex} / `}
                    {failure.index} 枚目: {failure.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <DeleteConfirmModal
        open={pendingDeleteShot !== undefined}
        description={
          pendingDeleteShot
            ? `画像 ${pendingDeleteShot.index}${
                pendingDeleteShot.referenceIndex !== undefined
                  ? `（参考 ${pendingDeleteShot.referenceIndex}）`
                  : ''
              } を削除します。`
            : undefined
        }
        busy={isDeleting}
        onConfirm={onConfirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </StepShell>
  );
}
