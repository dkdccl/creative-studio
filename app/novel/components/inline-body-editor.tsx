'use client';

import { useEffect, useRef, type ChangeEvent } from 'react';

import {
  BLOCK_NAMES,
  blockMarker,
  parseBodyParts,
  replaceTextPart,
} from '@/lib/scene-blocks';
import type { Scene } from '@/lib/types';
import { MangaSceneCard } from './manga-scene-card';
import { PhotoSceneCard } from './photo-scene-card';

/**
 * 本文エディタ。
 * マーカーの位置でテキストを区切り、その場に漫画／写真シーンのカードを挟んで表示する。
 * 見た目は 1 つのエディタだが、実体はテキスト区間ごとの textarea。
 */
export function InlineBodyEditor({
  scene,
  onChangeBody,
  onDeleteBlock,
  onCursorChange,
}: {
  scene: Scene;
  onChangeBody: (body: string) => void;
  onDeleteBlock: (blockId: string) => void;
  /** 本文全体から見たカーソル位置 */
  onCursorChange: (position: number) => void;
}) {
  const parts = parseBodyParts(scene.body);

  /**
   * マーカーの前後には改行を 1 つ置いている。
   * 入力欄では余分な空行に見えるので、表示時だけ 1 つ落として書き戻し時に足す。
   */
  const toDisplay = (value: string, isFirst: boolean, isLast: boolean) => {
    let text = value;
    if (!isFirst && text.startsWith('\n')) text = text.slice(1);
    if (!isLast && text.endsWith('\n')) text = text.slice(0, -1);
    return text;
  };

  const toStored = (text: string, isFirst: boolean, isLast: boolean) =>
    `${isFirst ? '' : '\n'}${text}${isLast ? '' : '\n'}`;

  return (
    <div className="min-h-[20rem] rounded-xl border border-blue-400/25 bg-blue-950/40 p-3 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-500/40">
      {parts.map((part, index) => {
        if (part.type === 'text') {
          const isFirst = index === 0;
          const isLast = index === parts.length - 1;
          const display = toDisplay(part.value, isFirst, isLast);

          const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
            const next = toStored(event.target.value, isFirst, isLast);
            onCursorChange(part.start + (isFirst ? 0 : 1) + event.target.selectionStart);
            onChangeBody(replaceTextPart(scene.body, part, next));
          };

          return (
            <AutoTextArea
              key={`text-${part.start}`}
              value={display}
              onChange={handleChange}
              onCursor={(offset) =>
                onCursorChange(part.start + (isFirst ? 0 : 1) + offset)
              }
              placeholder={
                parts.length === 1 ? 'ここに本文を書きます。' : undefined
              }
              minRows={parts.length === 1 ? 12 : 1}
            />
          );
        }

        const block = scene.blocks.find(
          (b) => b.kind === part.kind && b.number === part.number,
        );

        // 画像を消してもマーカーは残す仕様なので、対応が無い場合は印だけ出す
        if (!block) {
          return (
            <p
              key={`orphan-${part.start}`}
              className="my-2 rounded-xl border border-dashed border-amber-400/40 bg-amber-400/5 px-4 py-2 text-xs text-amber-100/70"
            >
              {blockMarker(part.kind, part.number)}
              <span className="ml-2 opacity-70">
                （{BLOCK_NAMES[part.kind]}の画像は削除済み）
              </span>
            </p>
          );
        }

        return (
          <div key={block.id} className="my-3 max-w-md">
            {block.kind === 'manga' ? (
              <MangaSceneCard
                block={block}
                onDelete={() => onDeleteBlock(block.id)}
              />
            ) : (
              <PhotoSceneCard
                block={block}
                onDelete={() => onDeleteBlock(block.id)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 中身の高さに合わせて伸びる textarea */
function AutoTextArea({
  value,
  onChange,
  onCursor,
  placeholder,
  minRows,
}: {
  value: string;
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onCursor: (offset: number) => void;
  placeholder?: string;
  minRows: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      onSelect={(e) => onCursor(e.currentTarget.selectionStart)}
      placeholder={placeholder}
      rows={minRows}
      className="block w-full resize-none bg-transparent px-1 font-serif text-base leading-8 text-white placeholder:text-blue-200/30 focus:outline-none"
    />
  );
}
