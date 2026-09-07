# Creative Studio

漫画・小説・グラビアを AI で作る制作ツール。
Web 画面（Next.js）と、単行本を一括で作る CLI の 2 つの入口があります。

構想は [本まとめ/Creative_Studio_構想書.md](本まとめ/Creative_Studio_構想書.md) を参照。

## できること

| 入口 | 何をするか |
|------|-----------|
| Web 画面 `/manga` | 1〜5 ページの読み切りをその場で作って見る |
| Web 画面 `/novel` | 小説を 5 ステップで書く |
| Web 画面 `/gravure` | グラビアを作る |
| CLI `npm run generate manga` | 120 ページの単行本を作って Kindle 用 PDF にまとめる |

## セットアップ

```bash
npm install
```

```bash
cp .env.example .env.local
```

`.env.local` に `OPENAI_API_KEY` と `HUGGINGFACE_API_KEY` を入れれば動きます。
ほかは使う機能だけ埋めてください。

> ⚠️ `.env.local` は Git に入りません（`.gitignore` が除外）。
> 公開用の雛形は `.env.example`（値は空）です。キーは README にもコードにも書きません。

環境変数は [lib/config.ts](lib/config.ts) からだけ読み出します。雛形のままの値
（`your_..._here` など）は未設定として扱われるので、キーを入れる前でも画面は動きます。

### Web 画面を起動する

```bash
npm run dev
```

http://localhost:3000 が開きます。

### そのほかのコマンド

```bash
npm run build && npm run lint && npm run typecheck
```

---

## 単行本を作る（CLI）

```bash
npm run generate manga -- --title="定時後、君に恋をする" --pages=120 --format=kindle
```

ブラウザは使いません。進捗はコンソールに出ます。

```
📕 定時後、君に恋をする
   ページ数   : 120
   バッチ     : 10ページ × 12バッチ
   ページ規格 : 1456×2188px / 300DPI (Kindle)
   保存先     : ~/creative-studio-workspace/manga/定時後-君に恋をする-120p
   画像生成   : huggingface（stabilityai/stable-diffusion-xl-base-1.0）

✅ ストーリー分割完了: 120ページ
✅ ネーム作成 1/12: P1-P10
⏳ Batch 1/12: P1-P10 生成中... (0秒経過)
   · P  1/120 2コマ (1×2) 景色 (38秒経過)
   …
✅ すべての画像生成完了 (612枚のコマ / 120ページ、1時間12分経過)
✅ PDF 生成中...
✅ PDF 保存完了: …/output.pdf (46.2 MB)
```

### オプション

| オプション | 意味 |
|-----------|------|
| `--title=<text>` | 作品名（必須）。保存先のフォルダ名にもなる |
| `--story=<text>` | ストーリー。省略すると `--title` を題材にする |
| `--pages=<n>` | ページ数（既定 120、最大 200） |
| `--format=kindle` | 出力の規格。今は `kindle` のみ |
| `--batch-size=<n>` | 1 バッチのページ数（既定 10） |
| `--mood=<text>` | 雰囲気（シリアス / コミカル / ホラー / 幻想的 / 日常 / バトル） |
| `--backend=<name>` | 絵をどこで作るか（`huggingface` / `openai` / `stub`、既定 `huggingface`） |
| `--stub` | `--backend=stub` の短い書き方 |
| `--output=<dir>` | 置き場所の差し替え |
| `--fresh` | 前回の続きを使わず最初から作り直す |

`npm run generate manga -- --help` で同じ説明が出ます。

### 出力

```
~/creative-studio-workspace/manga/<タイトル>-<ページ数>p/
  ├─ output.pdf       Kindle 投稿用（1456×2188px / 300DPI / 50MB 以内）
  ├─ pages/page-001.png … page-120.png
  └─ metadata.json    シーン種別・コマ割り・進捗
```

### 中断と再開

途中で `Ctrl+C` を押すと、そのページを保存してから止まります。
**同じコマンドをもう一度実行すれば、出来ているページを飛ばして続きから作ります。**

ページ 1 枚ごとに `metadata.json` へ書き出しているので、
電源が落ちても、失敗したページが残っても、同じやり方で再開できます。

