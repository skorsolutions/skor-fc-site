create table public.captain_ai_player_comment_refs (
  comment_id uuid primary key
    references public.player_match_comments (id) on delete cascade,
  match_id uuid not null
    references public.matches (id) on delete cascade,
  selected_by uuid
    references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index captain_ai_player_comment_refs_match_idx
  on public.captain_ai_player_comment_refs (match_id);

create index captain_ai_player_comment_refs_selector_idx
  on public.captain_ai_player_comment_refs (selected_by);

alter table public.captain_ai_player_comment_refs enable row level security;

create policy "Captains can read AI player comment references"
on public.captain_ai_player_comment_refs
for select
to authenticated
using ((select public.is_skor_captain()));

create policy "Captains can add AI player comment references"
on public.captain_ai_player_comment_refs
for insert
to authenticated
with check (
  (select public.is_skor_captain())
  and selected_by = (select auth.uid())
);

create policy "Captains can remove AI player comment references"
on public.captain_ai_player_comment_refs
for delete
to authenticated
using ((select public.is_skor_captain()));

revoke all on table public.captain_ai_player_comment_refs from public, anon, authenticated;
grant select, insert, delete on table public.captain_ai_player_comment_refs to authenticated;

comment on table public.captain_ai_player_comment_refs is
  'Captain-curated, persistent references to player match comments that AI coaching tools may use.';

comment on column public.captain_ai_player_comment_refs.match_id is
  'Denormalized match reference used to group and securely re-fetch the source comment through the captain RPC.';
