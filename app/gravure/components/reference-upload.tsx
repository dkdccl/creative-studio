'use client';

import { useEffect, useRef, useState } from 'react';

import {
  ACCEPTED_UPLOAD_TYPES,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_PIXELS,
} from '@/lib/gravure';

import { ErrorNote, SecondaryButton } from './ui';

/**
 * Prodia の入力画像は 1920x1920 まで。
 * 大きい画像は弾かずに縮めてしまうほうが親切なので、canvas で縮小する。
 */
async function shrinkIfNeeded(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest <= MAX_UPLOAD_PIXELS) {
    bitmap.close();
    return file;
  }

  const scale = MAX_UPLOAD_PIXELS / longest;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('canvas の 2d コンテキストを取得できませんでした。');
  }
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.92),
  );
  if (!blob) throw new Error('画像を縮小できませんでした。');

  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
    type: 'image/jpeg',
  });
}

export function ReferenceUpload({
  value,
  onChange,
}: {
  value: File | null;
  onChange: (file: File | null) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // プレビュー用の object URL は差し替えのたびに捨てる
  useEffect(() => {
    if (!value) {
      setPreviewUrl(null);
      setSize(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);

    let cancelled = false;
    createImageBitmap(value)
      .then((bitmap) => {
        if (!cancelled) setSize({ width: bitmap.width, height: bitmap.height });
        bitmap.close();
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [value]);

  async function accept(file: File | undefined) {
    setError(null);
    if (!file) return;

    if (!ACCEPTED_UPLOAD_TYPES.includes(file.type as (typeof ACCEPTED_UPLOAD_TYPES)[number])) {
      setError('JPG または PNG を選んでください。');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`ファイルが大きすぎます（${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB まで）。`);
      return;
    }

    try {
      onChange(await shrinkIfNeeded(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : '画像を読み込めませんでした。');
    }
  }

  return (
    <div>
      <span className="mb-2 block text-sm font-bold text-violet-50">参考画像</span>

      {previewUrl ? (
        <div className="flex flex-wrap items-start gap-4 rounded-2xl border border-violet-400/25 bg-black/25 p-4">
          {/* object URL のため next/image では最適化できない */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="参考画像のプレビュー"
            className="h-40 w-auto rounded-xl object-contain"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-violet-50">{value?.name}</p>
            <p className="mt-1 text-xs text-violet-200/50">
              {size && `${size.width}×${size.height} / `}
              {value ? `${Math.round(value.size / 1024)} KB` : ''}
            </p>
            {size && Math.max(size.width, size.height) === MAX_UPLOAD_PIXELS && (
              <p className="mt-1 text-xs text-violet-200/40">
                Prodia の上限に合わせて {MAX_UPLOAD_PIXELS}px に縮小しました。
              </p>
            )}
            <SecondaryButton
              type="button"
              className="mt-3"
              onClick={() => {
                onChange(null);
                if (inputRef.current) inputRef.current.value = '';
              }}
            >
              画像を外す
            </SecondaryButton>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void accept(e.dataTransfer.files?.[0]);
          }}
          className={`rounded-2xl border-2 border-dashed p-8 text-center transition ${
            dragging
              ? 'border-violet-300 bg-violet-500/15'
              : 'border-violet-400/30 bg-black/20'
          }`}
        >
          <p className="text-3xl">🖼️</p>
          <p className="mt-2 text-sm font-bold text-violet-50">
            ここに画像をドラッグ＆ドロップ
          </p>
          <p className="mt-1 text-xs text-violet-200/50">
            JPG / PNG・{Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB まで。
            {MAX_UPLOAD_PIXELS}px を超える画像は自動で縮小します。
          </p>
          <SecondaryButton
            type="button"
            className="mt-4"
            onClick={() => inputRef.current?.click()}
          >
            ファイルを選ぶ
          </SecondaryButton>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_UPLOAD_TYPES.join(',')}
        onChange={(e) => void accept(e.target.files?.[0])}
        className="hidden"
      />

      {error && (
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
    </div>
  );
}
