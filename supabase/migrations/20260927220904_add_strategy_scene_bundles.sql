create table public.strategy_scene_bundles (
  id uuid primary key default gen_random_uuid(),
  match_id uuid
    references public.matches (id) on delete cascade,
  event_key text not null,
  event_label text not null default 'Tinker / No Game',
  category text not null default 'other',
  name text not null,
  name_key text generated always as (lower(btrim(name))) stored,
  scene_type text not null default 'offense',
  coaching_points text not null default '',
  opponent_formation text not null default '4-4-2',
  show_lanes boolean not null default true,
  source_lineup_variation_id uuid
    references public.lineup_variations (id) on delete set null,
  lineup_name text,
  lineup_snapshot jsonb not null default '{}'::jsonb,
  subscenes jsonb not null default '[]'::jsonb,
  created_by uuid not null default auth.uid()
    references auth.users (id) on delete restrict,
  updated_by uuid default auth.uid()
    references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint strategy_scene_bundles_event_key_check
    check (char_length(btrim(event_key)) between 1 and 120),
  constraint strategy_scene_bundles_event_label_check
    check (char_length(btrim(event_label)) between 1 and 180),
  constraint strategy_scene_bundles_event_match_check
    check (
      (match_id is null and event_key = 'tinker')
      or (match_id is not null and event_key = match_id::text)
    ),
  constraint strategy_scene_bundles_category_check
    check (category in ('defense', 'offense', 'transition', 'corner', 'free_kick', 'set_piece', 'other')),
  constraint strategy_scene_bundles_name_check
    check (char_length(btrim(name)) between 1 and 70),
  constraint strategy_scene_bundles_scene_type_check
    check (scene_type in ('offense', 'defense', 'transition', 'set_piece')),
  constraint strategy_scene_bundles_coaching_points_check
    check (char_length(coaching_points) <= 600),
  constraint strategy_scene_bundles_opponent_formation_check
    check (char_length(btrim(opponent_formation)) between 1 and 40),
  constraint strategy_scene_bundles_lineup_name_check
    check (lineup_name is null or char_length(btrim(lineup_name)) between 1 and 140),
  constraint strategy_scene_bundles_lineup_snapshot_check
    check (jsonb_typeof(lineup_snapshot) = 'object'),
  constraint strategy_scene_bundles_subscenes_check
    check (
      jsonb_typeof(subscenes) = 'array'
      and jsonb_array_length(subscenes) between 1 and 12
    ),
  constraint strategy_scene_bundles_event_category_name_key
    unique (event_key, category, name_key)
);

create index strategy_scene_bundles_event_category_updated_idx
  on public.strategy_scene_bundles (event_key, category, updated_at desc);

create index strategy_scene_bundles_match_id_idx
  on public.strategy_scene_bundles (match_id);

create index strategy_scene_bundles_source_lineup_variation_id_idx
  on public.strategy_scene_bundles (source_lineup_variation_id);

create index strategy_scene_bundles_created_by_idx
  on public.strategy_scene_bundles (created_by);

create index strategy_scene_bundles_updated_by_idx
  on public.strategy_scene_bundles (updated_by);

create or replace function public.set_strategy_scene_bundle_updated_at()
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

create trigger strategy_scene_bundles_set_updated_at
before update on public.strategy_scene_bundles
for each row execute function public.set_strategy_scene_bundle_updated_at();

alter table public.strategy_scene_bundles enable row level security;

create policy strategy_scene_bundles_select_captain
on public.strategy_scene_bundles
for select
to authenticated
using ((select public.is_skor_captain()));

create policy strategy_scene_bundles_insert_captain
on public.strategy_scene_bundles
for insert
to authenticated
with check (
  (select public.is_skor_captain())
  and created_by = (select auth.uid())
  and (updated_by is null or updated_by = (select auth.uid()))
);

create policy strategy_scene_bundles_update_captain
on public.strategy_scene_bundles
for update
to authenticated
using ((select public.is_skor_captain()))
with check (
  (select public.is_skor_captain())
  and updated_by = (select auth.uid())
);

create policy strategy_scene_bundles_delete_captain
on public.strategy_scene_bundles
for delete
to authenticated
using ((select public.is_skor_captain()));

revoke all on table public.strategy_scene_bundles from public, anon, authenticated;
grant select, insert, update, delete on table public.strategy_scene_bundles to authenticated;

revoke all on function public.set_strategy_scene_bundle_updated_at() from public, anon, authenticated;

comment on table public.strategy_scene_bundles is
  'Captain-only reusable tactical chapters. Each bundle stores ordered animation sub-scenes and may be grouped by scheduled game or Tinker.';

comment on column public.strategy_scene_bundles.category is
  'Captain-facing organization category: defense, offense, transition, corner, free kick, set piece, or other.';

comment on column public.strategy_scene_bundles.subscenes is
  'Ordered keyframes for one tactical situation. Each keyframe stores player, opponent, ball, and tactical-mark state for preview and local GIF/PNG export.';

comment on column public.strategy_scene_bundles.name_key is
  'Generated normalized bundle name used to overwrite same-name saves within one event and category.';

notify pgrst, 'reload schema';
