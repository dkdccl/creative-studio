'use client';

import { useState } from 'react';

import { MANGA_MOODS, buildMangaGenerationPrompt } from '@/lib/scene-blocks';
import { PageCountPicker } from '@/app/novel/components/page-count-picker';
import { Chip, Field, TextArea } from '@/app/novel/components/ui';

/**
 * 漫画モードの生成カード。
 * ページ数（プリセット + 手動入力）と雰囲気を選んで DALL-E を呼ぶ。
 * コマ割りは 1ページ 6コマ（3x2）固定。
 */
export function GeneratorCard() {
  const [story, setStory] = useState('');
  const [pages, setPages] = useState(1);
  const [pagesValid, setPagesValid] = useState(true);
  const [mood, setMood] = useState<string>(MANGA_MOODS[0]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; prompt: string } | null>(
    null,
  );

  const prompt = buildMangaGenerationPrompt({
    story: story.trim() || '（ストーリー未入力）',
    pages,
    mood,
  });

  const canGenerate = pagesValid && story.trim().length > 0 && !generating;

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch('/api/manga/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story, pages, mood }),
      });
      const data = (await response.json()) as {
        url?: string;
        prompt?: string;
        error?: string;
      };
      if (!response.ok || !data.url) {
        setError(data.error ?? '画像を生成できませんでした。');
        return;
      }
      setResult({ url: data.url, prompt: data.prompt ?? prompt });
    } catch {
      setError('生成リクエストに失敗しました。通信状況を確認してください。');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="w-full max-w-2xl space-y-6 rounded-2xl border border-red-400/25 bg-black/30 p-6 text-left sm:p-8">
      <PageCountPicker
        value={pages}
        onChange={setPages}
        onValidChange={setPagesValid}
        accent="red"
      />

      <div>
        <p className="mb-2 text-sm font-bold text-red-50">漫画の雰囲気</p>
        <div className="flex flex-wrap gap-2">
          {MANGA_MOODS.map((option) => (
            <Chip
              key={option}
              active={mood === option}
              onClick={() => setMood(option)}
            >
              {option}
            </Chip>
          ))}
        </div>
      </div>

      <Field label="ストーリー" hint="DALL-E に渡す内容">
        <TextArea
          rows={4}
          value={story}
          onChange={(e) => setStory(e.target.value)}
          placeholder="例：閉館後の図書館で、少女が読めない本と出会う"
        />
      </Field>

      <div>
        <p className="mb-1.5 text-xs font-bold text-white/50">送信プロンプト</p>
        <p className="break-words rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-xs text-white/60">
          {prompt}
        </p>
      </div>

      <button
        type="button"
        onClick={generate}
        disabled={!canGenerate}
        className="w-full rounded-xl border-2 border-red-600 bg-gradient-to-br from-[#EF4444] to-[#DC2626] px-6 py-3.5 text-base font-bold text-white transition-all hover:border-red-400 hover:from-red-400 hover:to-red-500 hover:shadow-[0_0_30px_-8px_rgba(239,68,68,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {generating ? '生成中…' : '漫画を生成する'}
      </button>

      {error && (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-200">
          {error}
        </p>
      )}

      {result && (
        <div>
          <p className="mb-2 text-sm font-bold text-red-50">生成結果</p>
          {/* DALL-E の一時 URL を扱うため next/image は使わない */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={result.url}
            alt={result.prompt}
            className="w-full rounded-xl border border-white/10 bg-black object-contain"
          />
          <p className="mt-2 break-words text-[11px] text-white/40">
            {result.prompt}
          </p>
        </div>
      )}
    </div>
  );
}
