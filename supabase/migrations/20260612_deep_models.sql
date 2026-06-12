-- 深度推演多模型支持（真正按所选大模型生成，不冒充）
-- 用法：Supabase Dashboard → SQL Editor → 粘贴 → Run

-- 1) 解锁记录加「模型」维度：同一场不同模型分别解锁
alter table unlocks add column if not exists model_id text;
alter table unlocks drop constraint if exists unlocks_user_id_match_id_key;
create unique index if not exists idx_unlocks_user_match_model
  on unlocks (user_id, match_id, model_id);

-- 2) 各模型对每场的分析全局缓存（同场同模型只生成一次，省 API）
create table if not exists model_analyses (
  match_id     bigint not null,
  model_id     text not null,
  content      jsonb not null,
  generated_at timestamptz default now(),
  primary key (match_id, model_id)
);
alter table model_analyses enable row level security;
-- 不开公开读：服务端 service_role 取出后按解锁状态返回
