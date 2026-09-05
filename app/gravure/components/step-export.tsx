'use client';

import { useState } from 'react';

import { buildKdpMetadata, type GravureMetadata, type GravureShot } from '@/lib/gravure';
import { downloadMetadataJson, downloadZip } from '@/lib/gravure-export';

import { Card, ErrorNote, PrimaryButton, SecondaryButton, StepShell } from './ui';

export function StepExport({
  metadata,
  shots,
}: {
  metadata: GravureMetadata;
  shots: GravureShot[];
}) {
  const [isZipping, setIsZipping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = buildKdpMetadata(metadata, shots);

  async function handleZip() {
    setIsZipping(true);
    setError(null);
    try {
      await downloadZip(metadata, shots);
    } catch (err) {
      setError(
        err instanceof Error ? `ZIP の作成に失敗しました: ${err.message}` : 'ZIP の作成に失敗しました。',
      );
    } finally {
      setIsZipping(false);
    }
  }

  return (
    <StepShell
      step={4}
      title="エクスポート"
      description="生成した画像と KDP 用メタデータを書き出します。"
    >
      <Card>
        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          <div className="flex gap-2">
            <dt className="text-violet-200/50">画像</dt>
            <dd className="font-bold text-white">{shots.length} 枚</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-violet-200/50">タイトル</dt>
            <dd className="truncate font-bold text-white">{preview.title || '未設定'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-violet-200/50">価格</dt>
            <dd className="font-bold text-white">¥{preview.price.amount}</dd>
          </div>
        </dl>
      </Card>

      <div className="flex flex-wrap gap-3">
        <PrimaryButton
          type="button"
          onClick={handleZip}
          disabled={shots.length === 0 || isZipping}
        >
          {isZipping ? 'ZIP を作成中…' : '📦 全画像を ZIP でダウンロード'}
        </PrimaryButton>

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
          未実装です。KDP には一般公開された出版用 API が無いため、現状は ZIP と JSON
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
