'use client';

import { forwardRef, type ReactNode } from 'react';

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
      <p className="text-xs font-bold uppercase tracking-widest text-blue-300/70">
        Step {step}
      </p>
      <h2 className="mt-1 text-2xl font-bold text-white sm:text-3xl">{title}</h2>
      <p className="mt-2 text-sm text-blue-100/60">{description}</p>
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
        <span className="text-sm font-bold text-blue-50">{label}</span>
        {hint && <span className="text-xs text-blue-200/50">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full rounded-xl border border-blue-400/25 bg-blue-950/40 px-4 py-2.5 text-sm text-white placeholder:text-blue-200/30 transition-colors focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40';

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

// カーソル位置を読むために ref を渡せるようにしている
export const TextArea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function TextArea(props, ref) {
  return (
    <textarea
      {...props}
      ref={ref}
      className={`${inputClass} resize-y leading-relaxed ${props.className ?? ''}`}
    />
  );
});

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`${inputClass} appearance-none ${props.className ?? ''}`}
    />
  );
}

/** 選択チップ（複数選択・単一選択の両方に使う） */
export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border-2 px-4 py-2 text-sm font-bold transition-all ${
        active
          ? 'border-blue-400 bg-blue-500/30 text-white shadow-[0_0_18px_-4px_rgba(59,130,246,0.9)]'
          : 'border-blue-400/25 bg-blue-950/30 text-blue-100/70 hover:border-blue-400/60 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

/** カード（キャラクター・シーン用） */
export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-blue-400/20 bg-blue-950/30 p-5 ${className}`}
    >
      {children}
    </div>
  );
}

/** 何も登録がないときの案内 */
export function EmptyState({
  icon,
  message,
}: {
  icon: string;
  message: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-blue-400/25 px-6 py-10 text-center">
      <div className="text-3xl">{icon}</div>
      <p className="mt-3 text-sm text-blue-100/50">{message}</p>
    </div>
  );
}

/** 汎用ボタン */
export function Button({
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger';
}) {
  const styles = {
    primary:
      'bg-gradient-to-br from-[#3B82F6] to-[#1D4ED8] text-white border-blue-500 hover:from-blue-400 hover:to-blue-500 hover:shadow-[0_0_25px_-6px_rgba(59,130,246,0.9)]',
    ghost:
      'bg-transparent text-blue-100/80 border-blue-400/30 hover:border-blue-400/70 hover:text-white',
    danger:
      'bg-transparent text-red-300 border-red-500/40 hover:bg-red-500/15 hover:text-red-200',
  }[variant];

  return (
    <button
      type="button"
      {...props}
      className={`rounded-xl border-2 px-5 py-2.5 text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-40 ${styles} ${className}`}
    />
  );
}
