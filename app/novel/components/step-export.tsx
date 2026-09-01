'use client';

import { useMemo, useState } from 'react';

import {
  buildManuscript,
  buildProjectMarkdown,
  countChars,
  downloadTextFile,
  toSafeFileName,
} from '@/lib/novel-export';
import {
  bookFileName,
  buildDocx,
  buildEpub,
  buildImagesZip,
  downloadBlob,
} from '@/lib/novel-export-files';
import type { NovelProject } from '@/lib/types';
import { Button, Card, StepShell } from './ui';

type Format = 'txt' | 'epub' | 'docx' | 'zip';

const FORMATS: {
  id: Format;
  label: string;
  lead: string;
  note: string;
}[] = [
  {
    id: 'txt',
    label: '.txt（テキスト）',
    lead: '本文のみのプレーンテキスト',
    note: '画像は含みません',
  },
  {
    id: 'epub',
    label: '.epub（Kindle で読める）',
    lead: 'テキスト + 画像を含む',
    note: 'Kindle へメール送信して読めます',
  },
  {
    id: 'docx',
    label: '.docx（Word）',
    lead: 'テキスト + 画像を含む',
    note: 'Word で編集・調整できます',
  },
  {
    id: 'zip',
    label: '.zip（ページ画像）',
    lead: '挿入した画像をまとめて出力',
    note: 'SNS やブログに使えます',
  },
];

