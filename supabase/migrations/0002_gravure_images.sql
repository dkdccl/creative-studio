-- グラビアモードで生成した画像
--
-- 画像の実体は Storage の gravure-images バケットに置き、
-- このテーブルには置き場所（storage_path）と生成条件だけを持つ。
--
-- 保存する処理はまだアプリに入っていない。先に削除 API
-- （POST /api/gravure/delete-image）を通せるようにするための土台。

create extension if not exists "pgcrypto";

create table if not exists public.gravure_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- バケット内のパス。先頭フォルダは必ず user_id にする（下のポリシーがそこを見る）
  storage_path text not null unique,
  prompt text not null default '',
  job_type text not null default '',
  seed bigint,
  width integer,
  height integer,
  created_at timestamptz not null default now()
);

create index if not exists gravure_images_user_created_idx
  on public.gravure_images (user_id, created_at desc);

-- 本人の行だけ読み書きできるようにする
alter table public.gravure_images enable row level security;

create policy "gravure images are owned by the user"
  on public.gravure_images for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------

-- 非公開バケット。署名付き URL 経由でしか見せない
insert into storage.buckets (id, name, public)
values ('gravure-images', 'gravure-images', false)
on conflict (id) do nothing;

-- 「<user_id>/<ファイル名>」の形で置き、先頭フォルダが自分の id のものだけ触れる
create policy "gravure objects are readable by the owner"
  on storage.objects for select
  using (
    bucket_id = 'gravure-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "gravure objects are writable by the owner"
  on storage.objects for insert
  with check (
    bucket_id = 'gravure-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "gravure objects are updatable by the owner"
  on storage.objects for update
  using (
    bucket_id = 'gravure-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "gravure objects are deletable by the owner"
  on storage.objects for delete
  using (
    bucket_id = 'gravure-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
