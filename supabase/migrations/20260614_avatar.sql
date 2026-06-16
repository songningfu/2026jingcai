-- 头像 URL 列
alter table profiles
  add column if not exists avatar_url text;
