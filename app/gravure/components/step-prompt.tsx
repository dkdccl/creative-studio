'use client';

import {
  BATCH_SIZES,
  IMG2IMG_BATCH_SIZES,
  IMG2IMG_MODELS,
  SECONDS_PER_IMAGE,
  SIZE_PRESETS,
  STYLE_OPTIONS,
  formatRemaining,
  img2imgModel,
  type GenerationMode,
  type Img2ImgModel,
  type PromptSettings,
} from '@/lib/gravure';

import { ReferenceUpload } from './reference-upload';
import { Field, PrimaryButton, Select, StepShell, TextArea, TextInput } from './ui';

const TABS: { mode: GenerationMode; label: string; hint: string }[] = [
  { mode: 'txt2img', label: '📝 テキストプロンプト', hint: '文章だけから作ります' },
  { mode: 'img2img', label: '🖼️ 参考画像をアップロード', hint: '画像から派生させます' },
];

export function StepPrompt({
  settings,
  onChange,
  count,
  onCountChange,
  reference,
  onReferenceChange,
  onNext,
}: {
  settings: PromptSettings;
  onChange: (next: PromptSettings) => void;
  count: number;
  onCountChange: (next: number) => void;
  reference: File | null;
  onReferenceChange: (file: File | null) => void;
  onNext: () => void;
}) {
  const set = <K extends keyof PromptSettings>(key: K, value: PromptSettings[K]) =>
    onChange({ ...settings, [key]: value });

  const isImg2Img = settings.mode === 'img2img';
  const model = img2imgModel(settings.img2imgModel);
  const sizes: readonly number[] = isImg2Img ? IMG2IMG_BATCH_SIZES : BATCH_SIZES;
  const canProceed =
    settings.prompt.trim() !== '' && (!isImg2Img || reference !== null);

  function switchMode(mode: GenerationMode) {
    // 枚数の選択肢が違うので、切り替え時に範囲内へ寄せる
    const allowed = mode === 'img2img' ? IMG2IMG_BATCH_SIZES : BATCH_SIZES;
    if (!allowed.includes(count as never)) onCountChange(allowed[allowed.length - 1]);
    onChange({ ...settings, mode });
  }

  return (
    <StepShell
      step={1}
      title="プロンプトと生成枚数"
      description="ここで決めた設定で、次のステップで指定枚数をまとめて生成します。"
    >
      {/* タブ切り替え */}
      <div role="tablist" aria-label="生成方法" className="flex gap-2">
        {TABS.map((tab) => {
          const active = settings.mode === tab.mode;
          return (
            <button
              key={tab.mode}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => switchMode(tab.mode)}
              className={`flex-1 rounded-xl border-2 px-3 py-3 text-left transition ${
                active
                  ? 'border-violet-400 bg-violet-500/25 text-white'
                  : 'border-white/10 bg-white/[0.03] text-violet-100/50 hover:border-violet-400/40'
              }`}
            >
              <span className="block text-sm font-bold">{tab.label}</span>
              <span className="mt-0.5 block text-xs opacity-70">{tab.hint}</span>
            </button>
          );
        })}
      </div>

      {isImg2Img && (
        <>
          <ReferenceUpload value={reference} onChange={onReferenceChange} />

          <Field label="モデル" hint="klein は低コスト">
            <Select
              value={settings.img2imgModel}
              onChange={(e) => set('img2imgModel', e.target.value as Img2ImgModel)}
            >
              {IMG2IMG_MODELS.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  className="bg-violet-950"
                >
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <div>
            <Field
              label={`ストレングス: ${settings.strength}`}
              hint="低いほど参考画像に近い"
            >
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={settings.strength}
                disabled={!model.supportsStrength}
                onChange={(e) => set('strength', Number(e.target.value))}
                className="w-full accent-violet-500 disabled:opacity-30"
              />
            </Field>
            {!model.supportsStrength && (
              <p className="mt-1 text-xs text-amber-300">
                {model.label} は Prodia 側にストレングスの指定がないため、この値は
                送信されません。調整したい場合は他のモデルを選んでください。
              </p>
            )}
          </div>
        </>
      )}

      <Field
        label="プロンプト"
        hint={isImg2Img ? '参考画像への追加指示（英語推奨）' : '英語のほうが安定します'}
      >
        <TextArea
          rows={4}
          value={settings.prompt}
          onChange={(e) => set('prompt', e.target.value)}
          placeholder="生成したい画像を英語で説明してください"
        />
      </Field>

      <div>
        <Field label="ネガティブプロンプト" hint="描いてほしくない要素">
          <TextInput
            value={settings.negativePrompt}
            onChange={(e) => set('negativePrompt', e.target.value)}
            disabled={isImg2Img && !model.supportsNegativePrompt}
            className={
              isImg2Img && !model.supportsNegativePrompt ? 'opacity-40' : undefined
            }
          />
        </Field>
        {isImg2Img && !model.supportsNegativePrompt && (
          <p className="mt-1 text-xs text-amber-300">
            {model.label} はネガティブプロンプトに対応していないため送信されません。
          </p>
        )}
      </div>

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
            onChange={(e) => onCountChange(Number(e.target.value))}
          >
            {sizes.map((size) => (
              <option key={size} value={size} className="bg-violet-950">
                {size} 枚
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {/* img2img は出力サイズを参考画像から引き継ぐので、ここでは触らない */}
      <div className={isImg2Img ? 'hidden' : undefined}>
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
        <Field
          label={`ステップ数: ${settings.steps}`}
          hint={
            isImg2Img
              ? `${model.label} は ${model.steps.min}〜${model.steps.max}`
              : '多いほど時間がかかります'
          }
        >
          <input
            type="range"
            min={isImg2Img ? model.steps.min : 1}
            max={isImg2Img ? model.steps.max : 50}
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
            disabled={isImg2Img}
            onChange={(e) => set('guidanceScale', Number(e.target.value))}
            className="w-full accent-violet-500 disabled:opacity-30"
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
        <PrimaryButton type="button" onClick={onNext} disabled={!canProceed}
        >
          一括生成へ進む →
        </PrimaryButton>
      </div>
    </StepShell>
  );
}
