'use client';

import {
  BATCH_SIZES,
  MAX_BATCH_SIZE,
  MAX_SESSIONS,
  SECONDS_PER_IMAGE,
  SESSION_COUNTS,
  SESSION_THEME_PRESETS,
  clampCount,
  formatDuration,
} from '@/lib/gravure';

import {
  NATURAL_POSES,
  POSE_MODE_LABELS,
  type PoseMode,
} from '@/lib/gravure-prompt';

import type { ReferenceMode } from './use-batch-generation';

import { Card, SecondaryButton, Select, TextInput } from './ui';

/** プロンプトの決め方 */
export type PromptMode = 'fixed' | 'themes' | 'auto';

/**
 * 【生成設定】1 回の枚数 × 生成回数を決めるところ。
 *
 * 目安のボタンに無い数も手入力できる。合計と所要時間の目安、
 * かかる API 料金の回数をその場で出して、押す前に分かるようにする。
 */

/** 目安ボタンと手入力の組。数の意味だけ違うので中身は共通 */
function CountPicker({
  label,
  unit,
  presets,
  value,
  max,
  onChange,
}: {
  label: string;
  unit: string;
  presets: readonly number[];
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-bold text-violet-50">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(preset)}
            aria-pressed={value === preset}
            className={`min-w-[3.25rem] rounded-xl border-2 px-3 py-1.5 text-sm font-bold transition ${
              value === preset
                ? 'border-violet-400 bg-violet-500/25 text-white'
                : 'border-violet-400/30 text-violet-100/70 hover:border-violet-400/70 hover:text-white'
            }`}
          >
            {preset}
          </button>
        ))}
        <label className="flex items-center gap-1.5 text-xs text-violet-200/60">
          <span>または</span>
          <TextInput
            type="number"
            min={1}
            max={max}
            value={value}
            onChange={(e) => onChange(clampCount(Number(e.target.value), max))}
            className="w-20 px-2 py-1.5 text-sm"
            aria-label={`${label}を入力`}
          />
          <span>{unit}</span>
        </label>
      </div>
      <p className="mt-1 text-[11px] text-violet-200/40">1〜{max} {unit}</p>
    </div>
  );
}

