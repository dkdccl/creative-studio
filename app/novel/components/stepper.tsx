'use client';

export const NOVEL_STEPS = [
  { id: 1, label: 'テーマ・ジャンル', icon: '🧭' },
  { id: 2, label: 'キャラクター', icon: '👥' },
  { id: 3, label: 'プロット構成', icon: '🗺️' },
  { id: 4, label: '執筆', icon: '✍️' },
  { id: 5, label: 'エクスポート', icon: '📦' },
] as const;

export function Stepper({
  current,
  completed,
  onSelect,
}: {
  current: number;
  /** 入力済みと判定されたステップ番号 */
  completed: number[];
  onSelect: (step: number) => void;
}) {
  return (
    <nav aria-label="制作ステップ" className="w-full">
      <ol className="flex w-full items-stretch gap-1 sm:gap-2">
        {NOVEL_STEPS.map((step) => {
          const isCurrent = step.id === current;
          const isDone = completed.includes(step.id) && !isCurrent;
          return (
            <li key={step.id} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onSelect(step.id)}
                aria-current={isCurrent ? 'step' : undefined}
                // ラベルは狭い画面で非表示になるため、名前は aria-label で明示する
                aria-label={`Step ${step.id}：${step.label}`}
                className={`flex w-full flex-col items-center gap-1 rounded-xl border-2 px-1 py-2 transition-all sm:px-3 sm:py-3 ${
                  isCurrent
                    ? 'border-blue-400 bg-blue-500/25 text-white shadow-[0_0_20px_-6px_rgba(59,130,246,0.9)]'
                    : isDone
                      ? 'border-blue-500/40 bg-blue-950/40 text-blue-100/80 hover:border-blue-400/70'
                      : 'border-white/10 bg-white/[0.03] text-blue-100/40 hover:border-blue-400/40 hover:text-blue-100/70'
                }`}
              >
                <span className="text-base leading-none sm:text-lg">
                  {isDone ? '✅' : step.icon}
                </span>
                <span className="hidden truncate text-xs font-bold sm:block">
                  {step.label}
                </span>
                <span className="text-[10px] font-bold sm:hidden">{step.id}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
