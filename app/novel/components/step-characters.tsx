'use client';

import { createId } from '@/lib/novel-storage';
import type { EpisodeRecord } from '@/lib/series';
import { CHARACTER_ROLES, type Character, type CharacterRole } from '@/lib/types';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Select,
  StepShell,
  TextArea,
  TextInput,
} from './ui';

export function StepCharacters({
  characters,
  onChange,
  previousEpisode,
}: {
  characters: Character[];
  onChange: (characters: Character[]) => void;
  /** 連載中なら前の話（登場人物を引き継ぐ元） */
  previousEpisode: EpisodeRecord | null;
}) {
  /** 前話の人物を名前で照合して出し入れする */
  const toggleInherited = (name: string, role: string, description: string) => {
    const existing = characters.find((c) => c.name.trim() === name);
    if (existing) {
      onChange(characters.filter((c) => c.id !== existing.id));
      return;
    }
    onChange([
      ...characters,
      {
        id: createId('char'),
        name,
        role: (CHARACTER_ROLES as string[]).includes(role)
          ? (role as CharacterRole)
          : '脇役',
        age: '',
        appearance: '',
        personality: description,
        background: `前話（第${previousEpisode?.episode ?? ''}話）から引き継ぎ`,
        goal: '',
      },
    ]);
  };

  const add = () => {
    const isFirst = characters.length === 0;
    onChange([
      ...characters,
      {
        id: createId('char'),
        name: '',
        role: isFirst ? '主人公' : '脇役',
        age: '',
        appearance: '',
        personality: '',
        background: '',
        goal: '',
      },
    ]);
  };

  const update = (id: string, patch: Partial<Character>) => {
    onChange(characters.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const remove = (id: string) => {
    onChange(characters.filter((c) => c.id !== id));
  };

  return (
    <StepShell
      step={2}
      title="キャラクター設定"
      description="登場人物のシートを作ります。ここで登録した人物は、プロットのシーンに割り当てられます。"
    >
      {previousEpisode && previousEpisode.characters.length > 0 && (
        <Card className="border-amber-400/30 bg-amber-400/[0.06]">
          <p className="text-sm font-bold text-amber-100">
            第{previousEpisode.episode}話の登場人物
          </p>
          <p className="mt-1 text-xs text-amber-100/60">
            チェックを入れるとこの話のキャラクターとして引き継ぎます。
          </p>
          <div className="mt-3 space-y-2">
            {previousEpisode.characters.map((character) => {
              const checked = characters.some(
                (c) => c.name.trim() === character.name,
              );
              return (
                <label
                  key={character.name}
                  className="flex cursor-pointer items-center gap-2.5 text-sm text-blue-50/85"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      toggleInherited(
                        character.name,
                        character.role,
                        character.description,
                      )
                    }
                    className="h-4 w-4 accent-amber-400"
                  />
                  {character.name}
                  <span className="text-xs text-blue-200/50">（前話から）</span>
                </label>
              );
            })}
          </div>
        </Card>
      )}

      {characters.length === 0 ? (
        <EmptyState
          icon="👥"
          message="まだキャラクターがいません。「キャラクターを追加」から主人公を作りましょう。"
        />
      ) : (
        <div className="space-y-4">
          {characters.map((character, index) => (
            <Card key={character.id}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="text-xs font-bold uppercase tracking-widest text-blue-300/60">
                  Character {index + 1}
                </span>
                <Button
                  variant="danger"
                  onClick={() => remove(character.id)}
                  className="px-3 py-1 text-xs"
                  aria-label={`${character.name || `キャラクター${index + 1}`}を削除`}
                >
                  削除
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="名前">
                  <TextInput
                    value={character.name}
                    onChange={(e) => update(character.id, { name: e.target.value })}
                    placeholder="例：宮園 灯"
                    maxLength={40}
                  />
                </Field>
                <Field label="役割">
                  <Select
                    value={character.role}
                    onChange={(e) =>
                      update(character.id, {
                        role: e.target.value as CharacterRole,
                      })
                    }
                  >
                    {CHARACTER_ROLES.map((role) => (
                      <option key={role} value={role} className="bg-blue-950">
                        {role}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="年齢">
                  <TextInput
                    value={character.age}
                    onChange={(e) => update(character.id, { age: e.target.value })}
                    placeholder="例：17"
                    maxLength={20}
                  />
                </Field>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="外見">
                  <TextArea
                    rows={2}
                    value={character.appearance}
                    onChange={(e) =>
                      update(character.id, { appearance: e.target.value })
                    }
                    placeholder="髪型・服装・目立つ特徴など"
                  />
                </Field>
                <Field label="性格">
                  <TextArea
                    rows={2}
                    value={character.personality}
                    onChange={(e) =>
                      update(character.id, { personality: e.target.value })
                    }
                    placeholder="口癖・価値観・弱点など"
                  />
                </Field>
                <Field label="背景">
                  <TextArea
                    rows={2}
                    value={character.background}
                    onChange={(e) =>
                      update(character.id, { background: e.target.value })
                    }
                    placeholder="生い立ち・物語開始時点の状況"
                  />
                </Field>
                <Field label="目的・動機">
                  <TextArea
                    rows={2}
                    value={character.goal}
                    onChange={(e) => update(character.id, { goal: e.target.value })}
                    placeholder="この物語で何を求めているか"
                  />
                </Field>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Button onClick={add}>＋ キャラクターを追加</Button>
    </StepShell>
  );
}
