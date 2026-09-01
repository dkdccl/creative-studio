'use client';

import { useState } from 'react';

import { PANELS_PER_PAGE, blockMarker } from '@/lib/scene-blocks';
import type { MangaSceneBlock } from '@/lib/types';
import { DeleteConfirmModal } from './delete-confirm-modal';

/**
 * 本文に挿入した漫画シーン 1 枚のカード。
 * 右上の「× 削除」は既定が薄い灰色、ホバーで赤くなり、押すと確認モーダルを出す。
 */
export function MangaSceneCard({
  block,
  onDelete,
}: {
  block: MangaSceneBlock;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <figure className="relative overflow-hidden rounded-2xl border border-red-400/25 bg-black/40">
      {/* 画像。DALL-E の一時 URL や貼り付けた URL を扱うため next/image は使わない */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={block.imageUrl}
        alt={block.story || `漫画シーン ${block.number}`}
        className="block max-h-96 w-full bg-black object-contain"
      />

      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`漫画シーン ${block.number} を削除`}
        className="absolute right-2 top-2 rounded-lg border border-white/20 bg-black/50 px-2.5 py-1 text-xs font-bold text-white/50 backdrop-blur-sm transition-colors hover:border-red-500 hover:bg-red-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
      >
        × 削除
      </button>

      <figcaption className="flex flex-wrap items-baseline gap-2 border-t border-white/10 px-4 py-3">
        <span className="rounded-full bg-red-500/20 px-2.5 py-0.5 text-[11px] font-bold text-red-200">
          {blockMarker('manga', block.number)}
        </span>
        <span className="text-[11px] text-blue-200/50">
          {block.pages}ページ・{block.pages * PANELS_PER_PAGE}コマ
          {block.mood && `・${block.mood}`}
        </span>
        {block.story && (
          <span className="min-w-0 flex-1 truncate text-xs text-blue-100/50">
            {block.story}
          </span>
        )}
      </figcaption>

      <DeleteConfirmModal
        open={confirming}
        title="この漫画シーンを削除しますか？"
        description={`本文の ${blockMarker('manga', block.number)} は残ります。`}
        onConfirm={() => {
          setConfirming(false);
          onDelete();
        }}
        onCancel={() => setConfirming(false)}
      />
    </figure>
  );
}
