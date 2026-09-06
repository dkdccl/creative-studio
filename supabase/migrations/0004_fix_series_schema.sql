-- series テーブルを 0001 の定義に合わせ直す
--
-- 0001 を流したとき、series はダッシュボードで手作りしたものが既にあり、
-- create table if not exists が黙って作成を飛ばしていた。そのため
-- novels だけが 0001 どおりに作られ、series は別の形のまま残っていた。
--
--   実際       : user_id nullable / series_name varchar / created_at timestamp / updated_at 無し
--   0001 の定義: user_id not null / series_name text    / created_at timestamptz / updated_at あり
--
-- updated_at が無いため /api/series/list は 42703 で失敗する状態だった。
-- 両テーブルとも 0 行なので、作り直さずに列を直すだけで済む。

-- 時刻はタイムゾーン付きで持つ（既存は timestamp without time zone）。
-- 0 行なので既存値の解釈は問題にならない。
alter table public.series
  alter column created_at type timestamptz using created_at at time zone 'UTC';

alter table public.series
  alter column created_at set not null,
  alter column created_at set default now();

alter table public.series
  alter column series_name type text;

alter table public.series
  alter column series_name set not null;

alter table public.series
  alter column user_id set not null;

alter table public.series
  add column if not exists updated_at timestamptz not null default now();

-- ユーザーを消したら連載も消える（0001 の意図に合わせる）
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.series'::regclass
      and contype = 'f'
      and conname = 'series_user_id_fkey'
  ) then
    alter table public.series
      add constraint series_user_id_fkey
      foreign key (user_id) references auth.users (id) on delete cascade;
  end if;
end $$;
