-- 邀请码系统
-- profiles 加两列：invite_code（我的邀请码）、invited_by（我用了谁的码）
alter table profiles
  add column if not exists invite_code text unique,
  add column if not exists invited_by  text;  -- 邀请者的 device_id（uuid）

-- 防止同一设备重复兑换（已由 invited_by 列非空保证），额外建唯一索引保平安
create unique index if not exists profiles_invited_by_notnull
  on profiles (id)
  where invited_by is not null;

-- 邀请流水（追踪谁邀请了谁，方便未来统计）
create table if not exists invite_events (
  id           bigserial primary key,
  inviter_id   uuid not null references profiles(id),
  invitee_id   uuid not null references profiles(id),
  created_at   timestamptz default now(),
  unique(invitee_id)  -- 一个被邀请者只能被记录一次
);

alter table invite_events enable row level security;
-- 写入走服务端 service_role，无需客户端 policy
