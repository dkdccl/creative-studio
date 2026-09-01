'use client';

import { useState } from 'react';

import { MANGA_MOODS, buildMangaGenerationPrompt } from '@/lib/scene-blocks';
import { ModalShell } from './modal-shell';
import { PageCountPicker } from './page-count-picker';
import { Button, Chip, Field, TextArea, TextInput } from './ui';

export interface MangaSceneDraft {
  imageUrl: string;
  story: string;
  pages: number;
  mood: string;
}

/**
 * 漫画シーンの挿入モーダル。
 * ページ数（1〜4）と雰囲気を選んで DALL-E で生成するか、
 * 手元にある画像の URL を直接指定する。
 */
export function MangaSceneInsertModal({
  open,
  markerPreview,
  onInsert,
  onClose,
}: {
  open: boolean;
  /** 挿入されるマーカーの見本 */
  markerPreview: string;
  onInsert: (draft: MangaSceneDraft) => void;
  onClose: () => void;
}) {
  const [story, setStory] = useState('');
  const [pages, setPages] = useState(1);
  const [mood, setMood] = useState<string>(MANGA_MOODS[0]);
  const [imageUrl, setImageUrl] = useState('');
  const [generating, setGenerating] = useState(false);
  const [pagesValid, setPagesValid] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const prompt = buildMangaGenerationPrompt({
    story: story.trim() || '（ストーリー未入力）',
    pages,
    mood,
  });

  const reset = () => {
    setStory('');
    setPages(1);
    setMood(MANGA_MOODS[0]);
    setImageUrl('');
    setGenerating(false);
    setPagesValid(true);
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const generate = async () => {
    if (!story.trim()) {
      setError('ストーリーを入力してください。');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch('/api/manga/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story, pages, mood }),
      });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        setError(data.error ?? '画像を生成できませんでした。');
        return;
      }
      setImageUrl(data.url);
    } catch {
      setError('生成リクエストに失敗しました。通信状況を確認してください。');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <ModalShell
      open={open}
      title="🎨 漫画シーンを挿入"
      description={`カーソル位置に ${markerPreview} を差し込みます。`}
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            キャンセル
          </Button>
          <Button
            onClick={() => {
              onInsert({
                imageUrl: imageUrl.trim(),
                story: story.trim(),
                pages,
                mood,
              });
              reset();
            }}
            disabled={!imageUrl.trim() || !pagesValid}
          >
            挿入
          </Button>
        </>
      }
    >
      <PageCountPicker
        value={pages}
        onChange={setPages}
        onValidChange={setPagesValid}
        accent="red"
      />

      <div>
        <p className="mb-2 text-sm font-bold text-blue-50">漫画の雰囲気</p>
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
          rows={3}
          value={story}
          onChange={(e) => setStory(e.target.value)}
          placeholder="例：閉館後の図書館で、少女が読めない本と出会う"
        />
      </Field>

      <div>
        <p className="mb-1.5 text-xs font-bold text-white/50">送信プロンプト</p>
        <p className="break-words rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-xs text-white/60">
          {prompt}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={generate}
          disabled={generating || !pagesValid || !story.trim()}
        >
          {generating ? '生成中…' : '漫画を生成する'}
        </Button>
        <span className="text-xs text-white/40">OPENAI_API_KEY が必要です</span>
      </div>

      <Field label="画像 URL" hint="生成せずに手元の画像を指定することもできます">
        <TextInput
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://…"
        />
      </Field>

      {error && (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-xs text-red-200">
          {error}
        </p>
      )}

      {imageUrl.trim() && (
        <div>
          <p className="mb-2 text-sm font-bold text-blue-50">プレビュー</p>
          {/* 任意の URL を扱うため next/image は使わない */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="生成した漫画シーンのプレビュー"
            className="max-h-64 w-full rounded-xl border border-white/10 bg-black object-contain"
            onError={() => setError('この URL の画像を読み込めませんでした。')}
          />
        </div>
      )}
    </ModalShell>
  );
}
