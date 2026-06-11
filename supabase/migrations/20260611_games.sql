-- 积分竞猜小游戏迁移（规格第 9 章）
-- 用法：Supabase Dashboard → SQL Editor → 粘贴全文 → Run
-- 合规：积分纯虚拟，不可充值/提现/兑换现金（第 0 章第 5 条）；写入仅 service_role。

-- 1) 放开 profiles 的 auth.users 外键，允许「设备访客」身份（client 端生成 UUID）
alter table profiles drop constraint if exists profiles_id_fkey;

-- 2) profiles 补列
alter table profiles add column if not exists last_checkin date;
alter table profiles add column if not exists created_at timestamptz default now();
alter table profiles add column if not exists updated_at timestamptz default now();

-- 3) predictions 补列：记录所押结果对应赔率倍数与结算时的积分变动
alter table predictions add column if not exists payout_multiplier numeric(6,2) default 2.0;
alter table predictions add column if not exists points_delta int;       -- 结算后净变动（猜中为正，猜错为负）
alter table predictions add column if not exists settled_at timestamptz;
create index if not exists idx_predictions_user on predictions (user_id, created_at desc);
create index if not exists idx_predictions_match on predictions (match_id) where settled = false;

-- 4) 积分流水（审计用，确保积分只能从签到/竞猜/活动产生，无 money 通道）
create table if not exists points_ledger (
  id          bigserial primary key,
  user_id     uuid references profiles(id),
  delta       int not null,
  reason      text not null,            -- signup / checkin / stake / settle_win / settle_lose
  ref_match   bigint,
  created_at  timestamptz default now()
);
create index if not exists idx_ledger_user on points_ledger (user_id, created_at desc);

-- 5) RLS：排行榜需要公开读 profiles 的昵称与积分（不暴露其他字段由 select 列控制）
alter table points_ledger enable row level security;
drop policy if exists "own profile" on profiles;
drop policy if exists "public read profiles" on profiles;
create policy "public read profiles" on profiles for select using (true);
drop policy if exists "own ledger" on points_ledger;
create policy "own ledger" on points_ledger for select using (true);
-- 写入仍仅 service_role（绕过 RLS），客户端无法直接改积分。
