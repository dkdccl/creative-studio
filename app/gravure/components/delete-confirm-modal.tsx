'use client';

import { useEffect, useRef } from 'react';

/**
 * グラビアモードの削除確認モーダル。
 *
 * app/novel/components/delete-confirm-modal.tsx と同じ役割だが、
 * 配色を紫でそろえてあるのと、戻せない操作なので警告文を必ず出す。
 * Esc と背景クリックでキャンセルでき、開いた瞬間はキャンセル側にフォーカスする。
 */
export function DeleteConfirmModal({
  open,
  title = 'この画像を削除してもよろしいですか？',
  description,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  description?: string;
  /** 削除中。二重に押させない */
  busy?: boolean;
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
      onClick={busy ? undefined : onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-violet-400/30 bg-slate-900 p-6 shadow-2xl"
      >
        <p className="text-base font-bold text-white">{title}</p>
        {description && (
          <p className="mt-2 text-sm text-violet-100/60">{description}</p>
        )}

        <p className="mt-4 rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          ⚠️ 削除したデータは復元できません。
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border-2 border-violet-400/40 px-5 py-2 text-sm font-bold text-violet-100 transition hover:border-violet-300 hover:bg-violet-500/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-xl border-2 border-red-600 bg-red-600 px-5 py-2 text-sm font-bold text-white transition-colors hover:border-red-500 hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? '削除中…' : '削除'}
          </button>
        </div>
      </div>
    </div>
  );
}
