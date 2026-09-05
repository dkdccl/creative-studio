'use client';

import { useEffect, useRef, useState } from 'react';

import {
  ACCEPTED_UPLOAD_TYPES,
  MAX_REFERENCES,
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

/** サムネイル 1 枚ぶん。object URL の後始末をここで完結させる */
function Thumb({
  file,
  position,
  onRemove,
  onMove,
  canMoveUp,
  canMoveDown,
}: {
  file: File;
  position: number;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <li className="overflow-hidden rounded-xl border border-violet-400/25 bg-black/25">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-bold text-violet-100">参考画像 {position}</span>
        <span className="truncate pl-2 text-[11px] text-violet-200/40">
          {Math.round(file.size / 1024)} KB
        </span>
      </div>
      {url && (
        // object URL のため next/image では最適化できない
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`参考画像 ${position}`}
          className="max-h-40 w-full bg-black/40 object-contain"
        />
      )}
      <div className="flex flex-wrap gap-1.5 px-3 py-2">
        <SecondaryButton
          type="button"
          className="px-2 py-1 text-xs"
          onClick={onRemove}
        >
          ✕ 削除
        </SecondaryButton>
        <SecondaryButton
          type="button"
          className="px-2 py-1 text-xs"
          onClick={() => onMove(-1)}
          disabled={!canMoveUp}
          aria-label={`参考画像 ${position} を前へ`}
        >
          ↑
        </SecondaryButton>
        <SecondaryButton
          type="button"
          className="px-2 py-1 text-xs"
          onClick={() => onMove(1)}
          disabled={!canMoveDown}
          aria-label={`参考画像 ${position} を後ろへ`}
        >
          ↓
        </SecondaryButton>
      </div>
    </li>
  );
}

export function ReferenceUpload({
  value,
  onChange,
}: {
  value: File[];
  onChange: (files: File[]) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function accept(incoming: FileList | null) {
    setError(null);
    const files = Array.from(incoming ?? []);
    if (files.length === 0) return;

    const room = MAX_REFERENCES - value.length;
    if (room <= 0) {
      setError(`参考画像は ${MAX_REFERENCES} 枚までです。`);
      return;
    }

    const problems: string[] = [];
    const accepted: File[] = [];

    for (const file of files.slice(0, room)) {
      if (
        !ACCEPTED_UPLOAD_TYPES.includes(file.type as (typeof ACCEPTED_UPLOAD_TYPES)[number])
      ) {
        problems.push(`${file.name}: JPG / PNG ではありません`);
        continue;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        problems.push(`${file.name}: サイズが大きすぎます`);
        continue;
      }
      try {
        accepted.push(await shrinkIfNeeded(file));
      } catch {
        problems.push(`${file.name}: 読み込めませんでした`);
      }
    }

    if (files.length > room) {
      problems.push(`${MAX_REFERENCES} 枚を超えるぶんは取り込みませんでした`);
    }
    if (problems.length > 0) setError(problems.join(' / '));
    if (accepted.length > 0) onChange([...value, ...accepted]);

    // 同じファイルを選び直せるように input を空にしておく
    if (inputRef.current) inputRef.current.value = '';
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...value];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div>
      <span className="mb-2 block text-sm font-bold text-violet-50">
        参考画像（{value.length} / {MAX_REFERENCES} 枚）
      </span>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void accept(e.dataTransfer.files);
        }}
        className={`rounded-2xl border-2 border-dashed p-6 text-center transition ${
          dragging ? 'border-violet-300 bg-violet-500/15' : 'border-violet-400/30 bg-black/20'
        }`}
      >
        <p className="text-3xl">🖼️</p>
        <p className="mt-2 text-sm font-bold text-violet-50">
          ここに画像をドラッグ＆ドロップ（複数可）
        </p>
        <p className="mt-1 text-xs text-violet-200/50">
          JPG / PNG・1 枚 {Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB まで。
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

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_UPLOAD_TYPES.join(',')}
        multiple
        onChange={(e) => void accept(e.target.files)}
        className="hidden"
      />

      {error && (
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      {value.length > 0 && (
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {value.map((file, i) => (
            <Thumb
              key={`${file.name}-${file.size}-${i}`}
              file={file}
              position={i + 1}
              canMoveUp={i > 0}
              canMoveDown={i < value.length - 1}
              onMove={(direction) => move(i, direction)}
              onRemove={() => onChange(value.filter((_, index) => index !== i))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
