create table public.captain_player_name_aliases (
  id bigint generated always as identity primary key,
  alias text not null,
  normalized_alias text generated always as (
    lower(regexp_replace(btrim(alias), '\s+', ' ', 'g'))
  ) stored,
  player_id uuid references public.team_roster(id) on delete cascade,
  resolution text not null default 'player',
  confirmed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint captain_player_name_aliases_alias_length_check
    check (char_length(btrim(alias)) between 1 and 80),
  constraint captain_player_name_aliases_resolution_check
    check (resolution in ('player', 'not_player')),
  constraint captain_player_name_aliases_target_check
    check (
      (resolution = 'player' and player_id is not null)
      or (resolution = 'not_player' and player_id is null)
    ),
  constraint captain_player_name_aliases_normalized_alias_key
    unique (normalized_alias)
);

create index captain_player_name_aliases_player_idx
  on public.captain_player_name_aliases (player_id);

create index captain_player_name_aliases_confirmer_idx
  on public.captain_player_name_aliases (confirmed_by);

alter table public.captain_player_name_aliases enable row level security;

create policy "Captains read player name memory"
on public.captain_player_name_aliases
for select
to authenticated
using ((select public.is_skor_captain()));

create policy "Captains create player name memory"
on public.captain_player_name_aliases
for insert
to authenticated
with check (
  (select public.is_skor_captain())
  and confirmed_by = (select auth.uid())
);

create policy "Captains update player name memory"
on public.captain_player_name_aliases
for update
to authenticated
using ((select public.is_skor_captain()))
with check (
  (select public.is_skor_captain())
  and confirmed_by = (select auth.uid())
);

create policy "Captains delete player name memory"
on public.captain_player_name_aliases
for delete
to authenticated
using ((select public.is_skor_captain()));

revoke all on table public.captain_player_name_aliases from public, anon;
grant select, insert, update, delete on table public.captain_player_name_aliases to authenticated;

revoke all on sequence public.captain_player_name_aliases_id_seq from public, anon;
grant usage, select on sequence public.captain_player_name_aliases_id_seq to authenticated;

comment on table public.captain_player_name_aliases is
  'Captain-confirmed player nicknames and remembered non-player terms used to clarify Notebook and AI context.';

comment on column public.captain_player_name_aliases.resolution is
  'player maps the alias to a roster player; not_player remembers that the term should not trigger another prompt.';
