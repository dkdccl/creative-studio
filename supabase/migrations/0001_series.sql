-- 連載（シリーズ）と各話
--
-- 現在アプリは localStorage に保存している。Supabase を有効にしたら
-- このマイグレーションを適用し、/api/series/* と /api/novels/save を通す。

create extension if not exists "pgcrypto";

create table if not exists public.series (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  series_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.novels (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  episode integer not null check (episode >= 1),
  title text not null default '',
  content text not null default '',
  summary text not null default '',
  ending text not null default '',
  characters jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'editing', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (series_id, episode)
);

create index if not exists novels_series_episode_idx
  on public.novels (series_id, episode);

-- 本人の行だけ読み書きできるようにする
alter table public.series enable row level security;
alter table public.novels enable row level security;

create policy "series are owned by the user"
  on public.series for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "novels are owned by the user"
  on public.novels for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
