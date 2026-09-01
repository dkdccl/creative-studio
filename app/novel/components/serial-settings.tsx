'use client';

import type { SeriesRecord } from '@/lib/series';
import type { SerialSettings as SerialSettingsValue } from '@/lib/types';
import { Field, Select, TextInput } from './ui';

/**
 * 連載設定。
 * 新規シリーズか、既存シリーズの続きかを選ぶ。
 */
export function SerialSettings({
  value,
  seriesList,
  nextEpisodeFor,
  onChange,
}: {
  value: SerialSettingsValue;
  seriesList: SeriesRecord[];
  /** そのシリーズで次に書く話数 */
  nextEpisodeFor: (seriesId: string) => number;
  onChange: (patch: Partial<SerialSettingsValue>) => void;
}) {
  const selectSeries = (seriesId: string) => {
    onChange({
      seriesId: seriesId || null,
      episode: seriesId ? nextEpisodeFor(seriesId) : 1,
    });
  };

  return (
    <div className="rounded-2xl border border-blue-400/20 bg-blue-950/30 p-5">
      <p className="text-sm font-bold text-blue-50">連載設定</p>

      <div className="mt-3 space-y-2">
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-blue-100/80">
          <input
            type="radio"
            name="serial-mode"
            checked={value.mode === 'new'}
            onChange={() =>
              onChange({ mode: 'new', seriesId: null, episode: 1 })
            }
            className="h-4 w-4 accent-blue-500"
          />
          新規シリーズ
        </label>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-blue-100/80">
          <input
            type="radio"
            name="serial-mode"
            checked={value.mode === 'continue'}
            onChange={() => onChange({ mode: 'continue' })}
            className="h-4 w-4 accent-blue-500"
            disabled={seriesList.length === 0}
          />
          既存シリーズの続き
          {seriesList.length === 0 && (
            <span className="text-xs text-blue-200/40">
              （保存済みのシリーズがありません）
            </span>
          )}
        </label>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {value.mode === 'new' ? (
          <Field label="シリーズ名" hint="Step 5 で保存すると登録されます">
            <TextInput
              value={value.seriesName}
              onChange={(e) => onChange({ seriesName: e.target.value })}
              placeholder="例：星降る夜の図書館"
              maxLength={60}
            />
          </Field>
        ) : (
          <Field label="既存シリーズを選択">
            <Select
              value={value.seriesId ?? ''}
              onChange={(e) => selectSeries(e.target.value)}
            >
              <option value="" className="bg-blue-950">
                選択してください
              </option>
              {seriesList.map((series) => (
                <option
                  key={series.id}
                  value={series.id}
                  className="bg-blue-950"
                >
                  {series.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="話数">
          <TextInput
            value={String(value.episode)}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^\d]/g, '');
              onChange({ episode: Math.max(1, Number(digits) || 1) });
            }}
            inputMode="numeric"
            aria-label="話数"
          />
        </Field>
      </div>

      <p className="mt-3 text-xs text-blue-200/50">
        この作品は第{value.episode}話として保存されます。
      </p>
    </div>
  );
}
