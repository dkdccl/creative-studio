'use client';

import { useRef, useState } from 'react';

import { dataUrlBytes, fileToResizedDataUrl, formatBytes } from '@/lib/image';
import { panelsForPages } from '@/lib/scene-blocks';
import { ModalShell } from './modal-shell';
import { PageCountPicker } from './page-count-picker';
import { PhotoPages } from './photo-scene-card';
import { Button, Field, TextInput } from './ui';

export interface PhotoSceneDraft {
  pages: number;
  photos: string[];
  caption: string;
}

/**
 * 写真シーンの挿入モーダル。
 * ページ数（1〜4）を選び、1ページ 6コマぶんの写真をアップロードする。
 */
export function PhotoSceneInsertModal({
  open,
  markerPreview,
  onInsert,
  onClose,
}: {
  open: boolean;
  markerPreview: string;
  onInsert: (draft: PhotoSceneDraft) => void;
  onClose: () => void;
}) {
  const [pages, setPages] = useState(1);
  const [photos, setPhotos] = useState<(string | null)[]>(
    Array.from({ length: panelsForPages(1) }, () => null),
  );
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pagesValid, setPagesValid] = useState(true);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const required = panelsForPages(pages);
  const filled = photos.filter((p): p is string => Boolean(p));
  const complete = filled.length === required && pagesValid;
  const totalBytes = filled.reduce((sum, p) => sum + dataUrlBytes(p), 0);

  const reset = () => {
    setPages(1);
    setPhotos(Array.from({ length: panelsForPages(1) }, () => null));
    setCaption('');
    setError(null);
    setPagesValid(true);
    setLoading(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const changePages = (next: number) => {
    setPages(next);
    // ページ数を変えてもすでに選んだ写真は先頭から残す
    setPhotos((current) =>
      Array.from({ length: panelsForPages(next) }, (_, i) => current[i] ?? null),
    );
    setError(null);
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const next = [...photos];
      for (const file of Array.from(fileList)) {
        const slot = next.findIndex((p) => p === null);
        if (slot === -1) break;
        next[slot] = await fileToResizedDataUrl(file);
      }
      setPhotos(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : '写真を読み込めませんでした。');
    } finally {
      setLoading(false);
      // 同じファイルを選び直せるように input をクリアする
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const clearSlot = (index: number) => {
    setPhotos((current) => current.map((p, i) => (i === index ? null : p)));
  };

  return (
    <ModalShell
      open={open}
      title="📸 写真シーンを挿入"
      description={`カーソル位置に ${markerPreview} を差し込みます。`}
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            キャンセル
          </Button>
          <Button
            onClick={() => {
              onInsert({ pages, photos: filled, caption: caption.trim() });
              reset();
            }}
            disabled={!complete}
          >
            挿入
          </Button>
        </>
      }
    >
      <PageCountPicker
        value={pages}
        onChange={changePages}
        onValidChange={setPagesValid}
      />

      {/* 必要枚数の案内 */}
      <p
        className={`rounded-xl border px-4 py-2.5 text-sm font-bold ${
          complete
            ? 'border-blue-400/40 bg-blue-500/10 text-blue-100'
            : 'border-amber-400/40 bg-amber-400/10 text-amber-100'
        }`}
      >
        {pages}ページ分の写真が必要です（計{required}枚）
        <span className="ml-2 text-xs font-normal opacity-80">
          現在 {filled.length} / {required} 枚
          {totalBytes > 0 && ` ・ 約 ${formatBytes(totalBytes)}`}
        </span>
      </p>

      {/* アップロード */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          className="block w-full text-xs text-white/60 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-xs file:font-bold file:text-white hover:file:bg-blue-500"
        />
        <p className="mt-1.5 text-[11px] text-white/40">
          選んだ順に空いているコマへ入ります。長辺 900px の JPEG に縮小して保存します。
        </p>
      </div>

      {error && (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-xs text-red-200">
          {error}
        </p>
      )}

      {/* プレビュー */}
      <div>
        <p className="mb-2 text-sm font-bold text-blue-50">
          プレビュー
          {loading && (
            <span className="ml-2 text-xs font-normal text-white/50">
              読み込み中…
            </span>
          )}
        </p>
        <div className="overflow-hidden rounded-xl border border-white/10">
          <PhotoPages photos={photos} pages={pages} />
        </div>
        {filled.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {photos.map((photo, index) =>
              photo ? (
                <button
                  key={index}
                  type="button"
                  onClick={() => clearSlot(index)}
                  className="rounded-full border border-white/20 px-3 py-1 text-[11px] text-white/60 transition-colors hover:border-red-500 hover:bg-red-600 hover:text-white"
                >
                  × コマ {index + 1} を外す
                </button>
              ) : null,
            )}
          </div>
        )}
      </div>

      <Field label="キャプション" hint="任意">
        <TextInput
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="例：閉館後の書架を歩く回想シーン"
          maxLength={80}
        />
      </Field>
    </ModalShell>
  );
}