export function GenerationPlan({
  count,
  onCountChange,
  sessions,
  onSessionsChange,
  themes,
  onThemesChange,
  promptMode,
  onPromptModeChange,
  autoPrompts,
  onRegenerate,
  poseMode,
  onPoseModeChange,
  manualPose,
  onManualPoseChange,
  /** img2img で参考画像を使うと、1 セッションの枚数が枚数 × 参考画像数になる */
  referenceCount,
  referenceMode,
  onReferenceModeChange,
}: {
  count: number;
  onCountChange: (value: number) => void;
  sessions: number;
  onSessionsChange: (value: number) => void;
  themes: string[];
  onThemesChange: (themes: string[]) => void;
  promptMode: PromptMode;
  onPromptModeChange: (mode: PromptMode) => void;
  autoPrompts: string[];
  onRegenerate: () => void;
  poseMode: PoseMode;
  onPoseModeChange: (mode: PoseMode) => void;
  manualPose: string;
  onManualPoseChange: (pose: string) => void;
  referenceCount: number;
  referenceMode: ReferenceMode;
  onReferenceModeChange: (mode: ReferenceMode) => void;
}) {
  // rotate は参考画像で枚数を増やさない。1 枚ごとに参考画像を切り替える
  const multiplying = referenceCount > 0 && referenceMode === 'multiply';
  const perSession = multiplying ? count * referenceCount : count;
  const total = perSession * sessions;
  const seconds = total * SECONDS_PER_IMAGE;

  function switchMode(mode: PromptMode) {
    onPromptModeChange(mode);
    // テーマを使うときだけ、空なら候補を入れておく
    if (mode === 'themes' && themes.length === 0) {
      onThemesChange([
        ...SESSION_THEME_PRESETS.slice(0, Math.max(2, Math.min(sessions, 10))),
      ]);
    }
  }

  return (
    <Card>
      <p className="mb-4 text-sm font-bold text-violet-50">【生成設定】</p>

      <div className="space-y-5">
        <CountPicker
          label="1 回の生成枚数"
          unit="枚"
          presets={BATCH_SIZES}
          value={count}
          max={MAX_BATCH_SIZE}
          onChange={onCountChange}
        />

        <CountPicker
          label="生成回数"
          unit="回"
          presets={SESSION_COUNTS}
          value={sessions}
          max={MAX_SESSIONS}
          onChange={onSessionsChange}
        />

        {/* 参考画像を入れているときだけ出す。入れていないと選ぶ意味がない */}
        {referenceCount > 0 && (
          <div className="rounded-xl border border-violet-400/20 bg-black/20 p-3">
            <span className="mb-2 block text-sm font-bold text-violet-50">
              参考画像 {referenceCount} 枚の使い方
            </span>
            <div className="space-y-1.5">
              {(
                [
                  [
                    'rotate',
                    '1 枚ごとに切り替える',
                    `合計 ${count * sessions} 枚。参考画像を 1 枚ずつ配り替えて、似せた絵を作ります`,
                  ],
                  [
                    'multiply',
                    '参考画像ごとにまとめて作る',
                    `合計 ${count * referenceCount * sessions} 枚。参考画像 1 枚につき ${count} 枚ずつ作ります`,
                  ],
                ] as const
              ).map(([mode, label, hint]) => (
                <label key={mode} className="flex cursor-pointer items-start gap-2">
                  <input
                    type="radio"
                    name="referenceMode"
                    value={mode}
                    checked={referenceMode === mode}
                    onChange={() => onReferenceModeChange(mode)}
                    className="mt-0.5 h-4 w-4 accent-violet-500"
                  />
                  <span>
                    <span className="text-xs font-bold text-violet-50">{label}</span>
                    <span className="mt-0.5 block text-[11px] text-violet-200/50">
                      {hint}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-violet-200/40">
              切り替えは山札を混ぜて配る方式なので、同じ参考画像が続けて出ません。
            </p>
          </div>
        )}

        {/* 同じ枚数でも「1 枚 × 50 回」と「50 枚 × 1 回」で結果が変わるのは
            テーマを回したときだけなので、その切り替えをここに置く */}
        <div className="rounded-xl border border-violet-400/20 bg-black/20 p-3">
          <span className="mb-2 block text-sm font-bold text-violet-50">
            回ごとのプロンプト
          </span>

          <div className="flex flex-wrap gap-2">
            {(
              [
                ['fixed', '毎回同じ', '入力したプロンプトのまま。種だけ変わります'],
                ['themes', 'テーマを足す', '入力したプロンプトの末尾に回ごとのテーマを足します'],
                ['auto', '自動生成', 'ポーズ・衣装・照明などを組み合わせて回ごとに作ります'],
              ] as const
            ).map(([mode, label, hint]) => (
              <button
                key={mode}
                type="button"
                onClick={() => switchMode(mode)}
                aria-pressed={promptMode === mode}
                title={hint}
                className={`rounded-xl border-2 px-3 py-1.5 text-sm font-bold transition ${
                  promptMode === mode
                    ? 'border-violet-400 bg-violet-500/25 text-white'
                    : 'border-violet-400/30 text-violet-100/70 hover:border-violet-400/70 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {promptMode === 'fixed' && (
            <p className="mt-2 text-[11px] text-violet-200/50">
              入力したプロンプトをそのまま使い、種だけ変えたバリエーションになります。
            </p>
          )}

          {promptMode === 'themes' && (
            <div className="mt-3">
              <p className="mb-1 text-[11px] text-violet-200/50">
                1 行に 1 つ。プロンプトの末尾に足します。回数がテーマ数より多いと先頭に戻ります。
              </p>
              <textarea
                value={themes.join('\n')}
                onChange={(e) =>
                  onThemesChange(
                    e.target.value.split('\n').map((line) => line.trim()).filter(Boolean),
                  )
                }
                rows={Math.min(8, Math.max(3, themes.length + 1))}
                className="w-full resize-y rounded-xl border border-violet-400/25 bg-violet-950/40 px-3 py-2 text-xs text-white focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              />
              <p className="mt-1 text-[11px] text-violet-200/40">
                {themes.length} 個のテーマを {sessions} 回に割り当てます。
              </p>
            </div>
          )}

          {promptMode === 'auto' && (
            <div className="mt-3">
              {/* ポーズだけは決め方を選べる。衣装・背景・照明は常にランダム */}
              <fieldset className="mb-3 rounded-xl border border-violet-400/20 p-3">
                <legend className="px-1 text-xs font-bold text-violet-50">
                  ポーズの決め方
                </legend>
                <div className="space-y-1.5">
                  {(Object.keys(POSE_MODE_LABELS) as PoseMode[]).map((mode) => (
                    <label key={mode} className="flex cursor-pointer items-start gap-2">
                      <input
                        type="radio"
                        name="poseMode"
                        value={mode}
                        checked={poseMode === mode}
                        onChange={() => onPoseModeChange(mode)}
                        className="mt-0.5 h-4 w-4 accent-violet-500"
                      />
                      <span>
                        <span className="text-xs font-bold text-violet-50">
                          {POSE_MODE_LABELS[mode].label}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-violet-200/50">
                          {POSE_MODE_LABELS[mode].hint}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>

                {poseMode === 'manual' && (
                  <div className="mt-2">
                    <Select
                      value={manualPose}
                      onChange={(e) => onManualPoseChange(e.target.value)}
                      aria-label="固定するポーズ"
                      className="py-2 text-xs"
                    >
                      {NATURAL_POSES.map((pose) => (
                        <option key={pose} value={pose} className="bg-violet-950">
                          {pose}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              </fieldset>

              <div className="mb-2 flex flex-wrap items-center gap-3">
                <SecondaryButton
                  type="button"
                  className="px-3 py-1.5 text-xs"
                  onClick={onRegenerate}
                >
                  🎲 作り直す
                </SecondaryButton>
                <span className="text-[11px] text-violet-200/50">
                  ここに出ている {autoPrompts.length} 個がそのまま使われます。
                  上のプロンプト欄は使いません。
                </span>
              </div>

              {/* 押す前に何が作られるか読めるようにする */}
              <ol className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl border border-violet-400/20 bg-violet-950/40 p-2">
                {autoPrompts.map((prompt, i) => (
                  <li key={i} className="flex gap-2 text-[11px] leading-relaxed">
                    <span className="shrink-0 font-bold text-violet-300/70">{i + 1}.</span>
                    <span className="text-violet-50/80">{prompt}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        <dl className="grid gap-2 rounded-xl border border-violet-400/25 bg-violet-500/10 p-3 text-sm sm:grid-cols-2">
          <div className="flex gap-2 sm:col-span-2">
            <dt className="text-violet-200/60">合計</dt>
            <dd className="font-bold text-white">
              {multiplying
                ? `${count} 枚 × 参考 ${referenceCount} 枚 × ${sessions} 回 = ${total} 枚`
                : `${count} 枚 × ${sessions} 回 = ${total} 枚`}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-violet-200/60">予想時間</dt>
            <dd className="font-bold text-white">約 {formatDuration(seconds)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-violet-200/60">API 料金</dt>
            <dd className="font-bold text-white">{total} 回ぶん</dd>
          </div>
        </dl>

        {total >= 100 && (
          <p className="rounded-xl border border-amber-500/40 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
            ⚠️ {total} 枚は {total} 回ぶんの API 料金がかかり、約 {formatDuration(seconds)} かかります。
            生成中はこのページを開いたままにしてください。
          </p>
        )}
      </div>
    </Card>
  );
}
