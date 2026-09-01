'use client';

import { useEffect, type ReactNode } from 'react';

/** 挿入モーダル共通の外枠。Esc と背景クリックで閉じる */
export function ModalShell({
  open,
  title,
  description,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className="my-auto w-full max-w-lg rounded-2xl border border-white/15 bg-slate-900 shadow-2xl"
      >
        <header className="border-b border-white/10 px-6 py-4">
          <h2 className="text-base font-bold text-white">{title}</h2>
          {description && (
            <p className="mt-1 text-xs text-white/50">{description}</p>
          )}
        </header>

        <div className="space-y-5 px-6 py-5">{children}</div>

        <footer className="flex flex-wrap justify-end gap-3 border-t border-white/10 px-6 py-4">
          {footer}
        </footer>
      </div>
    </div>
  );
}
