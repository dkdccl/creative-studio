'use client';

import { useState } from 'react';

import {
  PANELS_PER_PAGE,
  PANEL_GRID_CLASS,
  blockMarker,
} from '@/lib/scene-blocks';
import type { PhotoSceneBlock } from '@/lib/types';
import { DeleteConfirmModal } from './delete-confirm-modal';

/**
 * 本文に挿入した写真シーンのカード。
 * 1 ページ 6 コマ（3x2）固定で、ページ数のぶんだけ縦に積む。
 * コマの間は白い罫線（gap）で区切る。
 */
export function PhotoSceneCard({
  block,
  onDelete,
}: {
  block: PhotoSceneBlock;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <figure className="relative overflow-hidden rounded-2xl border border-blue-400/25 bg-black/40">
      <PhotoPages photos={block.photos} pages={block.pages} />

      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`写真シーン ${block.number} を削除`}
        className="absolute right-2 top-2 rounded-lg border border-white/20 bg-black/50 px-2.5 py-1 text-xs font-bold text-white/50 backdrop-blur-sm transition-colors hover:border-red-500 hover:bg-red-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
      >
        × 削除
      </button>

      <figcaption className="flex flex-wrap items-baseline gap-2 border-t border-white/10 px-4 py-3">
        <span className="rounded-full bg-blue-500/20 px-2.5 py-0.5 text-[11px] font-bold text-blue-200">
          {blockMarker('photo', block.number)}
        </span>
        <span className="text-[11px] text-blue-200/50">
          {block.pages}ページ・{block.pages * PANELS_PER_PAGE}コマ
        </span>
        {block.caption && (
          <span className="min-w-0 flex-1 truncate text-xs text-blue-100/50">
            {block.caption}
          </span>
        )}
      </figcaption>

      <DeleteConfirmModal
        open={confirming}
        title="この写真シーンを削除しますか？"
        description={`本文の ${blockMarker('photo', block.number)} は残ります。`}
        onConfirm={() => {
          setConfirming(false);
          onDelete();
        }}
        onCancel={() => setConfirming(false)}
      />
    </figure>
  );
}

/** 1ページ 6コマ（3x2）でページ数ぶん並べる。挿入モーダルのプレビューでも使う */
export function PhotoPages({
  photos,
  pages,
}: {
  photos: (string | null)[];
  pages: number;
}) {
  return (
    <div className="space-y-3 bg-white p-1.5">
      {Array.from({ length: pages }, (_, page) => (
        <div key={page} className={`grid ${PANEL_GRID_CLASS} gap-1.5`}>
          {Array.from({ length: PANELS_PER_PAGE }, (_, panel) => {
            const index = page * PANELS_PER_PAGE + panel;
            const src = photos[index] ?? null;
            return (
              <div
                key={panel}
                className="relative aspect-[4/3] overflow-hidden bg-neutral-900"
              >
                {src ? (
                  // data URL を扱うため next/image は使わない
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={src}
                    alt={`${page + 1}ページ目 コマ ${panel + 1}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[10px] text-white/30">
                    {index + 1}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
