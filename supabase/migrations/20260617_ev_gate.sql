-- EV分析门控：首次免费，后续消耗积分
alter table profiles
  add column if not exists ev_free_used boolean not null default false;
