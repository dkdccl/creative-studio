'use client';

import {
  GENRES,
  POV_LABELS,
  TARGET_LENGTH_LABELS,
  TONE_LABELS,
  type NovelTheme,
  type Pov,
  type TargetLength,
  type Tone,
} from '@/lib/types';
import type { SeriesRecord } from '@/lib/series';
import type { SerialSettings as SerialSettingsValue } from '@/lib/types';
import { SerialSettings } from './serial-settings';
import { Chip, Field, Select, StepShell, TextArea, TextInput } from './ui';

export function StepTheme({
  theme,
  onChange,
  serial,
  seriesList,
  nextEpisodeFor,
  onSerialChange,
}: {
  theme: NovelTheme;
  onChange: (patch: Partial<NovelTheme>) => void;
  serial: SerialSettingsValue;
  seriesList: SeriesRecord[];
  nextEpisodeFor: (seriesId: string) => number;
  onSerialChange: (patch: Partial<SerialSettingsValue>) => void;
}) {
  const toggleGenre = (genre: string) => {
    const genres = theme.genres.includes(genre)
      ? theme.genres.filter((g) => g !== genre)
      : [...theme.genres, genre];
    onChange({ genres });
  };

  return (
    <StepShell
      step={1}
      title="テーマ・ジャンル選択"
      description="作品の方向性を決めます。ここで選んだ設定が、以降のステップの土台になります。"
    >
      <SerialSettings
        value={serial}
        seriesList={seriesList}
        nextEpisodeFor={nextEpisodeFor}
        onChange={onSerialChange}
      />

      <Field label="タイトル" hint="仮題でも構いません">
        <TextInput
          value={theme.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="例：星降る夜の図書館"
          maxLength={80}
        />
      </Field>

      <div>
        <p className="mb-2 text-sm font-bold text-blue-50">
          ジャンル{' '}
          <span className="text-xs font-normal text-blue-200/50">
            複数選択できます
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          {GENRES.map((genre) => (
            <Chip
              key={genre}
              active={theme.genres.includes(genre)}
              onClick={() => toggleGenre(genre)}
            >
              {genre}
            </Chip>
          ))}
        </div>
      </div>

      <Field label="ログライン" hint="物語を一行で">
        <TextArea
          rows={2}
          value={theme.logline}
          onChange={(e) => onChange({ logline: e.target.value })}
          placeholder="例：本を読めない少女が、閉館寸前の図書館で言葉を取り戻す物語。"
        />
      </Field>

      <Field label="テーマ・書きたいこと" hint="任意">
        <TextArea
          rows={3}
          value={theme.theme}
          onChange={(e) => onChange({ theme: e.target.value })}
          placeholder="例：喪失と再生。誰かに読んでもらうことで初めて意味を持つ言葉について。"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="視点">
          <Select
            value={theme.pov}
            onChange={(e) => onChange({ pov: e.target.value as Pov })}
          >
            {(Object.keys(POV_LABELS) as Pov[]).map((pov) => (
              <option key={pov} value={pov} className="bg-blue-950">
                {POV_LABELS[pov]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="文体">
          <Select
            value={theme.tone}
            onChange={(e) => onChange({ tone: e.target.value as Tone })}
          >
            {(Object.keys(TONE_LABELS) as Tone[]).map((tone) => (
              <option key={tone} value={tone} className="bg-blue-950">
                {TONE_LABELS[tone]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="想定分量">
          <Select
            value={theme.targetLength}
            onChange={(e) =>
              onChange({ targetLength: e.target.value as TargetLength })
            }
          >
            {(Object.keys(TARGET_LENGTH_LABELS) as TargetLength[]).map((len) => (
              <option key={len} value={len} className="bg-blue-950">
                {TARGET_LENGTH_LABELS[len]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </StepShell>
  );
}
