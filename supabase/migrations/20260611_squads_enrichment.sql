-- Add global squad-player enrichment fields for World Cup roster imports.
-- Run this once on an existing Supabase database before scripts/import-worldcup-squads.mjs.

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
