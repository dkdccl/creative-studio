'use client';

import type { ReactNode } from 'react';

/**
 * グラビアモード用の見た目のかたまり。
 * app/novel/components/ui.tsx と同じ役割だが、配色が紫でそろえてある。
 */

export const GRAVURE_STEPS = [
  { id: 1, label: 'プロンプト', icon: '🎨' },
  { id: 2, label: '一括生成', icon: '⚡' },
  { id: 3, label: 'メタデータ', icon: '📖' },
  { id: 4, label: 'エクスポート', icon: '📦' },
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
        {GRAVURE_STEPS.map((step) => {
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
                    ? 'border-violet-400 bg-violet-500/25 text-white shadow-[0_0_20px_-6px_rgba(168,85,247,0.9)]'
                    : isDone
                      ? 'border-violet-500/40 bg-violet-950/40 text-violet-100/80 hover:border-violet-400/70'
                      : 'border-white/10 bg-white/[0.03] text-violet-100/40 hover:border-violet-400/40 hover:text-violet-100/70'
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

/** 各ステップの外枠（見出し + 説明 + 中身） */
export function StepShell({
  step,
  title,
  description,
  children,
}: {
  step: number;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="animate-fade-up">
      <p className="text-xs font-bold uppercase tracking-widest text-violet-300/70">
        Step {step}
      </p>
      <h2 className="mt-1 text-2xl font-bold text-white sm:text-3xl">{title}</h2>
      <p className="mt-2 text-sm text-violet-100/60">{description}</p>
      <div className="mt-6 space-y-6">{children}</div>
    </section>
  );
}

/** ラベル付きの入力枠 */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline gap-2">
        <span className="text-sm font-bold text-violet-50">{label}</span>
        {hint && <span className="text-xs text-violet-200/50">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full rounded-xl border border-violet-400/25 bg-violet-950/40 px-4 py-2.5 text-sm text-white placeholder:text-violet-200/30 transition-colors focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/40';

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea {...props} className={`${inputClass} resize-y ${props.className ?? ''}`} />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

export function PrimaryButton({
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-2xl border-4 border-violet-600 bg-gradient-to-br from-[#A855F7] to-[#7C3AED] px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-violet-900/40 transition-all duration-300 hover:-translate-y-0.5 hover:border-violet-400 hover:shadow-[0_0_35px_-5px_rgba(168,85,247,0.8)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-300 active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-violet-900 disabled:from-violet-900 disabled:to-violet-950 disabled:text-violet-300/50 disabled:shadow-none disabled:hover:translate-y-0 ${className}`}
    />
  );
}

export function SecondaryButton({
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-xl border-2 border-violet-400/40 px-5 py-2.5 text-sm font-bold text-violet-100 transition hover:border-violet-300 hover:bg-violet-500/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-violet-200/30 disabled:hover:bg-transparent ${className}`}
    />
  );
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-violet-400/20 bg-black/25 p-5 ${className}`}
    >
      {children}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-200"
    >
      {children}
    </p>
  );
}
