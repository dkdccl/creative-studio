'use client';

import {
  CHECKLIST_ITEMS,
  MAX_KEYWORDS,
  REQUIRED_DISCLAIMERS,
  parseKeywords,
  withDisclaimers,
  type ChecklistId,
  type GravureMetadata,
} from '@/lib/gravure';

import { Card, Field, PrimaryButton, StepShell, TextArea, TextInput } from './ui';

export function StepMetadata({
  metadata,
  onChange,
  checked,
  onToggle,
  onNext,
}: {
  metadata: GravureMetadata;
  onChange: (next: GravureMetadata) => void;
  checked: ChecklistId[];
  onToggle: (id: ChecklistId) => void;
  onNext: () => void;
}) {
  const set = <K extends keyof GravureMetadata>(key: K, value: GravureMetadata[K]) =>
    onChange({ ...metadata, [key]: value });

  const keywords = parseKeywords(metadata.keywords);
  const tooManyKeywords = keywords.length > MAX_KEYWORDS;
  const allChecked = CHECKLIST_ITEMS.every((item) => checked.includes(item.id));
  const canProceed = metadata.title.trim() !== '' && allChecked;

  return (
    <StepShell
      step={3}
      title="Amazon メタデータ"
      description="KDP 登録用の情報を入力します。ここで入れた内容が JSON に書き出されます。"
    >
      <Field label="📖 本のタイトル">
        <TextInput
          value={metadata.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="例：セクシーグラビア Vol.1"
        />
      </Field>

      <Field label="✍️ 説明文（日本語）" hint="末尾に免責事項が自動で付きます">
        <TextArea
          rows={5}
          value={metadata.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="作品の紹介文を入力してください"
        />
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="👤 著者名">
          <TextInput
            value={metadata.author}
            onChange={(e) => set('author', e.target.value)}
            placeholder="ペンネーム"
          />
        </Field>

        <Field
          label="🏷️ タグ / キーワード"
          hint={`カンマ区切り・${MAX_KEYWORDS} 個まで（現在 ${keywords.length}）`}
        >
          <TextInput
            value={metadata.keywords}
            onChange={(e) => set('keywords', e.target.value)}
            placeholder="グラビア, 写真集, AI"
          />
        </Field>

        <Field label="📅 販売予定日">
          <TextInput
            type="date"
            value={metadata.publishDate}
            onChange={(e) => set('publishDate', e.target.value)}
          />
        </Field>

        <Field label="💰 価格（円）">
          <TextInput
            type="number"
            min={0}
            step={10}
            value={metadata.price}
            onChange={(e) => set('price', Number(e.target.value))}
          />
        </Field>
      </div>

      {tooManyKeywords && (
        <p className="text-xs text-amber-300">
          KDP のキーワード欄は {MAX_KEYWORDS} 個までです。書き出し時は先頭{' '}
          {MAX_KEYWORDS} 個だけが使われます。
        </p>
      )}

      {/* 必須免責事項 */}
      <Card className="border-violet-400/40 bg-violet-950/40">
        <h3 className="text-sm font-bold text-white">必須免責事項</h3>
        <p className="mt-1 text-xs text-violet-200/50">
          説明文の末尾と ZIP 内の DISCLAIMER.txt に、常に全文が入ります。編集はできません。
        </p>
        <ul className="mt-3 space-y-1.5">
          {REQUIRED_DISCLAIMERS.map((line) => (
            <li key={line} className="flex gap-2 text-sm text-violet-50">
              <span aria-hidden className="text-violet-400">
                ・
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* チェックリスト */}
      <fieldset>
        <legend className="mb-3 text-sm font-bold text-violet-50">
          出品前チェックリスト
        </legend>
        <ul className="space-y-2">
          {CHECKLIST_ITEMS.map((item) => (
            <li key={item.id}>
              <label className="flex cursor-pointer gap-3 rounded-xl border border-violet-400/20 bg-black/25 px-4 py-3 transition hover:border-violet-400/50">
                <input
                  type="checkbox"
                  checked={checked.includes(item.id)}
                  onChange={() => onToggle(item.id)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-violet-500"
                />
                <span>
                  <span className="block text-sm font-bold text-violet-50">
                    {item.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-violet-200/50">
                    {item.detail}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      {/* 実際に書き出される説明文 */}
      {metadata.description.trim() !== '' && (
        <details className="rounded-xl border border-violet-400/20 bg-black/25 px-4 py-3">
          <summary className="cursor-pointer text-sm font-bold text-violet-100">
            書き出される説明文を確認
          </summary>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-violet-100/70">
            {withDisclaimers(metadata.description)}
          </pre>
        </details>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-violet-200/50">
          {canProceed
            ? 'エクスポートに進めます。'
            : 'タイトルの入力と、チェックリスト 3 項目すべての確認が必要です。'}
        </p>
        <PrimaryButton type="button" onClick={onNext} disabled={!canProceed}>
          エクスポートへ →
        </PrimaryButton>
      </div>
    </StepShell>
  );
}
