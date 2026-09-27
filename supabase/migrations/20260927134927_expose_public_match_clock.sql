create or replace function public.get_public_match_clocks()
returns table (
  match_id uuid,
  clock_phase text,
  clock_running boolean,
  clock_elapsed_seconds integer,
  clock_started_at timestamptz,
  half_length_minutes smallint,
  clock_updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.match_id,
    s.clock_phase,
    s.clock_running,
    s.clock_elapsed_seconds,
    s.clock_started_at,
    s.half_length_minutes,
    s.clock_updated_at
  from public.game_day_sessions s
  inner join public.matches m on m.id = s.match_id
  where m.published = true
  order by m.kickoff, s.match_id;
$$;

revoke all on function public.get_public_match_clocks() from public, anon, authenticated;
grant execute on function public.get_public_match_clocks() to anon, authenticated;

comment on function public.get_public_match_clocks() is
  'Read-only public projection of official clock fields for published matches. It exposes no Crowd access, invite, participant, or captain data.';