1 ページにつき 3 回まで作り直しを試み、それでも駄目なら
そのページを「失敗」として記録し、残りのページは作り続けます。

### まず無料で試す

120 ページを実際に生成すると時間も費用もかかります。
`--stub` を付けると画像生成を呼ばず、コマ枠だけのダミーページで
分割・バッチ・再開・PDF 化までを通して確かめられます。

```bash
npm run generate manga -- --title="お試し" --pages=120 --stub
```

出来た PDF が規格どおりか確かめる小道具もあります。

```bash
node scripts/verify-pdf.mjs "~/creative-studio-workspace/manga/お試し-120p"
```

---

## Hugging Face で画像を作る（既定）

単行本の画像生成は Hugging Face の Inference API を使います（`--backend=huggingface`、既定）。
1 枚あたり $0.005〜0.01 ほどで、OpenAI の画像モデルより一桁安く上がります。

### 1. トークンを取る

https://huggingface.co/settings/tokens で作成します（`Read` 権限で足ります）。

### 2. `.env.local` に入れる

```bash
HUGGINGFACE_API_KEY=hf_xxxxxxxxxxxxxxxxxxxx
```

### 3. 実行する

```bash
npm run generate manga -- --title="定時後、君に恋をする" --pages=120
```

流し始める前に、小さい絵を 1 枚だけ作ってキーとモデルを確かめます。
120 ページ流してから 401 で全滅するのを防ぐためです。

### 使えるモデルと提供元

旧 `api-inference`（hf-inference）は**画像生成の提供を終えています**（呼ぶと 410）。
いまは fal-ai / nscale などの提供元にルーター越しで振り分ける形です。
実際に叩いて確かめた組み合わせ:

| モデル | 提供元 | 返る画素数 | 備考 |
|---|---|---|---|
| `stabilityai/stable-diffusion-xl-base-1.0` | fal-ai | 832×1248 | 既定。1024×1536 を頼むと 1024×1344 に丸められる |
| `black-forest-labs/FLUX.1-schnell` | nscale | 1024×1536 | 高解像度。拡大率が小さいぶん仕上がりが綺麗 |
| `stabilityai/stable-diffusion-2-1` | — | — | **提供元なし。使えません** |

`HUGGINGFACE_MODEL` と `HUGGINGFACE_PROVIDER` で差し替えられます。

> モデルが眠っていると 503（起動中）、混んでいると 429 が返ります。
> どちらも待ち時間を見て自動で掛け直すので、そのまま置いておけば進みます。

### プロンプトは英語

Stable Diffusion 系は日本語をほとんど解しません。日本語で渡すと
場面を無視した「和風の絵」になってしまうので、GPT にはページごとに
**英語の画像プロンプト**（人物・場所・動作・構図・光）も書かせ、
コマ割りと画風の指定を足して SDXL に渡しています。
セリフは日本語のまま作り、PDF 側で吹き出しに描き込みます。

```
GPT（日本語で構成を考える）→ 英語の画像プロンプト → SDXL
                          ↘ 日本語のセリフ → PDF の吹き出し
```

### 費用の目安（120 ページ 1 冊）

| | 内訳 | 概算 |
|---|---|---|
| OpenAI | ストーリー・ネーム・セリフ（12 バッチ） | ¥100 前後 |
| Hugging Face | 画像 120 枚 × $0.005〜0.01 | ¥90〜180 |
| 合計 | | **¥200 前後** |

`--backend=openai` にすると画像も OpenAI で作れます。品質は上がりますが
1 冊あたり数十ドルになります。

---

## セリフと吹き出し

ストーリー・コマ割り・セリフは GPT がまとめて組み立てます（[lib/openai-client.ts](lib/openai-client.ts) の `planMangaPages`）。
10 ページずつ区切って作り、直前のページの流れを渡して話を繋げます。

セリフは **PDF の文字として** 吹き出しに描き込みます
（画像モデルに日本語を描かせると字が崩れるため、絵は文字なしで作ります）。
拡大しても綺麗で、PDF 上で検索・選択もできます。

