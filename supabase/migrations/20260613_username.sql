-- 用户名登录（无需邮箱）：profiles 加 username 列，用于用户名+密码注册/登录。
-- 内部邮箱格式：qiuyi_{username}@internal.qiuyi.app（用户不可见）。

alter table profiles
  add column if not exists username text;

create unique index if not exists idx_profiles_username
  on profiles (lower(username)) where username is not null;
