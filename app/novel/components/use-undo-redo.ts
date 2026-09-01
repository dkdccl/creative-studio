'use client';

import { useCallback, useRef, useState } from 'react';

/** 履歴の上限。これを超えた分は古い方から捨てる */
const MAX_HISTORY = 50;

/**
 * 親が持っている値に対して Undo / Redo を足すフック。
 *
 * 変更は commit() 経由で行う。coalesceMs を渡すと、その間隔で続いた変更を
 * 1 つの履歴にまとめる（本文のタイプ入力を 1 文字ずつ積まないため）。
 * 挿入・削除のような単発の操作は coalesceMs なしで呼ぶ。
 */
export function useUndoRedo<T>(value: T, onChange: (next: T) => void) {
  const [past, setPast] = useState<T[]>([]);
  const [future, setFuture] = useState<T[]>([]);
  const lastCommitAt = useRef(0);

  const commit = useCallback(
    (next: T, coalesceMs = 0) => {
      const now = Date.now();
      const shouldPush = coalesceMs === 0 || now - lastCommitAt.current > coalesceMs;
      if (shouldPush) {
        setPast((p) => [...p, value].slice(-MAX_HISTORY));
      }
      lastCommitAt.current = now;
      setFuture([]);
      onChange(next);
    },
    [value, onChange],
  );

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast(past.slice(0, -1));
    setFuture([value, ...future]);
    // 直後のタイプ入力が undo 前の履歴とまとまらないようにする
    lastCommitAt.current = 0;
    onChange(previous);
  }, [past, future, value, onChange]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const [next, ...rest] = future;
    setPast([...past, value].slice(-MAX_HISTORY));
    setFuture(rest);
    lastCommitAt.current = 0;
    onChange(next);
  }, [past, future, value, onChange]);

  /** 履歴を捨てる（編集対象そのものが切り替わったとき） */
  const reset = useCallback(() => {
    setPast([]);
    setFuture([]);
    lastCommitAt.current = 0;
  }, []);

  return {
    commit,
    undo,
    redo,
    reset,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  };
}
