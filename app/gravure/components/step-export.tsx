'use client';

import { useState } from 'react';

import { buildKdpMetadata, type GravureMetadata, type GravureShot } from '@/lib/gravure';
import { downloadMetadataJson, downloadPdf, downloadZip } from '@/lib/gravure-export';
import {
  DEFAULT_PDF_OPTIONS,
  TARGET_DPI,
  a4Dpi,
  nativePageMillimeters,
  type PdfPageMode,
} from '@/lib/gravure-pdf';

import { Card, ErrorNote, PrimaryButton, SecondaryButton, StepShell } from './ui';

export function StepExport({
  metadata,
  shots,
}: {
  metadata: GravureMetadata;
  shots: GravureShot[];
}) {
  const [busy, setBusy] = useState<'zip' | 'pdf' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageMode, setPageMode] = useState<PdfPageMode>(DEFAULT_PDF_OPTIONS.pageMode);
  const [upscale, setUpscale] = useState(DEFAULT_PDF_OPTIONS.upscaleToTargetDpi);
  const [lastPdfDpi, setLastPdfDpi] = useState<number | null>(null);

  const preview = buildKdpMetadata(metadata, shots);

  // どのページも同じ設定で作っているので、1 枚目を代表に見せる
  const sample = shots[0];
  const nativeSize = sample
    ? nativePageMillimeters(sample.width, sample.height)
    : null;
  const a4EffectiveDpi = sample ? Math.round(a4Dpi(sample.width, sample.height)) : 0;
  const a4NeedsUpscale = a4EffectiveDpi < TARGET_DPI;

  async function run(kind: 'zip' | 'pdf') {
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'zip') {
        await downloadZip(metadata, shots);
      } else {
        const result = await downloadPdf(metadata, shots, {
          pageMode,
          upscaleToTargetDpi: upscale,
        });
        setLastPdfDpi(result.minDpi);
      }
    } catch (err) {
      const label = kind === 'zip' ? 'ZIP' : 'PDF';
      setError(
        err instanceof Error
          ? `${label} の作成に失敗しました: ${err.message}`
          : `${label} の作成に失敗しました。`,
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <StepShell
      step={4}
      title="エクスポート"
      description="生成した画像と KDP 用メタデータを書き出します。"
    >
      {/* 画像が無いとボタンが全部 disabled になる。押しても無反応に見えるので理由を出す */}
      {shots.length === 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 px-4 py-3">
          <p className="text-sm font-bold text-amber-100">
            書き出せる画像がありません
          </p>
          <p className="mt-1 text-xs text-amber-100/70">
            ダウンロードボタンは画像が 1 枚以上できてから押せるようになります。
            ステップ 2 に戻って一括生成を実行してください。
          </p>
        </div>
      )}

      <Card>
        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          <div className="flex gap-2">
            <dt className="text-violet-200/50">画像</dt>
            <dd className="font-bold text-white">{shots.length} 枚</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-violet-200/50">画素数</dt>
            <dd className="font-bold text-white">
              {sample ? `${sample.width}×${sample.height}` : '—'}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-violet-200/50">価格</dt>
            <dd className="font-bold text-white">¥{preview.price.amount}</dd>
          </div>
        </dl>
      </Card>

      {/* ---- JPEG ---- */}
      <div>
        <h3 className="mb-2 text-sm font-bold text-violet-50">JPEG</h3>
        <PrimaryButton
          type="button"
          onClick={() => run('zip')}
          disabled={shots.length === 0 || busy !== null}
        >
          {busy === 'zip' ? 'ZIP を作成中…' : '🖼 JPEG を ZIP でダウンロード'}
        </PrimaryButton>
        <p className="mt-2 text-xs text-violet-200/40">
          Prodia から受け取った JPEG をそのまま入れます（再エンコードしません）。
        </p>
      </div>

      {/* ---- PDF ---- */}
      <div>
        <h3 className="mb-2 text-sm font-bold text-violet-50">PDF（Amazon KDP 用）</h3>

        <fieldset className="mb-3">
          <legend className="sr-only">ページサイズ</legend>
          <div className="flex flex-col gap-2">
            <label className="flex cursor-pointer gap-3 rounded-xl border border-violet-400/20 bg-black/25 px-4 py-3 transition hover:border-violet-400/50">
              <input
                type="radio"
                name="page-mode"
                checked={pageMode === 'native-300dpi'}
                onChange={() => setPageMode('native-300dpi')}
                className="mt-0.5 h-4 w-4 shrink-0 accent-violet-500"
              />
              <span>
                <span className="block text-sm font-bold text-violet-50">
                  画像サイズに合わせる（{TARGET_DPI} DPI）
                </span>
                <span className="mt-0.5 block text-xs text-violet-200/50">
                  画素数から用紙サイズを逆算するので、補間なしでちょうど {TARGET_DPI} DPI
                  になります
                  {nativeSize && `（約 ${nativeSize.width}×${nativeSize.height} mm）`}。
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer gap-3 rounded-xl border border-violet-400/20 bg-black/25 px-4 py-3 transition hover:border-violet-400/50">
              <input
                type="radio"
                name="page-mode"
                checked={pageMode === 'a4'}
                onChange={() => setPageMode('a4')}
                className="mt-0.5 h-4 w-4 shrink-0 accent-violet-500"
              />
              <span>
                <span className="block text-sm font-bold text-violet-50">A4</span>
                <span className="mt-0.5 block text-xs text-violet-200/50">
                  210×297 mm。今の画素数だと実効{' '}
                  <strong className={a4NeedsUpscale ? 'text-amber-300' : 'text-violet-100'}>
                    約 {a4EffectiveDpi} DPI
                  </strong>{' '}
                  です。
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        {pageMode === 'a4' && a4NeedsUpscale && (
          <div className="mb-3 rounded-xl border border-amber-500/40 bg-amber-950/20 px-4 py-3">
            <p className="text-xs text-amber-100/80">
              A4 では {TARGET_DPI} DPI に届きません。届かせるには{' '}
              {Math.ceil((sample?.width ?? 0) * (TARGET_DPI / Math.max(1, a4EffectiveDpi)))}
              px 幅の元画像が必要ですが、FLUX.2 の上限は 1920px です。
            </p>
            <label className="mt-2 flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={upscale}
                onChange={(e) => setUpscale(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-amber-500"
              />
              <span className="text-xs text-amber-100/80">
                引き伸ばして {TARGET_DPI} DPI にする（水増しであって、細部が増えるわけでは
                ありません）
              </span>
            </label>
          </div>
        )}

        <PrimaryButton
          type="button"
          onClick={() => run('pdf')}
          disabled={shots.length === 0 || busy !== null}
        >
          {busy === 'pdf' ? 'PDF を作成中…' : '📕 PDF をダウンロード'}
        </PrimaryButton>

        {lastPdfDpi !== null && (
          <p className="mt-2 text-xs text-violet-200/60">
            書き出した PDF の実効解像度: <strong>{lastPdfDpi} DPI</strong>（{shots.length}{' '}
            ページ）
          </p>
        )}
      </div>

      {/* ---- メタデータ ---- */}
      <div>
        <h3 className="mb-2 text-sm font-bold text-violet-50">メタデータ</h3>
        <SecondaryButton
          type="button"
          onClick={() => downloadMetadataJson(metadata, shots)}
          disabled={shots.length === 0}
        >
          🗂 メタデータを JSON でダウンロード
        </SecondaryButton>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div>
        <SecondaryButton type="button" disabled title="未実装">
          ⬆ Amazon KDP へ直接アップロード
        </SecondaryButton>
        <p className="mt-2 text-xs text-violet-200/40">
          未実装です。KDP には一般公開された出版用 API が無いため、現状は PDF と JSON
          を書き出して KDP の管理画面から手動で登録してください。
        </p>
      </div>

      <details className="rounded-xl border border-violet-400/20 bg-black/25 px-4 py-3">
        <summary className="cursor-pointer text-sm font-bold text-violet-100">
          書き出される JSON を確認
        </summary>
        <pre className="mt-3 max-h-80 overflow-auto text-xs text-violet-100/70">
          {JSON.stringify(preview, null, 2)}
        </pre>
      </details>

      <Card className="border-violet-400/30">
        <h3 className="text-sm font-bold text-white">ZIP の中身</h3>
        <ul className="mt-2 space-y-1 text-xs text-violet-200/60">
          <li>
            <code className="text-violet-100">images/gravure-001.jpg</code> … 連番の画像
          </li>
          <li>
            <code className="text-violet-100">kdp-metadata.json</code> … KDP 登録用の情報
          </li>
          <li>
            <code className="text-violet-100">DISCLAIMER.txt</code> … 必須免責事項
          </li>
        </ul>
      </Card>
    </StepShell>
  );
}
