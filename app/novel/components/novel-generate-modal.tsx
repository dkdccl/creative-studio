'use client';

import { useState } from 'react';

import { countChars } from '@/lib/novel-export';
import { NOVEL_LENGTH_PRESETS, type NovelLengthId } from '@/lib/novel-prompt';
import type { Character, NovelTheme } from '@/lib/types';
import { ModalShell } from './modal-shell';
import { Button, Chip, Field, TextArea } from './ui';

/**
 * Step 4 の「AI で本文を書く」モーダル。
 * 生成した文章はそのまま編集でき、確認してから本文に挿入する。
 */
export function NovelGenerateModal({
  open,
  theme,
  sceneTitle,
  sceneSummary,
  characters,
  currentBody,
  onInsert,
  onClose,
}: {
  open: boolean;
  theme: NovelTheme;
  sceneTitle: string;
  sceneSummary: string;
  characters: Character[];
  /** 選択中シーンの本文。続きから書くときの文脈に使う */
  currentBody: string;
  onInsert: (text: string) => void;
  onClose: () => void;
}) {
  const [length, setLength] = useState<NovelLengthId>('medium');
  const [continueFromBody, setContinueFromBody] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const hasBody = currentBody.trim().length > 0;
  const chars =
    NOVEL_LENGTH_PRESETS.find((p) => p.id === length)?.chars ?? 800;

  const close = () => {
    setDraft('');
    setError(null);
    onClose();
  };

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch('/api/novels/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme,
          sceneTitle,
          sceneSummary,
          characters,
          chars,
          previousBody: hasBody && continueFromBody ? currentBody : undefined,
        }),
      });
      const data = (await response.json()) as { text?: string; error?: string };
      if (!response.ok || !data.text) {
        setError(data.error ?? '本文を生成できませんでした。');
        return;
      }
      setDraft(data.text);
    } catch {
      setError('生成リクエストに失敗しました。通信状況を確認してください。');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <ModalShell
      open={open}
      title="AI で本文を書く"
      description="シーンのあらすじと登場人物をもとに本文を生成します。挿入前に編集できます。"
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            キャンセル
          </Button>
          <Button
            onClick={() => {
              onInsert(draft.trim());
              setDraft('');
            }}
            disabled={draft.trim().length === 0}
          >
            本文に挿入
          </Button>
        </>
      }
    >
      <div>
        <p className="mb-2 text-sm font-bold text-blue-50">長さの目安</p>
        <div className="flex flex-wrap gap-2">
          {NOVEL_LENGTH_PRESETS.map((preset) => (
            <Chip
              key={preset.id}
              active={length === preset.id}
              onClick={() => setLength(preset.id)}
            >
              {preset.label}（{preset.chars}字）
            </Chip>
          ))}
        </div>
      </div>

      {hasBody && (
        <label className="flex items-start gap-2.5 text-sm text-blue-100/80">
          <input
            type="checkbox"
            checked={continueFromBody}
            onChange={(e) => setContinueFromBody(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-blue-500"
          />
          <span>
            いま書かれている本文の続きとして書く
            <span className="ml-1 text-xs text-blue-200/50">
              （末尾を文脈として渡します）
            </span>
          </span>
        </label>
      )}

      <Button onClick={generate} disabled={generating} className="w-full">
        {generating ? '生成中…' : '本文を生成する'}
      </Button>

      {error && (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-200">
          {error}
        </p>
      )}

      {draft && (
        <Field
          label="生成結果"
          hint={`${countChars(draft).toLocaleString()} 字・そのまま編集できます`}
        >
          <TextArea
            rows={12}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </Field>
      )}
    </ModalShell>
  );
}
