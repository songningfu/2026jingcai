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
