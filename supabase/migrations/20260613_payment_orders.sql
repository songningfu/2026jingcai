-- 购买订单表（个人收款码流程）
create table if not exists payment_orders (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  plan         text not null check (plan in ('pro','max')),
  amount       numeric(10,2) not null,
  pay_note     text,          -- 用户填的付款备注
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at   timestamptz not null default now(),
  approved_at  timestamptz
);

create index if not exists idx_payment_orders_email  on payment_orders (lower(email));
create index if not exists idx_payment_orders_status on payment_orders (status, created_at desc);
