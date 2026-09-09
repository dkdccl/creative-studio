'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  MAX_CONSECUTIVE_FAILURES,
  seedFor,
  themeForSession,
  withTheme,
  type GravureFailure,
  type GravureShot,
  type PromptSettings,
} from '@/lib/gravure';
import { buildReferenceSequence } from '@/lib/gravure-prompt';
import { isStubMode, stubGenerate } from '@/lib/gravure-stub';
import { isDesktop, nextVolumeNumber, saveGravureImage } from '@/lib/filesystem';

export type BatchStatus = 'idle' | 'running' | 'done' | 'cancelled';

/** 参考画像を 1 枚ごとに切り替えるか、参考画像ごとにまとめて作るか */
export type ReferenceMode = 'rotate' | 'multiply';

/** 一括生成の指示。枚数 × 回数ぶんを順番に作る */
export interface StartOptions {
  /** 1 回（1 セッション）あたりの枚数 */
  count: number;
  /** 生成回数 */
  sessions: number;
  settings: PromptSettings;
  /** img2img のときの参考画像 */
  references?: File[];
  /**
   * 参考画像の使い方。
   *
   * rotate は 1 枚ごとに参考画像を切り替える（合計は 枚数 × 回数）。
   * multiply は参考画像 1 枚につき指定枚数ずつ作る（合計は 枚数 × 参考数 × 回数）。
   */
  referenceMode?: ReferenceMode;
  /** セッションごとにプロンプトへ足すテーマ。空なら毎回同じ */
  themes?: string[];
  /**
   * セッションごとに丸ごと差し替えるプロンプト。
   * 自動生成したものを画面のプレビューと揃えるため、作った側から渡す。
   */
  sessionPrompts?: string[];
}

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
 * 送信ペイロードからプロンプトを取り出す。
 * txt2img は JSON、img2img は FormData なので取り出し方が違う。
 */
