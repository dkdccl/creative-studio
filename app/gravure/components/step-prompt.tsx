'use client';

import {
  BATCH_SIZES,
  SECONDS_PER_IMAGE,
  SIZE_PRESETS,
  STYLE_OPTIONS,
  formatRemaining,
  type BatchSize,
  type PromptSettings,
} from '@/lib/gravure';

import { Field, PrimaryButton, Select, StepShell, TextArea, TextInput } from './ui';

export function StepPrompt({
  settings,
  onChange,
  count,
  onCountChange,
  onNext,
}: {
  settings: PromptSettings;
  onChange: (next: PromptSettings) => void;
  count: BatchSize;
  onCountChange: (next: BatchSize) => void;
  onNext: () => void;
}) {
  const set = <K extends keyof PromptSettings>(key: K, value: PromptSettings[K]) =>
    onChange({ ...settings, [key]: value });

  return (
    <StepShell
      step={1}
      title="プロンプトと生成枚数"
      description="ここで決めた設定で、次のステップで指定枚数をまとめて生成します。"
    >
      <Field label="プロンプト" hint="英語のほうが安定します">
        <TextArea
          rows={4}
          value={settings.prompt}
          onChange={(e) => set('prompt', e.target.value)}
          placeholder="生成したい画像を英語で説明してください"
        />
      </Field>

      <Field label="ネガティブプロンプト" hint="描いてほしくない要素">
        <TextInput
          value={settings.negativePrompt}
          onChange={(e) => set('negativePrompt', e.target.value)}
        />
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="スタイル">
          <Select
            value={settings.stylePreset}
            onChange={(e) => set('stylePreset', e.target.value)}
          >
            {STYLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} className="bg-violet-950">
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="生成枚数">
          <Select
            value={count}
            onChange={(e) => onCountChange(Number(e.target.value) as BatchSize)}
          >
            {BATCH_SIZES.map((size) => (
              <option key={size} value={size} className="bg-violet-950">
                {size} 枚
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div>
        <span className="mb-2 block text-sm font-bold text-violet-50">サイズ</span>
        <div className="flex flex-wrap gap-2">
          {SIZE_PRESETS.map((preset) => {
            const active =
              preset.width === settings.width && preset.height === settings.height;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() =>
                  onChange({ ...settings, width: preset.width, height: preset.height })
                }
                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                  active
                    ? 'border-violet-400 bg-violet-500/20 text-violet-100'
                    : 'border-violet-400/30 text-violet-200/70 hover:border-violet-300 hover:text-white'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field label={`ステップ数: ${settings.steps}`} hint="多いほど時間がかかります">
          <input
            type="range"
            min={1}
            max={50}
            value={settings.steps}
            onChange={(e) => set('steps', Number(e.target.value))}
            className="w-full accent-violet-500"
          />
        </Field>
        <Field label={`忠実度: ${settings.guidanceScale}`} hint="高いほど指示どおり">
          <input
            type="range"
            min={1}
            max={10}
            step={0.5}
            value={settings.guidanceScale}
            onChange={(e) => set('guidanceScale', Number(e.target.value))}
            className="w-full accent-violet-500"
          />
        </Field>
      </div>

      <Field label="開始シード値" hint="空欄ならランダム。指定すると 1 枚ごとに +1">
        <TextInput
          type="number"
          min={0}
          value={settings.baseSeed ?? ''}
          onChange={(e) =>
            set('baseSeed', e.target.value === '' ? undefined : Number(e.target.value))
          }
          placeholder="空欄ならランダム"
        />
      </Field>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-violet-200/50">
          {count} 枚で所要時間の目安は{' '}
          {formatRemaining(count * SECONDS_PER_IMAGE).replace('残り約 ', '約 ')}（
          {count} 回ぶんの API 料金がかかります）
        </p>
        <PrimaryButton
          type="button"
          onClick={onNext}
          disabled={settings.prompt.trim() === ''}
        >
          一括生成へ進む →
        </PrimaryButton>
      </div>
    </StepShell>
  );
}
