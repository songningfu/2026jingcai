-- 场馆信息补充到 matches 表
alter table matches add column if not exists venue_name text;
alter table matches add column if not exists venue_city text;
alter table matches add column if not exists venue_country text;

-- Max 专属临场情报缓存表
create table if not exists match_intel (
  match_id       int primary key references matches(id) on delete cascade,
  weather        jsonb,
  injuries_home  jsonb,
  injuries_away  jsonb,
  tactical_notes text,
  key_absences   text,
  generated_at   timestamptz default now()
);
alter table match_intel enable row level security;
drop policy if exists "public read match_intel" on match_intel;
create policy "public read match_intel" on match_intel for select using (true);