function promptOf(init: RequestInit): string {
  if (init.body instanceof FormData) return String(init.body.get('prompt') ?? '');
  if (typeof init.body === 'string') {
    try {
      return JSON.parse(init.body).prompt ?? '';
    } catch {
      return '';
    }
  }
  return '';
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
  // 何回目のセッションを走っているか（1 始まり）
  const [session, setSession] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  // 「このセッションで停止」を押されたか
  const [stopRequested, setStopRequested] = useState(false);
  // デスクトップ版でローカルに書き出した巻番号（ブラウザでは null）
  const [savedVolume, setSavedVolume] = useState<number | null>(null);
  const stopAfterSessionRef = useRef(false);

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
    setSession(0);
    setSessionTotal(0);
    setStopRequested(false);
    setSavedVolume(null);
    stopAfterSessionRef.current = false;
    setStatus('idle');
  }, [releaseUrls]);

  const start = useCallback(
    async ({
      count,
      sessions,
      settings: request,
      references = [],
      themes = [],
      sessionPrompts = [],
      referenceMode = 'rotate',
    }: StartOptions) => {
      // img2img は参考画像 1 枚につき count 枚ずつ作る。txt2img は参考画像なしの 1 巡
      const usingReferences = request.mode === 'img2img' && references.length > 0;

      // rotate では参考画像で枚数を増やさない。1 枚ごとに参考画像を配り替える
      const passes: (File | null)[] =
        usingReferences && referenceMode === 'multiply' ? references : [null];
      const perSession = count * passes.length;
      const grandTotal = perSession * sessions;

      // rotate 用の並び。山札を混ぜて配るので、参考画像が続けて同じにならない
      const rotation =
        usingReferences && referenceMode === 'rotate'
          ? buildReferenceSequence(references.length, grandTotal)
          : null;

      // 前回ぶんは破棄してから始める
      releaseUrls();
      setShots([]);
      setFailures([]);
      setExcludedIds([]);
      setCompleted(0);
      setFatalError(null);
      setTotal(grandTotal);
      setSession(1);
      setSessionTotal(sessions);
      setStopRequested(false);
      stopAfterSessionRef.current = false;
      setSavedVolume(null);
      setStatus('running');

      // デスクトップ版のときだけ、今回ぶんの巻番号を先に決めておく。
      // ブラウザでは null のままで、書き出しは行わない
      const volume = isDesktop() ? await nextVolumeNumber('gravure') : null;
      if (volume) setSavedVolume(volume);

      const controller = new AbortController();
      abortRef.current = controller;

      let consecutiveFailures = 0;
      let done = 0;
      // 何枚目か（種をずらすのに使う通し番号）
      let ordinal = 0;

      outer: for (let session = 1; session <= sessions; session += 1) {
        if (controller.signal.aborted) break;
        setSession(session);

        // 自動生成のプロンプトがあれば丸ごと差し替える。
        // 無ければテーマを足すだけ（どちらも無ければ毎回同じプロンプト）
        const generated = sessionPrompts[session - 1];
        const theme = generated ? '' : themeForSession(themes, session);
        const sessionRequest: PromptSettings = generated
          ? { ...request, prompt: generated }
          : theme
            ? { ...request, prompt: withTheme(request.prompt, theme) }
            : request;

        for (let pass = 0; pass < passes.length; pass += 1) {
          for (let i = 0; i < count; i += 1) {
            if (controller.signal.aborted) break outer;

            // rotate は通し番号で配り、multiply は pass ごとに固定する
            const rotated = rotation?.[ordinal];
            const reference = rotation
              ? references[(rotated ?? 1) - 1]
              : passes[pass];
            const referenceIndex = rotation
              ? rotated
              : passes[pass]
                ? pass + 1
                : undefined;

            const index = i + 1;
            // 同じ種だと同じ絵になるので 1 枚ずつずらす。
            // 開始シード値の指定が無ければ 1 枚ごとにランダムに選ぶ。
            const seed = seedFor(request.baseSeed, ordinal);
            ordinal += 1;

            try {
              const [url, init] = buildRequest(sessionRequest, seed, reference);

              // スタブのときも組み立ては同じところを通し、送る直前で差し替える。
              // こうすると「実際に送られるはずのもの」がそのまま記録される
              const data = isStubMode
                ? await stubGenerate(
                    promptOf(init),
                    seed,
                    sessionRequest.mode === 'img2img'
                      ? sessionRequest.img2imgModel
                      : 'stub.txt2img',
                    `${session}-${index}`,
                  )
                : await (async () => {
                    const response = await fetch(url, {
                      ...init,
                      signal: controller.signal,
                    });
                    const body = await response.json();
                    if (!response.ok) {
                      throw new Error(body?.error ?? `HTTP ${response.status}`);
                    }
                    return body;
                  })();

              // data URL のまま抱えると重いので Blob に移す
              const blob = await (await fetch(data.imageUrl)).blob();
              const objectUrl = URL.createObjectURL(blob);
              urlsRef.current.push(objectUrl);

              // 依頼した寸法と返ってきた寸法がずれることがあるので実測する
              const size = await measure(blob, request.width, request.height);

              setShots((prev) => [
                ...prev,
                {
                  id: `${Date.now()}-${session}-${pass}-${index}`,
                  index,
                  referenceIndex,
                  session,
                  theme: theme || undefined,
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

              // 既存の表示・書き出しはそのままに、ローカルフォルダへも残す。
              // 失敗しても生成は続ける（保存できないだけで絵は手元にある）
              if (volume) {
                try {
                  await saveGravureImage(volume, ordinal, blob);
                } catch (saveError) {
                  setFatalError(null);
                  console.error('ローカル保存に失敗しました', saveError);
                }
              }
            } catch (error) {
              if (controller.signal.aborted) break;

              const message =
                error instanceof Error ? error.message : '生成に失敗しました';
              setFailures((prev) => [
                ...prev,
                { index, referenceIndex, session, message },
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

        // 「このセッションで停止」はここで効く。走っているセッションは最後まで作る
        if (stopAfterSessionRef.current) break;
      }

      const wasAborted = controller.signal.aborted;
      abortRef.current = null;
      setStatus(wasAborted || stopAfterSessionRef.current ? 'cancelled' : 'done');
    },
    [releaseUrls],
  );

  /**
   * 走っているセッションだけ作り切って、次のセッションに進まない。
   * 途中で切ると中途半端な枚数になるので、区切りまでは進める。
   */
  const stopAfterSession = useCallback(() => {
    stopAfterSessionRef.current = true;
    setStopRequested(true);
  }, []);

  const toggleExcluded = useCallback((id: string) => {
    setExcludedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }, []);

  /**
   * 1 枚を一覧から取り除く。除外と違って戻せない。
   * 表示に使っていた object URL もここで手放す。
   */
  const removeShot = useCallback(
    (id: string) => {
      const target = shots.find((shot) => shot.id === id);
      if (!target) return;

      URL.revokeObjectURL(target.objectUrl);
      urlsRef.current = urlsRef.current.filter((url) => url !== target.objectUrl);

      setShots((prev) => prev.filter((shot) => shot.id !== id));
      setExcludedIds((prev) => prev.filter((item) => item !== id));
    },
    [shots],
  );

  return {
    shots,
    /** ZIP・PDF・メタデータに載せるぶん */
    includedShots: shots.filter((shot) => !excludedIds.includes(shot.id)),
    excludedIds,
    toggleExcluded,
    removeShot,
    failures,
    status,
    completed,
    total,
    fatalError,
    session,
    sessionTotal,
    stopRequested,
    savedVolume,
    start,
    cancel,
    stopAfterSession,
    reset,
    isRunning: status === 'running',
  };
}
