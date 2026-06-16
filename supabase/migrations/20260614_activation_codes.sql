-- 激活码系统（替代环境变量 REDEEM_CODES）
create table if not exists activation_codes (
  id          bigserial primary key,
  code        text not null unique,          -- 激活码（大写字母+数字）
  tier        text not null,                 -- 'pro' | 'max'
  days        int not null,                  -- 有效天数
  note        text,                          -- 备注（如"QQ群用户xxx"）
  is_active   boolean default true,          -- false = 已作废
  used_at     timestamptz,                   -- 兑换时间
  used_by     uuid references profiles(id),  -- 兑换人
  created_at  timestamptz default now()
);

alter table activation_codes enable row level security;
-- 只允许 service_role 读写，用户无法直接访问
