-- 邮箱账号登录：在设备访客（profiles.id = device-id）基础上挂账号身份。
-- 不改 profiles 主键，账号信息以列的形式附加，登录后前端把 device-id 复用为账号 profile id。

alter table profiles
  add column if not exists email        text,
  add column if not exists auth_user_id uuid;

-- 一个邮箱/Auth 用户唯一对应一个 profile
create unique index if not exists idx_profiles_email
  on profiles (lower(email)) where email is not null;
create unique index if not exists idx_profiles_auth_user
  on profiles (auth_user_id) where auth_user_id is not null;
