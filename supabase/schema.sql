-- 竞彩数据资讯平台 schema（规格文档第 3 章）
-- 用法：Supabase Dashboard → SQL Editor → 粘贴全文 → Run
-- 所有表默认开启 RLS；公开数据放开 select，写入仅 service_role（绕过 RLS）。

-- 球队
create table if not exists teams (
  id            bigint primary key,         -- 用数据源的 team id
  name_zh       text not null,
  name_en       text,
  group_name    text,                       -- 小组（A-L）
  logo_url      text
);

-- 比赛
create table if not exists matches (
  id            bigint primary key,         -- 数据源 match id
  competition   text default 'WC2026',
  stage         text,                       -- group / last32 / last16 ...
  group_name    text,                       -- 小组赛阶段的小组
  home_team_id  bigint references teams(id),
  away_team_id  bigint references teams(id),
  kickoff_at    timestamptz not null,
  status        text,                       -- scheduled / live / finished
  home_score    int,
  away_score    int,
  ht_home       int,
  ht_away       int,
  updated_at    timestamptz default now()
);
create index if not exists idx_matches_kickoff on matches (kickoff_at);

-- 竞彩赔率（仅中国体彩竞彩官方来源，第 0 章第 4 条）
create table if not exists odds (
  id            bigserial primary key,
  match_id      bigint references matches(id),
  play_type     text not null,              -- whl(胜平负) / handicap(让球) / score(比分) / totalgoals / halffull
  handicap      int,
  outcome       text not null,
  odd           numeric(6,2) not null,
  captured_at   timestamptz default now()
);
create index if not exists idx_odds_match on odds (match_id, play_type, captured_at desc);

-- 球员/阵容/伤停（AI 报告用料）
create table if not exists squads (
  id            bigserial primary key,
  match_id      bigint references matches(id),
  team_id       bigint references teams(id),
  player_name   text,
  position      text,
  status        text,                       -- starter / bench / injured / suspended / squad
  shirt_number  int,
  club          text,
  date_of_birth date,
  nationality   text,
  source        text,
  source_ids    jsonb default '{}'::jsonb,
  updated_at    timestamptz default now()
);
alter table squads add column if not exists shirt_number int;
alter table squads add column if not exists club text;
alter table squads add column if not exists date_of_birth date;
alter table squads add column if not exists nationality text;
alter table squads add column if not exists source text;
alter table squads add column if not exists source_ids jsonb default '{}'::jsonb;
alter table squads add column if not exists updated_at timestamptz default now();
create unique index if not exists idx_squads_source_team_player
  on squads (source, team_id, player_name)
  where source is not null and team_id is not null and player_name is not null;

-- AI 生成的比赛报告
create table if not exists reports (
  id            bigserial primary key,
  match_id      bigint references matches(id) unique,
  preview_json  jsonb,
  review_json   jsonb,
  is_premium    boolean default true,
  generated_at  timestamptz default now()
);

-- 用户与订阅（points 为虚拟积分：不可充值、不可提现，第 0 章第 5 条）
create table if not exists profiles (
  id            uuid primary key,           -- 设备访客 id；登录后复用为账号统一 id（已去 auth.users 外键，见 20260611_games.sql）
  nickname      text,
  points        int default 0,
  sub_type      text,                       -- null / 'event_pass' / 'monthly'
  sub_expires   timestamptz,
  email         text,                       -- 邮箱账号（登录后绑定，见 20260613_auth.sql）
  auth_user_id  uuid,                       -- 对应 Supabase Auth 用户
  username      text                        -- 用户名（无需邮箱的登录方式，见 20260613_username.sql）
);
create unique index if not exists idx_profiles_email
  on profiles (lower(email)) where email is not null;
create unique index if not exists idx_profiles_auth_user
  on profiles (auth_user_id) where auth_user_id is not null;

-- 单场解锁记录（model_id 区分不同模型档位，同场同模型只扣一次积分）
create table if not exists unlocks (
  id            bigserial primary key,
  user_id       uuid references profiles(id),
  match_id      bigint references matches(id),
  model_id      text not null default '',
  created_at    timestamptz default now(),
  unique(user_id, match_id, model_id)
);

-- 竞猜小游戏（虚拟积分，无真钱）
create table if not exists predictions (
  id            bigserial primary key,
  user_id       uuid references profiles(id),
  match_id      bigint references matches(id),
  pick          text,                       -- win/draw/loss
  points_staked int,
  settled       boolean default false,
  won           boolean,
  created_at    timestamptz default now()
);

-- ---------- RLS ----------
alter table teams       enable row level security;
alter table matches     enable row level security;
alter table odds        enable row level security;
alter table squads      enable row level security;
alter table reports     enable row level security;
alter table profiles    enable row level security;
alter table unlocks     enable row level security;
alter table predictions enable row level security;

-- 公开只读数据
drop policy if exists "public read teams" on teams;
create policy "public read teams"   on teams   for select using (true);
drop policy if exists "public read matches" on matches;
create policy "public read matches" on matches for select using (true);
drop policy if exists "public read odds" on odds;
create policy "public read odds"    on odds    for select using (true);
drop policy if exists "public read squads" on squads;
create policy "public read squads"  on squads  for select using (true);
-- reports 不开公开读：付费内容由服务端用 service_role 取出后按订阅状态裁剪返回

-- 用户私有数据：本人可读
drop policy if exists "own profile" on profiles;
create policy "own profile" on profiles for select using (auth.uid() = id);
drop policy if exists "own unlocks" on unlocks;
create policy "own unlocks" on unlocks for select using (auth.uid() = user_id);
drop policy if exists "own predictions" on predictions;
create policy "own predictions" on predictions for select using (auth.uid() = user_id);
-- 写入（订阅、解锁、积分变动、竞猜结算）一律走服务端 service_role，防止客户端篡改

-- 首页支持率投票（每人每场一票）
create table if not exists support_votes (
  id          bigserial primary key,
  match_id    bigint not null references matches(id),
  device_id   text not null,
  pick        text not null check (pick in ('win', 'loss')),
  created_at  timestamptz default now(),
  unique(match_id, device_id)
);
create index if not exists support_votes_match_idx on support_votes(match_id);
alter table support_votes enable row level security;
drop policy if exists "public insert support_votes" on support_votes;
drop policy if exists "public read support_votes" on support_votes;
create policy "public insert support_votes" on support_votes for insert with check (true);
create policy "public read support_votes" on support_votes for select using (true);
