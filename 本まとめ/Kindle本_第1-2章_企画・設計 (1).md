# 第 1-2 章：企画・設計

## Chapter 1: アプリ企画の立ち上げ

### 1.1 ユーザーニーズの分析

「Creative Studio」を企画する際、最初に考えたことは **「何を課題に解決するのか」** です。

#### 課題の発見

```
観察：クリエイター志望者の悩み
├─ 漫画を描きたいが、デジタル化に時間がかかる
├─ 小説を書きたいが、キャラクター設定が曖昧になりやすい
├─ 両方やりたいが、それぞれ異なるツールを使う必要がある
└─ 手作業が多く、本当の創作に時間が使えない
```

#### ソリューション

```
1 つのアプリで両方の制作をサポート
├─ 漫画：ラフ → DALL-E で自動生成 → プレビュー
├─ 小説：企画 → 執筆 → 推敲を一括管理
└─ 両方のプロジェクトを一つのダッシュボードで管理
```

---

### 1.2 ユーザーペルソナの定義

```
名前：田中太郎（25 歳）
背景：大学卒業後、会社員
目標：副業でクリエイティブ活動を始めたい

課題：
├─ 平日は忙しいので、短い時間で制作したい
├─ ツールの学習に時間を使いたくない
├─ 無料 or 安い価格で始めたい
└─ 制作プロセスを効率化したい

使用シーン：
├─ 休日に 2-3 時間で漫画を 1 ページ作成
├─ 通勤時間に小説を 500 文字執筆
└─ 月 1 回のペースで Kindle に出版
```

---

### 1.3 機能要件の定義

#### MVP（Minimum Viable Product）時点での要件

```
【優先度：高】

漫画制作：
├─ ラフ画像アップロード
├─ DALL-E で画像自動生成
└─ プレビュー + ダウンロード

小説制作：
├─ テキストエディタ
├─ 文字数カウント
└─ エクスポート（.txt）

共通：
├─ ユーザー認証（ログイン / サインアップ）
├─ プロジェクト保存
└─ マイページ
```

#### 優先度：中（Phase 2 以降）

```
├─ キャラクター管理機能
├─ プロット自動生成（AI）
├─ ソーシャル機能（共有）
└─ 有料版（プレミアム機能）
```

---

## Chapter 2: 技術選定とアーキテクチャ

### 2.1 なぜ Next.js？

#### 検討した選択肢

```
1. Next.js（採用 ✅）
2. React + Express
3. Vue.js + Node.js
4. Django + React
```

#### 選んだ理由

```
✅ フロント・バックを 1 つの言語（JavaScript/TypeScript）で書ける
  └─ 開発効率が圧倒的に高い

✅ API Routes で簡単にバックエンド実装
  └─ /api/ フォルダに .ts ファイルを置くだけで API が完成

✅ Vercel による簡単デプロイ
  └─ git push で自動デプロイ、本番環境の心配が少ない

✅ Server-Side Rendering（SSR）対応
  └─ SEO に強い、初期表示が高速

✅ エコシステムが豊富
  └─ Tailwind CSS、SWR、zustand など便利なライブラリが多い
```

---

### 2.2 なぜ Supabase？

#### 検討した選択肢

```
1. Supabase（採用 ✅）
2. Firebase（Google）
3. PlanetScale（MySQL）
4. PostgreSQL（自分でホスティング）
```

#### 選んだ理由

```
✅ PostgreSQL ベース（SQL が書ける）
  └─ 複雑なクエリに対応でき、将来的に拡張性が高い

✅ 認証機能が組み込み
  └─ Supabase Auth で JWT トークン管理が自動

✅ リアルタイムデータ同期
  └─ 複数ユーザーの同時編集に対応可能

✅ Storage 機能
  └─ 画像、ファイル保存を簡単に管理できる

✅ 開発環境と本番環境を分離可能
  └─ Docker でローカル開発が可能

✅ 無料枠が充実
  └─ 月額数千円で本番運用可能
```

---

### 2.3 なぜ OpenAI DALL-E？

#### 検討した選択肢

```
1. DALL-E（OpenAI）（採用 ✅）
2. Stable Diffusion
3. Google Imagen
4. 手動で画像を探す
```

#### 選んだ理由

```
✅ 精度が高い
  └─ テキストから日本語で詳細な画像を生成できる

✅ API が簡単
  └─ JSON リクエストで画像生成できる

✅ サポートが充実
  └─ 日本語ドキュメント、コミュニティが活発

✅ エラーハンドリングが明確
  └─ API エラーの対応が単純

❌ 欠点：課金
  └─ 画像生成のたびに課金
  └─ 対策：ユーザー側が API キー登録 or フリーティア制限
```

---

### 2.4 全体アーキテクチャ図

