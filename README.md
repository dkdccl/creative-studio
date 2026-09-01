# Creative Studio

漫画と小説の両方を制作できる統合 Web アプリ。構想は [本まとめ/Creative_Studio_構想書.md](本まとめ/Creative_Studio_構想書.md) を参照。

## 技術構成

| 層 | 技術 |
|----|------|
| フロント | Next.js 14 (App Router) + React 18 + TypeScript |
| スタイル | Tailwind CSS 3.4 |
| 認証 / DB | Supabase (`@supabase/ssr`) |
| 画像生成 | OpenAI DALL-E |

## セットアップ方法

1. 依存パッケージをインストール

```bash
npm install
```

2. 環境変数ファイルを作る

```bash
cp .env.example .env.local
```

3. `.env.local` に各 API キーを設定（`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `OPENAI_API_KEY`）

> ⚠️ **重要**：`.env.local` は Git にコミットしないこと。`.gitignore` が自動的に除外します。
> 公開用の雛形は `.env.example`（値は空）です。キーそのものは README にもコードにも書きません。

環境変数は `lib/config.ts` からだけ読み出します。雛形のままの値（`your_..._here` など）は
未設定として扱われるので、キーを入れる前でも画面は動きます。

4. 起動

```bash
npm run dev
```

### 本番（Vercel）

コードにキーを含めず、Vercel の Project Settings → Environment Variables に
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
`SUPABASE_SERVICE_ROLE_KEY` / `OPENAI_API_KEY` を登録します。

### プッシュ前のチェック

```bash
git check-ignore -v .env.local
```

```bash
git log -p --all -S "sk-proj"
```

http://localhost:3000 でモード選択画面が開きます。
キーが未設定でも画面表示・画面遷移は動作します（API 呼び出し時にエラーになります）。

その他のコマンド：`npm run build` / `npm run start` / `npm run lint` / `npm run typecheck`

## ディレクトリ

```
app/
 ├─ layout.tsx          ルートレイアウト（メタデータ・globals.css）
 ├─ page.tsx            トップページ（SelectMode を表示）
 ├─ select-mode.tsx     モード選択画面のコンポーネント
 ├─ globals.css         Tailwind エントリ
 ├─ api/manga/generate/route.ts  DALL-E 呼び出し
 ├─ manga/
 │  ├─ page.tsx         /manga ルート
 │  └─ components/generator-card.tsx  ページ数・雰囲気・生成
 └─ novel/
    ├─ page.tsx         /novel ルート（メタデータ）
    ├─ novel-studio.tsx 5 ステップの状態管理・自動保存
    └─ components/      stepper / step-theme / step-characters
                        / step-plot / step-editor / step-export / ui
                        / page-count-picker / modal-shell
                        / manga-scene-card / manga-scene-insert-modal
                        / photo-scene-card / photo-scene-insert-modal
                        / delete-confirm-modal / use-undo-redo
lib/
 ├─ types.ts            小説プロジェクトの型・定数
 ├─ scene-blocks.ts     本文マーカー・ページ構成・生成プロンプト
 ├─ image.ts            写真の縮小（data URL 化）
 ├─ novel-storage.ts    下書きの localStorage 保存
 ├─ novel-export.ts     原稿の組版（.txt / .md）とダウンロード
 ├─ supabase.ts         ブラウザ用 Supabase クライアント + 認証ヘルパー
 ├─ supabase-server.ts  サーバー用 Supabase クライアント（Cookie セッション）
 └─ openai.ts           DALL-E クライアント + generateImage()
index.html              初期プロトタイプ（Next.js からは未使用）
```

## ビジュアル挿入の仕様

- コマ割りは **1ページ = 6コマ（3x2）固定**。ページ数だけを選ぶ（プリセット：短編 1-2 / 中編 4-6 / 長編 8-12、またはカスタム 1〜50）。
- 本文には `[🎨 漫画シーン N]` / `[📸 写真シーン N]` のマーカーだけを差し込み、画像は `Scene.blocks` に持つ。
- 画像を削除してもマーカーは本文に残る（残ったマーカーはエディタ上で警告表示）。
- DALL-E へ送るプロンプト：`${story}、${pages}ページ分、1ページ6コマ(3x2)、${mood}`
- 写真は長辺 900px の JPEG に縮小して localStorage に保存する。

## ルーティング

| パス | 画面 |
|------|------|
| `/` | モード選択（ランディング） |
| `/manga` | 漫画制作画面（ページ数・雰囲気を選んで生成） |
| `/novel` | 小説制作画面（5 ステップ） |

`app/select-mode.tsx` は App Router のルートにはならないため、`app/page.tsx` から呼び出してトップページとして表示しています。

## 次のステップ

1. ページごとの逐次生成（DALL-E は 1 リクエスト 1 枚のため、現状は 1 枚にまとめて生成している）
2. 生成画像の永続化（DALL-E の URL は期限付き。Supabase Storage へ保存する）
3. ログイン画面（`app/(auth)/login`）と `middleware.ts` でのセッション更新
4. Supabase のテーブル作成（`novel_projects` ほか）と、`lib/novel-storage.ts` の保存先を localStorage から差し替え
5. 小説の .docx エクスポート
