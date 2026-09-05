'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  MAX_CONSECUTIVE_FAILURES,
  type GravureFailure,
  type GravureShot,
  type PromptSettings,
} from '@/lib/gravure';

export type BatchStatus = 'idle' | 'running' | 'done' | 'cancelled';

/**
 * 一括生成の進行を持つ。
 *
 * Prodia は 1 リクエスト 1 枚なので、枚数ぶん順番に叩く。
 * まとめて投げないのは、レート制限に当たると全部巻き添えになるため。
 * 50 枚だと 20 分近くかかるので、中断できるようにしてある。
 */
export function useBatchGeneration() {
  const [shots, setShots] = useState<GravureShot[]>([]);
  const [failures, setFailures] = useState<GravureFailure[]>([]);
  const [status, setStatus] = useState<BatchStatus>('idle');
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  // revoke するために、今持っている object URL を実体で覚えておく
  const urlsRef = useRef<string[]>([]);

  const releaseUrls = useCallback(() => {
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    urlsRef.current = [];
  }, []);

  useEffect(() => releaseUrls, [releaseUrls]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    releaseUrls();
    setShots([]);
    setFailures([]);
    setCompleted(0);
    setTotal(0);
    setFatalError(null);
    setStatus('idle');
  }, [releaseUrls]);

  const start = useCallback(
    async (count: number, request: PromptSettings) => {
      // 前回ぶんは破棄してから始める
      releaseUrls();
      setShots([]);
      setFailures([]);
      setCompleted(0);
      setFatalError(null);
      setTotal(count);
      setStatus('running');

      const controller = new AbortController();
      abortRef.current = controller;

      let consecutiveFailures = 0;

      for (let i = 0; i < count; i += 1) {
        if (controller.signal.aborted) break;

        const index = i + 1;
        try {
          const response = await fetch('/api/gravure/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: request.prompt,
              negativePrompt: request.negativePrompt,
              stylePreset: request.stylePreset,
              width: request.width,
              height: request.height,
              steps: request.steps,
              guidanceScale: request.guidanceScale,
              // 種を固定すると同じ絵ばかりになるので 1 枚ずつずらす
              seed:
                request.baseSeed === undefined ? undefined : request.baseSeed + i,
            }),
            signal: controller.signal,
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data?.error ?? `HTTP ${response.status}`);
          }

          // data URL のまま抱えると重いので Blob に移す
          const blob = await (await fetch(data.imageUrl)).blob();
          const objectUrl = URL.createObjectURL(blob);
          urlsRef.current.push(objectUrl);

          setShots((prev) => [
            ...prev,
            {
              id: `${Date.now()}-${index}`,
              index,
              objectUrl,
              blob,
              prompt: data.prompt,
              jobType: data.jobType,
              seed: data.seed,
            },
          ]);
          consecutiveFailures = 0;
        } catch (error) {
          if (controller.signal.aborted) break;

          const message =
            error instanceof Error ? error.message : '生成に失敗しました';
          setFailures((prev) => [...prev, { index, message }]);
          consecutiveFailures += 1;

          // 認証切れなどは残り全部が同じ理由で失敗するため、続けても意味がない
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            setFatalError(
              `${MAX_CONSECUTIVE_FAILURES} 回続けて失敗したため中断しました。最後のエラー: ${message}`,
            );
            break;
          }
        } finally {
          setCompleted(index);
        }
      }

      const wasAborted = controller.signal.aborted;
      abortRef.current = null;
      setStatus(wasAborted ? 'cancelled' : 'done');
    },
    [releaseUrls],
  );

  return {
    shots,
    failures,
    status,
    completed,
    total,
    fatalError,
    start,
    cancel,
    reset,
    isRunning: status === 'running',
  };
}
