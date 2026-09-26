alter table public.match_strategies
  add column event_key text,
  add column event_label text not null default 'Tinker / No Game';

update public.match_strategies as strategy
set
  event_key = strategy.match_id::text,
  event_label = coalesce(
    nullif(btrim(concat_ws(' vs ', match.home_team, match.away_team)), ''),
    'Scheduled game'
  )
from public.matches as match
where match.id = strategy.match_id;

update public.match_strategies
set event_key = coalesce(event_key, match_id::text, 'tinker')
where event_key is null;

alter table public.match_strategies
  alter column event_key set not null,
  alter column match_id drop not null,
  drop constraint match_strategies_match_id_key,
  add column title_key text generated always as (lower(btrim(title))) stored,
  add constraint match_strategies_event_key_check
    check (char_length(btrim(event_key)) between 1 and 120),
  add constraint match_strategies_event_label_check
    check (char_length(btrim(event_label)) between 1 and 180),
  add constraint match_strategies_event_match_check
    check (
      (match_id is null and event_key = 'tinker')
      or (match_id is not null and event_key = match_id::text)
    ),
  add constraint match_strategies_event_title_key
    unique (event_key, title_key);

create index match_strategies_event_updated_idx
  on public.match_strategies (event_key, updated_at desc);

create unique index match_strategies_one_ai_strategy_per_match
  on public.match_strategies (match_id)
  where match_id is not null
    and status = 'published'
    and ai_context_enabled = true;

create or replace function public.publish_match_strategy(p_strategy_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_match_id uuid;
begin
  if (select auth.uid()) is null or not (select public.is_skor_captain()) then
    raise exception 'Captain access is required.' using errcode = '42501';
  end if;

  select strategy.match_id
  into v_match_id
  from public.match_strategies as strategy
  where strategy.id = p_strategy_id;

  if not found then
    raise exception 'Strategy not found.' using errcode = 'P0002';
  end if;

  if v_match_id is null then
    raise exception 'Only a strategy linked to a scheduled game can be published for AI.' using errcode = '22023';
  end if;

  update public.match_strategies
  set
    status = 'draft',
    ai_context_enabled = false,
    published_at = null
  where match_id = v_match_id
    and id <> p_strategy_id
    and (status = 'published' or ai_context_enabled = true or published_at is not null);

  update public.match_strategies
  set
    status = 'published',
    ai_context_enabled = true,
    published_at = now()
  where id = p_strategy_id;

  if not found then
    raise exception 'Strategy could not be published.' using errcode = 'P0002';
  end if;

  return p_strategy_id;
end;
$$;

revoke all on function public.publish_match_strategy(uuid) from public, anon;
grant execute on function public.publish_match_strategy(uuid) to authenticated;

comment on column public.match_strategies.event_key is
  'Scheduled match UUID as text, or tinker for a reusable strategy that is not linked to a match.';

comment on column public.match_strategies.event_label is
  'Captain-facing game or Tinker label used to group the shared Strategy library.';

comment on column public.match_strategies.title_key is
  'Generated normalized strategy name used to overwrite same-name saves without creating duplicates.';

comment on function public.publish_match_strategy(uuid) is
  'Captain-only, RLS-enforced transaction that makes one named strategy the sole AI-published strategy for its scheduled game.';

notify pgrst, 'reload schema';
