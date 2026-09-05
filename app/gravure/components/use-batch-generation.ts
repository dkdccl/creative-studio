'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  MAX_CONSECUTIVE_FAILURES,
  type GravureFailure,
  type GravureShot,
  type PromptSettings,
} from '@/lib/gravure';

export type BatchStatus = 'idle' | 'running' | 'done' | 'cancelled';

/** 画素数を測る。読めなければ依頼した寸法で代用する */
async function measure(
  blob: Blob,
  fallbackWidth: number,
  fallbackHeight: number,
): Promise<{ width: number; height: number }> {
  try {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return { width: fallbackWidth, height: fallbackHeight };
  }
}

/**
 * モードごとの送り先とペイロードを組み立てる。
 * txt2img は JSON、img2img は multipart（画像を添えるため）。
 */
function buildRequest(
  request: PromptSettings,
  seed: number | undefined,
  reference: File | null,
): [string, RequestInit] {
  if (request.mode === 'img2img') {
    if (!reference) throw new Error('参考画像が選択されていません。');

    const form = new FormData();
    form.append('image', reference);
    form.append('prompt', request.prompt);
    form.append('jobType', request.img2imgModel);
    form.append('negativePrompt', request.negativePrompt);
    form.append('strength', String(request.strength));
    form.append('stylePreset', request.stylePreset);
    form.append('enforceSingleSubject', String(request.enforceSingleSubject));
    if (seed !== undefined) form.append('seed', String(seed));

    // Content-Type は fetch に決めさせる（境界文字列を付けてもらう）
    return ['/api/gravure/img2img', { method: 'POST', body: form }];
  }

  return [
    '/api/gravure/generate',
    {
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
        enforceSingleSubject: request.enforceSingleSubject,
        seed,
      }),
    },
  ];
}

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

  // 書き出しから外した画像の id。人物が写らなかったコマなどを落とすため
  const [excludedIds, setExcludedIds] = useState<string[]>([]);

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
    setExcludedIds([]);
    setCompleted(0);
    setTotal(0);
    setFatalError(null);
    setStatus('idle');
  }, [releaseUrls]);

  const start = useCallback(
    async (count: number, request: PromptSettings, references: File[] = []) => {
      // img2img は参考画像 1 枚につき count 枚ずつ作る。txt2img は参考画像なしの 1 巡
      const passes: (File | null)[] =
        request.mode === 'img2img' && references.length > 0 ? references : [null];
      const grandTotal = count * passes.length;
      // 前回ぶんは破棄してから始める
      releaseUrls();
      setShots([]);
      setFailures([]);
      setExcludedIds([]);
      setCompleted(0);
      setFatalError(null);
      setTotal(grandTotal);
      setStatus('running');

      const controller = new AbortController();
      abortRef.current = controller;

      let consecutiveFailures = 0;
      let done = 0;

      outer: for (let pass = 0; pass < passes.length; pass += 1) {
      const reference = passes[pass];
      const referenceIndex = reference ? pass + 1 : undefined;

      for (let i = 0; i < count; i += 1) {
        if (controller.signal.aborted) break outer;

        const index = i + 1;
        // 種を固定すると同じ絵ばかりになるので 1 枚ずつずらす。参考画像ごとにもずらす
        const seed =
          request.baseSeed === undefined ? undefined : request.baseSeed + pass * count + i;

        try {
          const [url, init] = buildRequest(request, seed, reference);
          const response = await fetch(url, { ...init, signal: controller.signal });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data?.error ?? `HTTP ${response.status}`);
          }

          // data URL のまま抱えると重いので Blob に移す
          const blob = await (await fetch(data.imageUrl)).blob();
          const objectUrl = URL.createObjectURL(blob);
          urlsRef.current.push(objectUrl);

          // 依頼した寸法と返ってきた寸法がずれることがあるので実測する
          const size = await measure(blob, request.width, request.height);

          setShots((prev) => [
            ...prev,
            {
              id: `${Date.now()}-${pass}-${index}`,
              index,
              referenceIndex,
              objectUrl,
              blob,
              width: size.width,
              height: size.height,
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
          setFailures((prev) => [
            ...prev,
            { index, referenceIndex, message },
          ]);
          consecutiveFailures += 1;

          // 認証切れなどは残り全部が同じ理由で失敗するため、続けても意味がない
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            setFatalError(
              `${MAX_CONSECUTIVE_FAILURES} 回続けて失敗したため中断しました。最後のエラー: ${message}`,
            );
            break outer;
          }
        } finally {
          done += 1;
          setCompleted(done);
        }
      }
      }

      const wasAborted = controller.signal.aborted;
      abortRef.current = null;
      setStatus(wasAborted ? 'cancelled' : 'done');
    },
    [releaseUrls],
  );

  const toggleExcluded = useCallback((id: string) => {
    setExcludedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }, []);

  return {
    shots,
    /** ZIP・PDF・メタデータに載せるぶん */
    includedShots: shots.filter((shot) => !excludedIds.includes(shot.id)),
    excludedIds,
    toggleExcluded,
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
