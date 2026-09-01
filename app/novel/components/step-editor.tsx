'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { countChars } from '@/lib/novel-export';
import { createId } from '@/lib/novel-storage';
import {
  blockMarker,
  insertMarkerAt,
  nextMarkerNumber,
} from '@/lib/scene-blocks';
import {
  ACTS,
  TARGET_LENGTH_CHARS,
  sortScenesByAct,
  type Character,
  type NovelTheme,
  type Scene,
  type SceneBlock,
  type SceneBlockKind,
} from '@/lib/types';
import type { EpisodeRecord } from '@/lib/series';
import { InlineBodyEditor } from './inline-body-editor';
import { PreviousEpisodePanel } from './previous-episode-panel';
import {
  MangaSceneInsertModal,
  type MangaSceneDraft,
} from './manga-scene-insert-modal';
import {
  PhotoSceneInsertModal,
  type PhotoSceneDraft,
} from './photo-scene-insert-modal';
import { useUndoRedo } from './use-undo-redo';
import { Button, EmptyState, StepShell } from './ui';

/** 続けて打っている間は履歴を 1 つにまとめる時間（ミリ秒） */
const TYPING_COALESCE_MS = 800;

export function StepEditor({
  scenes,
  characters,
  theme,
  onChange,
  onBackToPlot,
  previousEpisode,
}: {
  scenes: Scene[];
  characters: Character[];
  theme: NovelTheme;
  onChange: (scenes: Scene[]) => void;
  onBackToPlot: () => void;
  /** 連載中なら 1 つ前の話 */
  previousEpisode: EpisodeRecord | null;
}) {
  const ordered = useMemo(() => sortScenesByAct(scenes), [scenes]);
  const [selectedId, setSelectedId] = useState<string | null>(
    ordered[0]?.id ?? null,
  );
  const [insertKind, setInsertKind] = useState<SceneBlockKind | null>(null);

  // マーカーを差し込む位置。本文全体から見たカーソル位置を覚えておく
  const cursorRef = useRef(ordered[0]?.body.length ?? 0);

  const { commit, undo, redo, reset, canUndo, canRedo } = useUndoRedo(
    scenes,
    onChange,
  );

  // シーンが削除された／まだ選んでいない場合は先頭に寄せる
  useEffect(() => {
    if (ordered.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((current) =>
      current && ordered.some((s) => s.id === current) ? current : ordered[0].id,
    );
  }, [ordered]);

  // 編集対象が変わったら Undo 履歴は引き継がない
  useEffect(() => {
    reset();
  }, [selectedId, reset]);

  const selected = ordered.find((s) => s.id === selectedId) ?? null;

  const totalChars = useMemo(
    () => ordered.reduce((sum, scene) => sum + countChars(scene.body), 0),
    [ordered],
  );
  const target = TARGET_LENGTH_CHARS[theme.targetLength];
  const progress = Math.min(100, Math.round((totalChars / target) * 100));

  const selectScene = (id: string) => {
    const scene = ordered.find((s) => s.id === id);
    cursorRef.current = scene?.body.length ?? 0;
    setSelectedId(id);
  };

  /** 選択中のシーンだけを書き換える */
  const patchSelected = (patch: Partial<Scene>, coalesceMs = 0) => {
    if (!selected) return;
    commit(
      scenes.map((s) => (s.id === selected.id ? { ...s, ...patch } : s)),
      coalesceMs,
    );
  };

  /** カーソル位置にマーカーを差し込み、ブロックを配列へ追加する */
  const insertBlock = (
    kind: SceneBlockKind,
    build: (number: number) => SceneBlock,
  ) => {
    if (!selected) return;
    const number = nextMarkerNumber(selected, kind);
    patchSelected({
      body: insertMarkerAt(
        selected.body,
        cursorRef.current,
        blockMarker(kind, number),
      ),
      blocks: [...selected.blocks, build(number)],
    });
    setInsertKind(null);
  };

  const insertManga = (draft: MangaSceneDraft) =>
    insertBlock('manga', (number) => ({
      kind: 'manga',
      id: createId('manga'),
      number,
      imageUrl: draft.imageUrl,
      story: draft.story,
      pages: draft.pages,
      mood: draft.mood,
    }));

  const insertPhoto = (draft: PhotoSceneDraft) =>
    insertBlock('photo', (number) => ({
      kind: 'photo',
      id: createId('photo'),
      number,
      pages: draft.pages,
      photos: draft.photos,
      caption: draft.caption,
    }));

  /** 該当 ID のブロックだけ配列から外す。本文のマーカーはそのまま残す */
  const deleteBlock = (blockId: string) => {
    if (!selected) return;
    patchSelected({ blocks: selected.blocks.filter((b) => b.id !== blockId) });
  };

  const handleShortcut = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) {
      event.preventDefault();
      undo();
    } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
      event.preventDefault();
      redo();
    }
  };

  if (ordered.length === 0) {
    return (
      <StepShell
        step={4}
        title="執筆エディタ"
        description="プロットで作ったシーンを 1 つずつ書いていきます。"
      >
        <EmptyState
          icon="🗺️"
          message="シーンがまだありません。Step 3 でプロットを組み立ててから戻ってきてください。"
        />
        <Button onClick={onBackToPlot}>Step 3 プロット構成へ</Button>
      </StepShell>
    );
  }

  return (
    <StepShell
      step={4}
      title="執筆エディタ"
      description="左のシーンを選んで本文を書きます。入力内容はこのブラウザに自動保存されます。"
    >
      {previousEpisode && <PreviousEpisodePanel episode={previousEpisode} />}

      {/* 全体進捗 */}
      <div className="rounded-2xl border border-blue-400/20 bg-blue-950/30 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="font-bold text-white">
            総文字数 {totalChars.toLocaleString()} 字
          </span>
          <span className="text-blue-100/60">
            原稿用紙 約 {Math.ceil(totalChars / 400)} 枚 ／ 目標{' '}
            {target.toLocaleString()} 字（{progress}%）
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-blue-950">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#3B82F6] to-[#1D4ED8] transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* シーン一覧 */}
        <aside className="max-h-[28rem] overflow-y-auto rounded-2xl border border-blue-400/20 bg-blue-950/20 p-2 lg:max-h-[36rem]">
          {ACTS.map((act) => {
            const actScenes = ordered.filter((s) => s.act === act.id);
            if (actScenes.length === 0) return null;
            return (
              <div key={act.id} className="mb-2">
                <p className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-blue-300/60">
                  {act.label}
                </p>
                <ul className="space-y-1">
                  {actScenes.map((scene, index) => {
                    const chars = countChars(scene.body);
                    return (
                      <li key={scene.id}>
                        <button
                          type="button"
                          onClick={() => selectScene(scene.id)}
                          className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
                            scene.id === selectedId
                              ? 'bg-blue-500/30 text-white'
                              : 'text-blue-100/60 hover:bg-blue-500/10 hover:text-blue-50'
                          }`}
                        >
                          <span className="block truncate text-sm font-bold">
                            {index + 1}. {scene.title || '無題のシーン'}
                          </span>
                          <span className="text-[11px] text-blue-200/50">
                            {chars > 0 ? `${chars.toLocaleString()} 字` : '未執筆'}
                            {scene.blocks.length > 0 &&
                              ` ・ 🖼 ${scene.blocks.length}`}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </aside>

        {/* 本文エディタ */}
        <div className="min-w-0">
          {selected && (
            <>
              <div className="mb-3">
                <h3 className="text-lg font-bold text-white">
                  {selected.title || '無題のシーン'}
                </h3>
                {selected.summary && (
                  <p className="mt-1 text-xs text-blue-100/50">
                    {selected.summary}
                  </p>
                )}
                {selected.characterIds.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selected.characterIds.map((cid) => {
                      const character = characters.find((c) => c.id === cid);
                      if (!character) return null;
                      return (
                        <span
                          key={cid}
                          className="rounded-full border border-blue-400/25 px-2.5 py-0.5 text-[11px] text-blue-100/70"
                        >
                          {character.name || '名前未設定'}・{character.role}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 本文（マーカー位置にカードを挟んで表示する） */}
              <div onKeyDown={handleShortcut}>
                <InlineBodyEditor
                  scene={selected}
                  onChangeBody={(body) =>
                    patchSelected({ body }, TYPING_COALESCE_MS)
                  }
                  onDeleteBlock={deleteBlock}
                  onCursorChange={(position) => {
                    cursorRef.current = position;
                  }}
                />
              </div>

              {/* 挿入ボタン（エディタの下） */}
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => setInsertKind('manga')}
                  className="h-11 w-[150px] rounded-xl bg-gradient-to-br from-[#EF4444] to-[#DC2626] text-lg font-bold text-white shadow-lg shadow-red-900/30 transition-all hover:from-red-400 hover:to-red-500 hover:shadow-[0_0_28px_-6px_rgba(239,68,68,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                >
                  🎨 漫画シーン
                </button>
                <button
                  type="button"
                  onClick={() => setInsertKind('photo')}
                  className="h-11 w-[150px] rounded-xl bg-gradient-to-br from-[#3B82F6] to-[#1D4ED8] text-lg font-bold text-white shadow-lg shadow-blue-900/30 transition-all hover:from-blue-400 hover:to-blue-500 hover:shadow-[0_0_28px_-6px_rgba(59,130,246,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                >
                  📸 写真シーン
                </button>

                <span className="ml-auto flex gap-1">
                  <Button
                    variant="ghost"
                    onClick={undo}
                    disabled={!canUndo}
                    aria-label="元に戻す"
                    title="元に戻す（Ctrl+Z）"
                    className="px-3 py-2"
                  >
                    ↶
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={redo}
                    disabled={!canRedo}
                    aria-label="やり直す"
                    title="やり直す（Ctrl+Shift+Z）"
                    className="px-3 py-2"
                  >
                    ↷
                  </Button>
                </span>
              </div>

              <p className="mt-2 text-right text-xs text-blue-200/50">
                このシーン {countChars(selected.body).toLocaleString()} 字
              </p>
            </>
          )}
        </div>
      </div>

      {selected && (
        <>
          <MangaSceneInsertModal
            open={insertKind === 'manga'}
            markerPreview={blockMarker(
              'manga',
              nextMarkerNumber(selected, 'manga'),
            )}
            onInsert={insertManga}
            onClose={() => setInsertKind(null)}
          />
          <PhotoSceneInsertModal
            open={insertKind === 'photo'}
            markerPreview={blockMarker(
              'photo',
              nextMarkerNumber(selected, 'photo'),
            )}
            onInsert={insertPhoto}
            onClose={() => setInsertKind(null)}
          />
        </>
      )}
    </StepShell>
  );
}