```
【ユーザー】
    ↓ HTTPS
【Vercel（Next.js）】
    ├─ フロントエンド
    │  ├─ /app/page.tsx（モード選択）
    │  ├─ /app/manga/page.tsx
    │  └─ /app/novel/page.tsx
    │
    └─ バックエンド（API Routes）
       ├─ /api/auth/*.ts
       ├─ /api/manga/generate.ts → OpenAI
       ├─ /api/novel/save.ts → Supabase
       └─ /api/projects/*.ts

         ↓ HTTPS

【Supabase（PostgreSQL）】
    ├─ users テーブル
    ├─ manga_projects テーブル
    ├─ manga_images テーブル
    ├─ novel_projects テーブル
    └─ characters テーブル

         ↓ HTTPS

【OpenAI API】
    └─ DALL-E（画像生成）
```

---

### 2.5 DALL-E 連携の設計思想

#### なぜ DALL-E をアプリに統合するのか？

```
問題：ユーザーが手動で画像を探すのは時間がかかる
解決：テキストの説明から自動で画像を生成

メリット：
✅ ユーザーが「すぐに完成イメージ」を見られる
✅ 何度も生成し直して、好みに合わせることができる
✅ 創作に集中できる
```

#### 実装の流れ

```
ユーザー入力
「金髪のツインテール少女、青い着物、微笑み」
    ↓
フロント：入力値を収集
    ↓
バックエンド（/api/manga/generate.ts）：
├─ OPENAI_API_KEY で認証
├─ 入力値を DALL-E プロンプトに変換
├─ OpenAI API に POST リクエスト
└─ 画像 URL を取得
    ↓
フロント：画像を表示
    ↓
ユーザー：「保存する」ボタン
    ↓
Supabase に画像 URL を保存
```

---

## Chapter 2 のコード例

### 環境構築の手順

```bash
# 1. Node.js 18+ がインストール済みか確認
node --version

# 2. Next.js プロジェクト作成
npx create-next-app@latest creative-studio \
  --typescript \
  --tailwind \
  --eslint

# 3. 依存パッケージのインストール
cd creative-studio

npm install @supabase/supabase-js
npm install @supabase/auth-helpers-nextjs
npm install openai

# 4. 環境変数ファイルを作成
cat > .env.local << EOF
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxxx

SUPABASE_SERVICE_ROLE_KEY=xxxxx

OPENAI_API_KEY=sk-proj-xxxxx

NODE_ENV=development
EOF
```

---

### Supabase 初期セットアップ

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// サーバー側用（Admin 権限）
export const supabaseAdmin = createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)
```

---

### DALL-E API 連携の基本

```typescript
// lib/openai.ts
import { OpenAI } from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function generateImage(prompt: string) {
  try {
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt: prompt,
      n: 1,
      size: '1024x1024',
    })

    return response.data[0].url
  } catch (error) {
    console.error('DALL-E Error:', error)
    throw new Error('Image generation failed')
  }
}
```

---

### API Route の実装例

```typescript
// app/api/manga/generate.ts
import { NextRequest, NextResponse } from 'next/server'
import { generateImage } from '@/lib/openai'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { prompt, projectId, userId } = await request.json()

    // 1. DALL-E で画像生成
    const imageUrl = await generateImage(prompt)

    // 2. Supabase に保存
    const { data, error } = await supabase
      .from('manga_images')
      .insert([
        {
          project_id: projectId,
          user_id: userId,
          image_url: imageUrl,
          prompt: prompt,
          created_at: new Date(),
        },
      ])

    if (error) throw error

    return NextResponse.json({
      success: true,
      imageUrl: imageUrl,
      data: data,
    })
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: 'Failed to generate image' },
      { status: 500 }
    )
  }
}
```

---

### Supabase テーブル作成（SQL）

```sql
-- users テーブル
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- manga_projects テーブル
CREATE TABLE manga_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- manga_images テーブル
CREATE TABLE manga_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES manga_projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  image_url TEXT,
  prompt TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index の作成（パフォーマンス最適化）
CREATE INDEX idx_manga_projects_user_id ON manga_projects(user_id);
CREATE INDEX idx_manga_images_project_id ON manga_images(project_id);
```

---

### 実装時の注意点

```typescript
// ❌ やってはいけない
// .env に平文で API キーを書く
const apiKey = 'sk-proj-xxxxx'

// ✅ やるべき
// バックエンド（API Route）でのみ API キーを使用
// フロントエンドから直接 API を呼ばない

// ✅ セキュアなエラーハンドリング
try {
  // DALL-E 呼び出し
} catch (error) {
  // エラーをログに記録（本番環境では外部ロギングサービス使用）
  console.error(error)
  
  // ユーザーには詳細を返さない
  return NextResponse.json(
    { error: 'Image generation failed' },
    { status: 500 }
  )
}
```

---

## この章の要点

✅ ユーザーニーズから技術を選んだ（逆ではない）

✅ Next.js + Supabase + DALL-E の組み合わせが最適

✅ API キーのセキュリティに気をつける

✅ エラーハンドリングは実装時に重要

---

**次章では、フロントエンド実装を詳しく解説します。**

---

**執筆者：atugi**  
**2026 年 9 月**