日本語フォントは OS のものを埋め込みます（Windows は游ゴシック / メイリオ、
macOS はヒラギノ、Linux は Noto Sans CJK）。見つからないときは
吹き出しを描かず、絵だけの PDF になります。

> 吹き出しの位置は、指示したコマ割りどおりに絵が割られている前提の概算です。
> 画像モデルが違う割り方をすると、吹き出しが絵とずれることがあります。

---

## ディレクトリ

```
scripts/                CLI
 ├─ generate.ts         入口。モード（manga / gravure / novel）を振り分ける
 ├─ generate-manga.ts   漫画モードの引数解釈とコンソール出力
 ├─ cli-args.ts         --key=value の解釈
 ├─ load-env.ts         .env.local の読み込み（config より先に評価する）
 └─ verify-pdf.mjs      出来た PDF が規格どおりか確かめる

lib/
 ├─ openai-client.ts    OpenAI クライアント＋ストーリー・ネーム・セリフの生成
 ├─ huggingface-api.ts  Hugging Face の Inference API で画像を作る
 ├─ image-processor.ts  絵をどこで作るかの振り分け＋Kindle 判型への焼き直し
 ├─ pdf-generator.ts    pdfkit で PDF に組み上げ、セリフを吹き出しに描く
 ├─ kindle-book.ts      Kindle の規格・ジョブの型
 ├─ kindle-job.ts       バッチ処理・再試行・中断と再開
 ├─ kindle-workspace.ts 保存先のパスと metadata.json の読み書き
 ├─ scene-analysis.ts   シーン種別の判定（感動 / 会話 / アクション / 景色 / 表情）
 ├─ scene-blocks.ts     コマ割りの形・ページ分割・画像プロンプト
 ├─ dialogue-rendering.ts  Web 画面でセリフを吹き出しに描き込む（Canvas）
 ├─ gpt55-dialogues.ts  セリフの生成
 ├─ config.ts           環境変数の入口
 └─ …                   小説・グラビア・Supabase まわり

app/
 ├─ page.tsx            モード選択
 ├─ manga/              漫画モードの画面
 ├─ novel/              小説モードの画面
 ├─ gravure/            グラビアモードの画面
 └─ api/                画面から呼ぶ生成 API

electron/               デスクトップ版（Next のサーバーを子プロセスで立てる）
```

### 保存先

すべて `~/creative-studio-workspace/` の下に置きます。

```
~/creative-studio-workspace/
  ├─ gravure/vol-01/
  ├─ manga/<タイトル>-<ページ数>p/
  └─ novels/<シリーズ名>/vol-01/
```

## コマ割りの決め方

ストーリーを読んで場面の種類を判定し、実際の漫画と同じ基準でコマ数を決めます。

| シーン種別 | コマ数 | 狙い |
|-----------|-------|------|
| 感動 | 1〜2 | 山場を大ゴマで見せる |
| 景色 | 1〜3 | 背景を大きく見せる |
| 表情 | 3〜5 | 感情を追う |
| 会話 | 6〜8 | テンポを出す |
| アクション | 7〜9 | 動きを刻む |

縦長ページ（単行本）では列と行を入れ替えます（6 コマなら 3×2 → 2×3）。
Web 画面では「AI 自動コマ割り」を切ると 1〜9 コマから手動で選べます。

## 分かっている制約

- **コマ数は指示どおりにならないことがあります。** SDXL に「6 コマ」と伝えても
  5 コマや 3 コマで返ってくることがあり、吹き出しの位置も絵とずれます。
  コマ割りを厳密に守らせたい場合は、コマごとに別々に生成して
  こちらで組版する作りに変える必要があります。
- **元画像は 1024×1536 を 1456×2188 に引き伸ばしています。** ページの寸法は
  300DPI 準拠ですが、実解像度は約 211DPI 相当です。
- **gravure / novel モードの CLI は未実装です。** `npm run generate gravure` は
  何が足りないかを表示して終わります。

## プッシュ前のチェック

```bash
git check-ignore -v .env.local
```

```bash
git log -p --all -S "sk-proj"
```
