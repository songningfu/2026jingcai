-- 队伍档案：教练、风格、关键球员、世界杯历史
create table if not exists team_profiles (
  team_fd_id        bigint primary key,
  team_name_en      text,
  coach             text,
  coach_nationality text,
  style             text,
  key_players       jsonb,
  wc_history        jsonb,
  qualifying_summary text,
  updated_at        timestamptz default now()
);
alter table team_profiles enable row level security;
drop policy if exists "public read team_profiles" on team_profiles;
create policy "public read team_profiles" on team_profiles for select using (true);

-- 历史交锋记录（世界杯历史 H2H）
create table if not exists team_h2h (
  id            bigserial primary key,
  team_a_fd_id  bigint not null,
  team_b_fd_id  bigint not null,
  team_a_name   text,
  team_b_name   text,
  total_matches int,
  team_a_wins   int,
  draws         int,
  team_b_wins   int,
  total_goals_a int,
  total_goals_b int,
  summary       text,
  meetings      jsonb,
  unique(team_a_fd_id, team_b_fd_id)
);
alter table team_h2h enable row level security;
drop policy if exists "public read team_h2h" on team_h2h;
create policy "public read team_h2h" on team_h2h for select using (true);