export function StepExport({
  project,
  onSaveEpisode,
}: {
  project: NovelProject;
  /** 連載情報（話数・あらすじ・登場人物・エンディング）を記録する */
  onSaveEpisode: () => { ok: boolean; message: string };
}) {
  const [selected, setSelected] = useState<Format[]>(['txt', 'epub']);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saveResult, setSaveResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const manuscript = useMemo(() => buildManuscript(project), [project]);

  const totalChars = useMemo(
    () => project.scenes.reduce((sum, s) => sum + countChars(s.body), 0),
    [project.scenes],
  );
  const writtenScenes = project.scenes.filter(
    (s) => countChars(s.body) > 0,
  ).length;
  const imageCount = project.scenes.reduce(
    (sum, scene) =>
      sum +
      scene.blocks.reduce(
        (n, block) => n + (block.kind === 'manga' ? 1 : block.photos.length),
        0,
      ),
    0,
  );

  const toggle = (format: Format) =>
    setSelected((current) =>
      current.includes(format)
        ? current.filter((f) => f !== format)
        : [...current, format],
    );

  /** 1 形式ぶん書き出す。戻り値は結果メッセージ */
  const exportOne = async (format: Format): Promise<string> => {
    switch (format) {
      case 'txt': {
        downloadTextFile(bookFileName(project, 'txt'), manuscript);
        return '.txt';
      }
      case 'epub': {
        const { blob, skippedImages } = await buildEpub(project);
        downloadBlob(bookFileName(project, 'epub'), blob);
        return skippedImages > 0
          ? `.epub（画像 ${skippedImages} 点は取得できず除外）`
          : '.epub';
      }
      case 'docx': {
        const { blob, skippedImages } = await buildDocx(project);
        downloadBlob(bookFileName(project, 'docx'), blob);
        return skippedImages > 0
          ? `.docx（画像 ${skippedImages} 点は取得できず除外）`
          : '.docx';
      }
      case 'zip': {
        const { blob, count, skippedImages } = await buildImagesZip(project);
        downloadBlob(bookFileName(project, 'zip'), blob);
        return skippedImages > 0
          ? `.zip（画像 ${count} 点／${skippedImages} 点は取得できず除外）`
          : `.zip（画像 ${count} 点）`;
      }
    }
  };

  const run = async (formats: Format[]) => {
    if (formats.length === 0) {
      setMessage('形式を 1 つ以上選んでください。');
      return;
    }
    setMessage(null);
    const done: string[] = [];
    try {
      for (const format of formats) {
        setBusy(format);
        done.push(await exportOne(format));
      }
      setMessage(`ダウンロードしました：${done.join(' / ')}`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `書き出しに失敗しました：${error.message}`
          : '書き出しに失敗しました。',
      );
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(manuscript);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <StepShell
      step={5}
      title="エクスポート"
      description="書き上げた原稿をファイルとして書き出します。"
    >
      {/* 連載として保存 */}
      <div className="rounded-2xl border border-blue-400/25 bg-blue-950/30 p-5">
        <p className="text-sm font-bold text-blue-50">連載として保存</p>
        <p className="mt-1 text-xs text-blue-100/50">
          第{project.serial.episode}
          話として、あらすじ（最初の100字）・登場人物・エンディング（最後の50字）を自動で記録します。
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={() => setSaveResult(onSaveEpisode())}>
            この話を保存する
          </Button>
          {saveResult && (
            <span
              className={`text-xs ${
                saveResult.ok ? 'text-blue-200/70' : 'text-red-300'
              }`}
            >
              {saveResult.message}
            </span>
          )}
        </div>
      </div>

      {/* 統計 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="総文字数" value={`${totalChars.toLocaleString()} 字`} />
        <Stat label="原稿用紙" value={`約 ${Math.ceil(totalChars / 400)} 枚`} />
        <Stat
          label="執筆済シーン"
          value={`${writtenScenes} / ${project.scenes.length}`}
        />
        <Stat label="画像" value={`${imageCount} 点`} />
      </div>

      {/* 形式選択 */}
      <div>
        <p className="text-sm font-bold text-blue-50">
          本のタイトル：
          <span className="ml-1 font-normal text-white">
            『{project.theme.title.trim() || '無題'}』
          </span>
        </p>

        <p className="mb-2 mt-4 text-sm font-bold text-blue-50">
          エクスポート形式を選択
        </p>
        <div className="space-y-2">
          {FORMATS.map((format) => {
            const checked = selected.includes(format.id);
            return (
              <div
                key={format.id}
                className={`flex flex-wrap items-center gap-3 rounded-xl border-2 px-4 py-3 transition-colors ${
                  checked
                    ? 'border-blue-400 bg-blue-500/15'
                    : 'border-blue-400/20 bg-blue-950/30'
                }`}
              >
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(format.id)}
                    className="h-4 w-4 shrink-0 accent-blue-500"
                    aria-label={format.label}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-white">
                      {format.label}
                    </span>
                    <span className="block text-xs text-blue-100/50">
                      {format.lead}・{format.note}
                    </span>
                  </span>
                </label>
                <Button
                  variant="ghost"
                  onClick={() => run([format.id])}
                  disabled={busy !== null}
                  className="shrink-0 px-3 py-1.5 text-xs"
                >
                  {busy === format.id ? '作成中…' : '個別に'}
                </Button>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={() => run(selected)} disabled={busy !== null}>
            {busy ? '作成中…' : `選択した ${selected.length} 形式をダウンロード`}
          </Button>
          <Button
            variant="ghost"
            onClick={() => run(FORMATS.map((f) => f.id))}
            disabled={busy !== null}
          >
            全てダウンロード
          </Button>
          <Button variant="ghost" onClick={copy} disabled={busy !== null}>
            {copied ? '✅ コピーしました' : '📋 本文をコピー'}
          </Button>
        </div>

        {message && (
          <p className="mt-3 text-xs text-blue-200/70">{message}</p>
        )}
        <p className="mt-2 text-[11px] text-white/40">
          ファイルはブラウザ内で生成します。企画書つきの Markdown が必要なときは下のプレビューからコピーしてください。
        </p>
      </div>

      {/* プレビュー */}
      <details className="rounded-2xl border border-blue-400/20 bg-blue-950/20">
        <summary className="cursor-pointer px-5 py-3 text-sm font-bold text-blue-50">
          本文プレビュー
        </summary>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words px-5 pb-5 text-sm leading-7 text-blue-50/90">
          {manuscript}
        </pre>
      </details>

      <details className="rounded-2xl border border-blue-400/20 bg-blue-950/20">
        <summary className="cursor-pointer px-5 py-3 text-sm font-bold text-blue-50">
          企画書つき Markdown
        </summary>
        <div className="px-5 pb-5">
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm leading-7 text-blue-50/90">
            {buildProjectMarkdown(project)}
          </pre>
          <Button
            variant="ghost"
            className="mt-3"
            onClick={() =>
              downloadTextFile(
                `${toSafeFileName(project.theme.title)}.md`,
                buildProjectMarkdown(project),
              )
            }
          >
            .md をダウンロード
          </Button>
        </div>
      </details>
    </StepShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4 text-center">
      <p className="text-xs text-blue-200/50">{label}</p>
      <p className="mt-1 text-lg font-bold text-white">{value}</p>
    </Card>
  );
}
