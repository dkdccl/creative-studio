'use client';

import { useEffect, useRef } from 'react';

/**
 * 削除確認モーダル。
 * Esc と背景クリックでキャンセルでき、開いた瞬間はキャンセル側にフォーカスする。
 */
export function DeleteConfirmModal({
  open,
  title = 'この漫画シーンを削除しますか？',
  description,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  description?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    cancelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-white/15 bg-slate-900 p-6 shadow-2xl"
      >
        <p className="text-base font-bold text-white">{title}</p>
        {description && (
          <p className="mt-2 text-sm text-white/60">{description}</p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-xl border-2 border-white/20 bg-white/10 px-5 py-2 text-sm font-bold text-white/80 transition-colors hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl border-2 border-red-600 bg-red-600 px-5 py-2 text-sm font-bold text-white transition-colors hover:border-red-500 hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
          >
            削除
          </button>
        </div>
      </div>
    </div>
  );
}
