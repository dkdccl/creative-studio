'use client';

import { useState } from 'react';

import {
  IMG2IMG_MODELS,
  SECONDS_PER_IMAGE,
  SIZE_PRESETS,
  STYLE_OPTIONS,
  formatDuration,
  img2imgModel,
  type GenerationMode,
  type Img2ImgModel,
  type PromptSettings,
} from '@/lib/gravure';

import type { PoseMode } from '@/lib/gravure-prompt';
import type { PosePairing } from '@/lib/poses';

import type { ReferenceMode } from './use-batch-generation';

import { GenerationPlan, type PromptMode } from './generation-plan';
import { ReferenceUpload } from './reference-upload';
import {
  ErrorNote,
  Field,
  PrimaryButton,
  SecondaryButton,
  Select,
  StepShell,
  TextArea,
  TextInput,
} from './ui';

const TABS: { mode: GenerationMode; label: string; hint: string }[] = [
  { mode: 'txt2img', label: '📝 テキストプロンプト', hint: '文章だけから作ります' },
  { mode: 'img2img', label: '🖼️ 参考画像をアップロード', hint: '画像から派生させます' },
];

export function StepPrompt({
  settings,
  onChange,
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
  referenceMode,
  onReferenceModeChange,
  posePairing,
  onPosePairingChange,
  references,
  onReferencesChange,
  onNext,
}: {
  settings: PromptSettings;
  onChange: (next: PromptSettings) => void;
  count: number;
  onCountChange: (next: number) => void;
  sessions: number;
  onSessionsChange: (next: number) => void;
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
  referenceMode: ReferenceMode;
  onReferenceModeChange: (mode: ReferenceMode) => void;
  posePairing: PosePairing;
  onPosePairingChange: (pairing: PosePairing) => void;
  references: File[];
  onReferencesChange: (files: File[]) => void;
  onNext: () => void;
}) {
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [translateNote, setTranslateNote] = useState<string | null>(null);
  // 変換前の文章。気に入らなければ戻せるようにしておく
  const [beforeTranslation, setBeforeTranslation] = useState<string | null>(null);

  /** 日本語で書いたプロンプトを、画像生成に渡せる英語に置き換える */
  async function translatePrompt() {
    const text = settings.prompt.trim();
    if (!text) return;

    setTranslating(true);
    setTranslateError(null);
    setTranslateNote(null);

    try {
      const response = await fetch('/api/gravure/translate-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? `HTTP ${response.status}`);

      setBeforeTranslation(text);
      set('prompt', data.prompt as string);
      setTranslateNote('英語に変換しました。必要なら手で直せます。');
    } catch (err) {
      setTranslateError(
        err instanceof Error ? `変換に失敗しました: ${err.message}` : '変換に失敗しました。',
      );
    } finally {
      setTranslating(false);
    }
  }

  const set = <K extends keyof PromptSettings>(key: K, value: PromptSettings[K]) =>
    onChange({ ...settings, [key]: value });

  const isImg2Img = settings.mode === 'img2img';
  const model = img2imgModel(settings.img2imgModel);
  // 自動生成のときは入力欄を使わないので、空でも先へ進める
  const hasPrompt = promptMode === 'auto' || settings.prompt.trim() !== '';
  const canProceed = hasPrompt && (!isImg2Img || references.length > 0);
  // img2img は参考画像 1 枚ごとに count 枚ずつ作る。それを回数ぶん繰り返す
  const perSession =
    isImg2Img && references.length > 0 ? count * references.length : count;
  const totalShots = perSession * sessions;

  function switchMode(mode: GenerationMode) {
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
          <ReferenceUpload value={references} onChange={onReferencesChange} />

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
        hint={isImg2Img ? '参考画像への追加指示' : '日本語で書いて英語に変換できます'}
      >
        <TextArea
          rows={4}
          value={settings.prompt}
          onChange={(e) => set('prompt', e.target.value)}
          placeholder="日本語でも英語でも構いません。日本語で書いた場合は下のボタンで英語に変換してください"
        />
      </Field>

      {/* 画像モデルは英語のほうが安定するが、毎回英語で書くのは手間なので
          書いたものをここで置き換える。変換後は自分で直せる */}
      <div className="-mt-3 flex flex-wrap items-center gap-3">
        <SecondaryButton
          type="button"
          className="px-3 py-1.5 text-xs"
          onClick={() => void translatePrompt()}
          disabled={translating || settings.prompt.trim() === ''}
        >
          {translating ? '変換中…' : '🇯🇵 → 🇬🇧 英語に変換'}
        </SecondaryButton>
        {beforeTranslation !== null && (
          <SecondaryButton
            type="button"
            className="px-3 py-1.5 text-xs"
            onClick={() => {
              set('prompt', beforeTranslation);
              setBeforeTranslation(null);
              setTranslateNote(null);
            }}
          >
            ↩ 変換前に戻す
          </SecondaryButton>
        )}
        {translateNote && (
          <span className="text-[11px] text-violet-200/50">{translateNote}</span>
        )}
      </div>
      {translateError && (
        <div className="-mt-2">
          <ErrorNote>{translateError}</ErrorNote>
        </div>
      )}

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

      <GenerationPlan
        count={count}
        onCountChange={onCountChange}
        sessions={sessions}
        onSessionsChange={onSessionsChange}
        themes={themes}
        onThemesChange={onThemesChange}
        promptMode={promptMode}
        onPromptModeChange={onPromptModeChange}
        autoPrompts={autoPrompts}
        onRegenerate={onRegenerate}
        poseMode={poseMode}
        onPoseModeChange={onPoseModeChange}
        manualPose={manualPose}
        onManualPoseChange={onManualPoseChange}
        referenceCount={isImg2Img ? references.length : 0}
        referenceMode={referenceMode}
        onReferenceModeChange={onReferenceModeChange}
        posePairing={posePairing}
        onPosePairingChange={onPosePairingChange}
      />

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

      <label className="flex cursor-pointer gap-3 rounded-xl border border-violet-400/20 bg-black/25 px-4 py-3 transition hover:border-violet-400/50">
        <input
          type="checkbox"
          checked={settings.enforceSingleSubject}
          onChange={(e) => set('enforceSingleSubject', e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-violet-500"
        />
        <span>
          <span className="block text-sm font-bold text-violet-50">
            1 枚 1 人を強制する
          </span>
          <span className="mt-0.5 block text-xs text-violet-200/50">
            4 分割のようなグリッド合成が返らないよう、プロンプトに単写真の指示を
            足します。ネガティブに対応したモデルでは否定側にも入れます。
          </span>
        </span>
      </label>

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
          合計 {totalShots} 枚・所要時間の目安は約{' '}
          {formatDuration(totalShots * SECONDS_PER_IMAGE)}（{totalShots}{' '}
          回ぶんの API 料金がかかります）
        </p>
        <PrimaryButton type="button" onClick={onNext} disabled={!canProceed}
        >
          一括生成へ進む →
        </PrimaryButton>
      </div>
    </StepShell>
  );
}
