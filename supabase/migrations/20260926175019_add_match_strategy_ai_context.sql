create table public.match_strategies (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique
    references public.matches (id) on delete cascade,
  source_lineup_variation_id uuid
    references public.lineup_variations (id) on delete set null,
  lineup_name text,
  title text not null default 'Match Strategy',
  status text not null default 'draft',
  ai_context_enabled boolean not null default false,
  opponent_formation text not null default '4-4-2',
  show_lanes boolean not null default true,
  lineup_snapshot jsonb not null default '{}'::jsonb,
  scenes jsonb not null default '[]'::jsonb,
  created_by uuid not null default auth.uid()
    references auth.users (id) on delete restrict,
  updated_by uuid default auth.uid()
    references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint match_strategies_lineup_name_check
    check (lineup_name is null or char_length(btrim(lineup_name)) between 1 and 140),
  constraint match_strategies_title_check
    check (char_length(btrim(title)) between 1 and 70),
  constraint match_strategies_status_check
    check (status in ('draft', 'published')),
  constraint match_strategies_ai_publish_check
    check (ai_context_enabled = false or status = 'published'),
  constraint match_strategies_opponent_formation_check
    check (char_length(btrim(opponent_formation)) between 1 and 40),
  constraint match_strategies_lineup_snapshot_check
    check (jsonb_typeof(lineup_snapshot) = 'object'),
  constraint match_strategies_scenes_check
    check (
      jsonb_typeof(scenes) = 'array'
      and jsonb_array_length(scenes) between 1 and 20
    ),
  constraint match_strategies_published_at_check
    check (
      (status = 'draft' and published_at is null)
      or (status = 'published' and published_at is not null)
    )
);

create index match_strategies_status_ai_idx
  on public.match_strategies (status, ai_context_enabled, updated_at desc);

create index match_strategies_updated_by_idx
  on public.match_strategies (updated_by);

create or replace function public.set_match_strategy_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

create trigger match_strategies_set_updated_at
before update on public.match_strategies
for each row execute function public.set_match_strategy_updated_at();

alter table public.match_strategies enable row level security;

create policy match_strategies_select_captain
on public.match_strategies
for select
to authenticated
using ((select public.is_skor_captain()));

create policy match_strategies_insert_captain
on public.match_strategies
for insert
to authenticated
with check (
  (select public.is_skor_captain())
  and created_by = (select auth.uid())
  and (updated_by is null or updated_by = (select auth.uid()))
);

create policy match_strategies_update_captain
on public.match_strategies
for update
to authenticated
using ((select public.is_skor_captain()))
with check (
  (select public.is_skor_captain())
  and updated_by = (select auth.uid())
);

create policy match_strategies_delete_captain
on public.match_strategies
for delete
to authenticated
using ((select public.is_skor_captain()));

revoke all on table public.match_strategies from public, anon, authenticated;
grant select, insert, update, delete on table public.match_strategies to authenticated;

revoke all on function public.set_match_strategy_updated_at() from public, anon, authenticated;

comment on table public.match_strategies is
  'Captain-authored, game-linked lineup and tactical scenes. Published rows may be used as structured AI coaching context; access remains captain-only in this phase.';

comment on column public.match_strategies.lineup_snapshot is
  'The lineup state used when the strategy was built, including XI, bench, depth chart and planned substitution waves.';

comment on column public.match_strategies.scenes is
  'Ordered offense, defense and transition scenes with coaching points, player/opponent positions and drawing metadata.';

comment on column public.match_strategies.ai_context_enabled is
  'Explicit captain approval for the published strategy to be included in AI coaching context.';

alter table public.captain_match_debriefs
  add column lineup_execution text,
  add column strategy_execution text,
  add column opponent_adjustments text;

alter table public.captain_match_debriefs
  add constraint captain_match_debriefs_lineup_execution_check
    check (lineup_execution is null or char_length(lineup_execution) <= 3000),
  add constraint captain_match_debriefs_strategy_execution_check
    check (strategy_execution is null or char_length(strategy_execution) <= 3000),
  add constraint captain_match_debriefs_opponent_adjustments_check
    check (opponent_adjustments is null or char_length(opponent_adjustments) <= 3000);

comment on column public.captain_match_debriefs.lineup_execution is
  'Captain assessment of the starting lineup, roles, bench use and substitution plan after the match.';

comment on column public.captain_match_debriefs.strategy_execution is
  'Captain assessment of which published strategy scenes and coaching instructions worked or failed.';

comment on column public.captain_match_debriefs.opponent_adjustments is
  'Captain assessment of the opponent shape versus expectation and the adjustments SKOR made or should make.';
