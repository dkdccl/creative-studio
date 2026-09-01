'use client';

import { createId } from '@/lib/novel-storage';
import {
  ACTS,
  sortScenesByAct,
  type ActId,
  type Character,
  type Scene,
} from '@/lib/types';
import { Button, Card, EmptyState, StepShell, TextArea, TextInput } from './ui';

export function StepPlot({
  scenes,
  characters,
  onChange,
}: {
  scenes: Scene[];
  characters: Character[];
  onChange: (scenes: Scene[]) => void;
}) {
  const addScene = (act: ActId) => {
    onChange(
      sortScenesByAct([
        ...scenes,
        {
          id: createId('scene'),
          act,
          title: '',
          summary: '',
          characterIds: [],
          body: '',
          blocks: [],
        },
      ]),
    );
  };

  const updateScene = (id: string, patch: Partial<Scene>) => {
    onChange(scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const removeScene = (id: string) => {
    onChange(scenes.filter((s) => s.id !== id));
  };

  /** 同じ幕の中でシーンを 1 つ上/下へ動かす */
  const moveScene = (id: string, direction: -1 | 1) => {
    const scene = scenes.find((s) => s.id === id);
    if (!scene) return;

    const inAct = scenes.filter((s) => s.act === scene.act);
    const index = inAct.findIndex((s) => s.id === id);
    const target = index + direction;
    if (target < 0 || target >= inAct.length) return;

    [inAct[index], inAct[target]] = [inAct[target], inAct[index]];

    const others = scenes.filter((s) => s.act !== scene.act);
    onChange(sortScenesByAct([...others, ...inAct]));
  };

  const toggleCharacter = (scene: Scene, characterId: string) => {
    const characterIds = scene.characterIds.includes(characterId)
      ? scene.characterIds.filter((cid) => cid !== characterId)
      : [...scene.characterIds, characterId];
    updateScene(scene.id, { characterIds });
  };

  return (
    <StepShell
      step={3}
      title="プロット構成（三幕構成）"
      description="幕ごとにシーンを並べます。ここで作ったシーンが、そのまま Step 4 の執筆単位になります。"
    >
      {ACTS.map((act) => {
        const actScenes = scenes.filter((s) => s.act === act.id);
        return (
          <div key={act.id} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-blue-400/20 pb-2">
              <h3 className="text-lg font-bold text-white">
                {act.label}
                <span className="ml-2 text-xs font-normal text-blue-200/50">
                  {act.hint}
                </span>
              </h3>
              <span className="text-xs text-blue-200/50">
                {actScenes.length} シーン
              </span>
            </div>

            {actScenes.length === 0 ? (
              <EmptyState icon="🗒️" message="この幕にはまだシーンがありません。" />
            ) : (
              <div className="space-y-3">
                {actScenes.map((scene, index) => (
                  <Card key={scene.id}>
                    <div className="mb-3 flex items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/25 text-xs font-bold text-blue-100">
                        {index + 1}
                      </span>
                      <TextInput
                        value={scene.title}
                        onChange={(e) =>
                          updateScene(scene.id, { title: e.target.value })
                        }
                        placeholder="シーンのタイトル"
                        maxLength={60}
                      />
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          onClick={() => moveScene(scene.id, -1)}
                          disabled={index === 0}
                          className="px-2.5 py-1.5 text-xs"
                          aria-label="上へ移動"
                        >
                          ↑
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => moveScene(scene.id, 1)}
                          disabled={index === actScenes.length - 1}
                          className="px-2.5 py-1.5 text-xs"
                          aria-label="下へ移動"
                        >
                          ↓
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => removeScene(scene.id)}
                          className="px-2.5 py-1.5 text-xs"
                          aria-label="このシーンを削除"
                        >
                          ✕
                        </Button>
                      </div>
                    </div>

                    <TextArea
                      rows={2}
                      value={scene.summary}
                      onChange={(e) =>
                        updateScene(scene.id, { summary: e.target.value })
                      }
                      placeholder="このシーンで起きること・誰がどう変化するか"
                    />

                    {characters.length > 0 && (
                      <div className="mt-3">
                        <p className="mb-1.5 text-xs font-bold text-blue-100/70">
                          登場キャラクター
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {characters.map((character) => {
                            const active = scene.characterIds.includes(
                              character.id,
                            );
                            return (
                              <button
                                key={character.id}
                                type="button"
                                onClick={() =>
                                  toggleCharacter(scene, character.id)
                                }
                                aria-pressed={active}
                                className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                                  active
                                    ? 'border-blue-400 bg-blue-500/30 text-white'
                                    : 'border-blue-400/20 text-blue-100/50 hover:border-blue-400/50 hover:text-blue-50'
                                }`}
                              >
                                {character.name || '名前未設定'}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}

            <Button variant="ghost" onClick={() => addScene(act.id)}>
              ＋ {act.label.split('：')[0]}にシーンを追加
            </Button>
          </div>
        );
      })}
    </StepShell>
  );
}
