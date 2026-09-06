-- 取っておく参考画像（img2img でアップロードしたもののうち、役に立ったもの）
--
-- 生成画像は保存しない方針なので、容量を使うのはここに明示的に残した
-- ぶんだけになる。実体は gravure-images バケットの
-- 「<user_id>/references/<uuid>.jpg」に置く。先頭フォルダが user_id なので、
-- 0002 で作った Storage のポリシーがそのまま効き、新しいポリシーは要らない。

create table if not exists public.gravure_references (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null unique,
  -- 一覧で見分けるための元のファイル名
  file_name text not null default '',
  content_type text not null default 'image/jpeg',
  -- 使用量を画面に出すために持つ
  byte_size integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists gravure_references_user_created_idx
  on public.gravure_references (user_id, created_at desc);

alter table public.gravure_references enable row level security;

create policy "gravure references are owned by the user"
  on public.gravure_references for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
