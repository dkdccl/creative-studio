-- series.user_id の参照先を auth.users に直す
--
-- 手作りされていた series には、同名（series_user_id_fkey）で
-- public.users を指す外部キーが既に付いていた。そのため 0004 の
-- 「無ければ足す」判定が既存のものを見つけてしまい、参照先が
-- public.users のまま残っていた。
--
-- public.users は空のプロフィール表なので、ログイン済みでも
-- insert が外部キー違反で弾かれる状態だった。
-- novels.user_id は 0001 で auth.users を指しているため、
-- series も揃えないと両表で参照先が食い違う。

alter table public.series
  drop constraint if exists series_user_id_fkey;

alter table public.series
  add constraint series_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;
