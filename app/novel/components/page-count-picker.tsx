'use client';

import { useState } from 'react';

import {
  MAX_PAGES,
  MIN_PAGES,
  PAGE_PRESETS,
  PANELS_PER_PAGE,
  pagePresetRangeLabel,
  panelsForPages,
  validateCustomPages,
  type PagePresetId,
} from '@/lib/scene-blocks';

/**
 * ページ数選択（プリセット + 手動入力）。
 * コマ割りは 1ページ 6コマ（3x2）固定なので、選ぶのはページ数だけ。
 *
 * 有効な値になったときだけ onChange を呼び、
 * カスタム入力が未入力・範囲外のあいだは onValidChange(false) を通知する。
 */
export function PageCountPicker({
  value,
  onChange,
  onValidChange,
  accent = 'blue',
}: {
  value: number;
  onChange: (pages: number) => void;
  onValidChange?: (valid: boolean) => void;
  accent?: 'blue' | 'red';
}) {
  const [presetId, setPresetId] = useState<PagePresetId>('short');
  const [customText, setCustomText] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  const preset = PAGE_PRESETS.find((p) => p.id === presetId) ?? PAGE_PRESETS[0];
  const isCustom = presetId === 'custom';

  const activeClass =
    accent === 'red'
      ? 'border-red-400 bg-red-500/25 text-white'
      : 'border-blue-400 bg-blue-500/25 text-white';
  const hoverClass =
    accent === 'red' ? 'hover:border-red-400/60' : 'hover:border-blue-400/60';

  const applyCustom = (text: string) => {
    const { pages, error } = validateCustomPages(text);
    setCustomError(error);
    onValidChange?.(pages !== null);
    if (pages !== null) onChange(pages);
  };

  const selectPreset = (id: PagePresetId) => {
    setPresetId(id);
    if (id === 'custom') {
      applyCustom(customText);
      return;
    }
    setCustomError(null);
    onValidChange?.(true);
    onChange(PAGE_PRESETS.find((p) => p.id === id)?.pages[0] ?? MIN_PAGES);
  };

  const changeCustom = (raw: string) => {
    // 整数だけを受け付ける（入力時点で数字以外を落とす）
    const digitsOnly = raw.replace(/[^\d]/g, '');
    setCustomText(digitsOnly);
    applyCustom(digitsOnly);
  };

  const showTotal = !isCustom || (customError === null && customText !== '');

  return (
    <div>
      <p className="mb-2 text-sm font-bold text-blue-50">
        ページ数を選択{' '}
        <span className="text-xs font-normal text-white/40">
          1ページ = {PANELS_PER_PAGE}コマ（3x2）固定
        </span>
      </p>

      {/* プリセット */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PAGE_PRESETS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => selectPreset(option.id)}
            aria-pressed={presetId === option.id}
            // ラベルが 2 行に分かれているので名前を明示する
            aria-label={`${option.label}（${pagePresetRangeLabel(option)}）`}
            className={`rounded-xl border-2 px-3 py-2.5 text-left transition-all ${
              presetId === option.id
                ? activeClass
                : `border-white/15 bg-white/5 text-white/60 ${hoverClass}`
            }`}
          >
            <span className="block text-sm font-bold">{option.label}</span>
            <span className="block text-[10px] text-white/40">
              {pagePresetRangeLabel(option)}
            </span>
          </button>
        ))}
      </div>

      {/* プリセット内のページ数 */}
      {preset.pages.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {preset.pages.map((pages) => (
            <button
              key={pages}
              type="button"
              onClick={() => onChange(pages)}
              aria-pressed={value === pages}
              className={`rounded-lg border-2 px-3.5 py-1.5 text-xs font-bold transition-all ${
                value === pages
                  ? activeClass
                  : `border-white/15 bg-white/5 text-white/60 ${hoverClass}`
              }`}
            >
              {pages}ページ
            </button>
          ))}
        </div>
      )}

      {/* 手動入力 */}
      {isCustom && (
        <div className="mt-3">
          <p className="mb-1.5 text-sm font-bold text-blue-50">ページ数を入力</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={customText}
              onChange={(e) => changeCustom(e.target.value)}
              inputMode="numeric"
              autoComplete="off"
              placeholder="例：15"
              aria-label="ページ数"
              aria-invalid={customError !== null}
              className={`w-28 rounded-xl border bg-blue-950/40 px-4 py-2.5 text-sm text-white placeholder:text-blue-200/30 focus:outline-none focus:ring-2 ${
                customError
                  ? 'border-red-500/60 focus:ring-red-500/40'
                  : 'border-blue-400/25 focus:border-blue-400 focus:ring-blue-500/40'
              }`}
            />
            <span className="text-sm text-white/70">ページ</span>
            <span className="text-xs text-white/40">
              （{MIN_PAGES}-{MAX_PAGES}ページまで）
            </span>
          </div>
          {customError && (
            <p role="alert" className="mt-2 text-xs text-red-300">
              {customError}
            </p>
          )}
        </div>
      )}

      {showTotal && (
        <p className="mt-3 text-xs text-white/50">
          {value}ページ × {PANELS_PER_PAGE}コマ ＝ 総コマ数{' '}
          <span className="font-bold text-white/80">
            {panelsForPages(value)}コマ
          </span>
        </p>
      )}
    </div>
  );
}
