-- シリーズを小説と漫画で分ける
--
-- 0001 の series / novels をそのまま使い、種別と説明だけ足す。
-- 同じ目的のテーブルを別に作ると、どちらを使うかがコードごとに
-- 分かれてしまうため、列の追加で済ませる。

alter table public.series
  add column if not exists type text not null default 'novel',
  add column if not exists description text not null default '';

-- 'novel' / 'manga' 以外が入らないようにする
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'series_type_check'
  ) then
    alter table public.series
      add constraint series_type_check check (type in ('novel', 'manga'));
  end if;
end $$;

-- 一覧は種別ごとに新しい順で引く
create index if not exists series_user_type_updated_idx
  on public.series (user_id, type, updated_at desc);
