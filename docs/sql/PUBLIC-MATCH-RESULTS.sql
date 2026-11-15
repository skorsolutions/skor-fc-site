-- v58.43 prepared; DO NOT APPLY without explicit database deployment approval.
-- Publish final result totals only. Raw match events and discipline remain private.
begin;
create function public.get_public_match_results()
returns table(match_id uuid, home_score integer, away_score integer,
  skor_score integer, opponent_score integer, penalty_skor integer,
  penalty_opponent integer, on_penalties boolean, outcome text)
language sql stable security definer set search_path = ''
as $function$
  with scores as (
    select m.id,m.kickoff,m.home_team,
      count(e.id) filter(where e.event_type in ('skor_goal','opponent_own_goal'))::integer as gs,
      count(e.id) filter(where e.event_type in ('opponent_goal','skor_own_goal'))::integer as go
    from public.matches m left join public.match_events e on e.match_id=m.id
    where m.published=true and m.status='final' and m.kickoff<=now()
      and (m.home_team='SKOR FC' or m.away_team='SKOR FC')
    group by m.id,m.kickoff,m.home_team
  ), decisions as (
    select s.*,case when s.gs=s.go and t.completed=true
      then skor_private.shootout_summary(t.shots,t.initial_kicks,t.first_team) end as pens
    from scores s left join skor_private.match_tiebreaks t on t.match_id=s.id
  )
  select id,
    case when home_team='SKOR FC' then gs else go end,
    case when home_team='SKOR FC' then go else gs end,gs,go,
    case when pens->>'winner' in ('skor','opponent') then (pens->>'skor')::integer end,
    case when pens->>'winner' in ('skor','opponent') then (pens->>'opponent')::integer end,
    coalesce(pens->>'winner' in ('skor','opponent'),false),
    case when gs>go or pens->>'winner'='skor' then 'win'
      when gs<go or pens->>'winner'='opponent' then 'loss' else 'draw' end
  from decisions order by kickoff desc,id;
$function$;
revoke all on function public.get_public_match_results() from public,anon,authenticated;
grant execute on function public.get_public_match_results() to anon,authenticated;

-- This restrictive policy composes with existing portal policies. It does not
-- grant any new reads or writes, nor change the captain/player mutation rules.
create policy "Private match event details" on public.match_events
as restrictive for select to public
using ((select auth.uid()) is not null and
  ((select public.is_approved_captain()) or (select public.current_player_id()) is not null));
-- Preserve stable profile/guest identity and goals/assists/MOTM; remove public discipline totals.
CREATE OR REPLACE FUNCTION public.get_public_player_season_stats()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with event_source as (
    select e.*
    from public.match_events e
    join public.matches m on m.id = e.match_id
    where m.published = true and m.status <> 'scheduled'
  ), contributions as (
    select skor_private.canonical_participant_key(e.match_id,e.roster_player_key) as player_key,
           coalesce(nullif(trim(e.roster_player_number),''),nullif(trim(e.player_number),'')) as number,
           e.player_name as name,
           'goals'::text as metric
    from event_source e
    where e.event_type = 'skor_goal'
    union all
    select skor_private.canonical_participant_key(e.match_id,e.assist_roster_player_key),
           coalesce(nullif(trim(e.assist_roster_player_number),''),nullif(trim(e.assist_player_number),'')),
           e.assist_player_name, 'assists'
    from event_source e
    where e.event_type = 'skor_goal'
      and coalesce(nullif(trim(e.assist_player_name),''),nullif(trim(e.assist_player_number),''),nullif(trim(e.assist_roster_player_number),''),e.assist_roster_player_key) is not null
    union all
    select skor_private.canonical_participant_key(m.id,m.man_of_match_player_key),
           coalesce(nullif(trim(m.man_of_match_roster_player_number),''),nullif(trim(m.man_of_match_player_number),'')),
           m.man_of_match_player_name, 'motm'
    from public.matches m
    where m.published = true
      and coalesce(nullif(trim(m.man_of_match_player_name),''),nullif(trim(m.man_of_match_player_number),''),nullif(trim(m.man_of_match_roster_player_number),''),m.man_of_match_player_key) is not null
  ), resolved as (
    select p.player_key,
           case when p.player_key is not null then coalesce(p.jersey_number::text,'TBD') else coalesce(c.number,'') end as number,
           coalesce(p.display_name,nullif(split_part(trim(c.name),' ',1),''),'Unknown') as name,
           c.metric
    from contributions c
    left join lateral (
      select r.player_key,r.jersey_number,r.display_name
      from public.public_roster r
      where (c.player_key is not null and r.player_key = c.player_key)
         or (c.player_key is null and r.jersey_number::text = c.number)
      limit 1
    ) p on true
  ), players as (
    select r.player_key,r.number,r.name,
           count(*) filter (where r.metric = 'goals') as goals,
           count(*) filter (where r.metric = 'assists') as assists,
           count(*) filter (where r.metric = 'motm') as motm
    from resolved r
    group by r.player_key,r.number,r.name
  )
  select jsonb_build_object(
    'players',coalesce((select jsonb_agg(to_jsonb(p) order by p.number,p.name) from players p),'[]'::jsonb),
    'totals',jsonb_build_object(
      'goals',(select count(*) from event_source e where e.event_type in ('skor_goal','opponent_own_goal')),
      'assists',(select count(*) from contributions c where c.metric = 'assists'),
      'motm',(select count(*) from contributions c where c.metric = 'motm')
    )
  );
$function$
;
revoke all on function public.get_public_player_season_stats() from public,anon,authenticated;
grant execute on function public.get_public_player_season_stats() to anon,authenticated;
commit;
