'use client';

import { useEffect, useRef, useState } from 'react';

import type { GravureImage } from '@/app/api/gravure/generate/route';

/** UI から選べるサイズ。FLUX.2 は 512〜1920 の範囲を受け付ける */
const SIZE_PRESETS = [
  { label: '縦長 832×1216', width: 832, height: 1216 },
  { label: '縦長 768×1024', width: 768, height: 1024 },
  { label: '正方形 1024×1024', width: 1024, height: 1024 },
  { label: '横長 1216×832', width: 1216, height: 832 },
] as const;

const STYLE_OPTIONS = [
  { value: 'photographic', label: '写真風' },
  { value: 'cinematic', label: 'シネマ風' },
  { value: 'analog-film', label: 'フィルム風' },
  { value: 'anime', label: 'アニメ風' },
  { value: 'digital-art', label: 'デジタルアート' },
  { value: 'fantasy-art', label: 'ファンタジー' },
] as const;

/** Prodia は途中経過を返さないので、体感の目安として使う想定所要時間（秒） */
const ESTIMATED_SECONDS = 25;

const inputClass =
  'w-full rounded-xl border border-purple-400/30 bg-black/30 px-4 py-3 text-sm text-purple-50 ' +
  'placeholder:text-purple-200/30 outline-none transition focus:border-purple-300 ' +
  'focus:ring-2 focus:ring-purple-400/40';

const labelClass = 'mb-2 block text-sm font-bold text-purple-100';

export default function ImageGenerator() {
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState(
    'blurry, low quality, watermark, extra fingers',
  );
  const [stylePreset, setStylePreset] = useState<string>('photographic');
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: 832,
    height: 1216,
  });
  const [steps, setSteps] = useState(28);
  const [guidanceScale, setGuidanceScale] = useState(4);
  const [seed, setSeed] = useState('');

  const [result, setResult] = useState<GravureImage | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // 生成中だけ経過秒数を進める。Prodia は進捗を返さないので所要時間で代用する
  const startedAt = useRef<number>(0);
  useEffect(() => {
    if (!isGenerating) return;
    startedAt.current = Date.now();
    setElapsed(0);
    const timer = setInterval(() => {
      setElapsed(Math.round((Date.now() - startedAt.current) / 1000));
    }, 250);
    return () => clearInterval(timer);
  }, [isGenerating]);

  const canSubmit = prompt.trim() !== '' && !isGenerating;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/gravure/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          negativePrompt,
          stylePreset,
          width: size.width,
          height: size.height,
          steps,
          guidanceScale,
          seed: seed.trim() === '' ? undefined : Number(seed),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data?.error ?? `生成に失敗しました (HTTP ${response.status})`);
        return;
      }

      setResult(data as GravureImage);
    } catch (err) {
      setError(
        err instanceof Error
          ? `通信に失敗しました: ${err.message}`
          : '通信に失敗しました。',
      );
    } finally {
      setIsGenerating(false);
    }
  }

  // 目安の割合。実際の進捗ではないので 95% で頭打ちにする
  const progressPercent = Math.min(95, (elapsed / ESTIMATED_SECONDS) * 100);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
      {/* ---- 入力フォーム ---- */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <label className={labelClass} htmlFor="prompt">
            プロンプト <span className="text-violet-400">*</span>
          </label>
          <textarea
            id="prompt"
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="生成したい画像を英語で説明してください"
            className={`${inputClass} resize-y`}
            required
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="negative-prompt">
            ネガティブプロンプト
          </label>
          <input
            id="negative-prompt"
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            placeholder="描いてほしくない要素"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="style">
            スタイル
          </label>
          <select
            id="style"
            value={stylePreset}
            onChange={(e) => setStylePreset(e.target.value)}
            className={inputClass}
          >
            {STYLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} className="bg-purple-950">
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className={labelClass}>サイズ</span>
          <div className="flex flex-wrap gap-2">
            {SIZE_PRESETS.map((preset) => {
              const active =
                preset.width === size.width && preset.height === size.height;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setSize({ width: preset.width, height: preset.height })}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                    active
                      ? 'border-violet-400 bg-violet-500/20 text-violet-100'
                      : 'border-purple-400/30 text-purple-200/70 hover:border-purple-300 hover:text-white'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass} htmlFor="steps">
              ステップ数: {steps}
            </label>
            <input
              id="steps"
              type="range"
              min={1}
              max={50}
              value={steps}
              onChange={(e) => setSteps(Number(e.target.value))}
              className="w-full accent-violet-500"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="guidance">
              忠実度: {guidanceScale}
            </label>
            <input
              id="guidance"
              type="range"
              min={1}
              max={10}
              step={0.5}
              value={guidanceScale}
              onChange={(e) => setGuidanceScale(Number(e.target.value))}
              className="w-full accent-violet-500"
            />
          </div>
        </div>

        <div>
          <label className={labelClass} htmlFor="seed">
            シード値
          </label>
          <input
            id="seed"
            type="number"
            min={0}
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="空欄ならランダム"
            className={inputClass}
          />
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-2xl border-4 border-violet-600 bg-gradient-to-br from-[#A855F7] to-[#7C3AED] px-6 py-4 text-lg font-bold text-white shadow-lg shadow-violet-900/40 transition-all duration-300 hover:-translate-y-0.5 hover:border-violet-400 hover:shadow-[0_0_35px_-5px_rgba(168,85,247,0.8)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300 active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-purple-700 disabled:from-purple-800 disabled:to-purple-900 disabled:text-purple-300/60 disabled:shadow-none disabled:hover:translate-y-0"
        >
          {isGenerating ? '生成中…' : '✨ 生成する'}
        </button>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200"
          >
            {error}
          </p>
        )}
      </form>

      {/* ---- プレビュー ---- */}
      <div className="flex min-h-[24rem] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-purple-400/25 bg-black/20 p-6">
        {isGenerating ? (
          /* 進捗表示。Prodia は途中経過を返さないため経過時間ベースの目安 */
          <div className="w-full max-w-sm text-center" role="status" aria-live="polite">
            <div className="mb-4 text-5xl">🎬</div>
            <p className="mb-2 text-lg font-bold text-purple-100">画像を生成しています…</p>
            <p className="mb-4 text-sm text-purple-200/60">
              経過 {elapsed} 秒 / 目安 {ESTIMATED_SECONDS} 秒
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-purple-900/60">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-400 to-purple-400 transition-[width] duration-300 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="mt-4 text-xs text-purple-200/40">
              ページを閉じると生成が中断されます
            </p>
          </div>
        ) : result ? (
          <figure className="flex w-full flex-col items-center gap-4">
            {/* data URL のため next/image では最適化できない */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={result.imageUrl}
              alt={result.prompt}
              className="max-h-[65vh] w-auto rounded-2xl shadow-2xl shadow-black/50"
            />
            <figcaption className="w-full text-center">
              <a
                href={result.imageUrl}
                download={`gravure-${result.seed ?? Date.now()}.jpg`}
                className="inline-block rounded-xl border-2 border-purple-400/40 px-5 py-2.5 text-sm font-bold text-purple-100 transition hover:border-purple-300 hover:bg-purple-500/20 hover:text-white"
              >
                ⬇ ダウンロード
              </a>
              <p className="mt-3 text-xs text-purple-200/40">
                {result.jobType}
                {result.seed !== undefined && ` / seed: ${result.seed}`}
              </p>
            </figcaption>
          </figure>
        ) : (
          <p className="text-center text-sm text-purple-200/40">
            プロンプトを入力して「生成する」を押すと
            <br />
            ここに画像が表示されます
          </p>
        )}
      </div>
    </div>
  );
}
