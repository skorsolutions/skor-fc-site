-- v58.1 score privacy: explicitly approved and applied on 2026-10-03.
-- Supabase migration 20261003225430 restrict_public_match_scores.
-- No match, player, event, lineup, or crowd-report rows are modified.

-- Restrictive SELECT policies are ANDed with the existing permissive policies.
-- An invite or an arbitrary signed-in account does not grant score access.
create policy "Score privacy: official goals"
on public.match_events as restrictive for select to public
using (
  event_type not in ('skor_goal','opponent_goal','opponent_own_goal','skor_own_goal')
  or (
    (select auth.uid()) is not null
    and ((select public.is_approved_captain()) or (select public.current_player_id()) is not null)
  )
);

-- Preserve approved Captain Portal read-only roles and unpublished captain data.
create policy "Score privacy: approved portal reads"
on public.match_events for select to authenticated
using (
  (select auth.uid()) is not null
  and (
    (select public.is_approved_captain())
    or (
      (select public.current_player_id()) is not null
      and exists (select 1 from public.matches m where m.id = match_id and m.published = true)
    )
  )
);

create policy "Score privacy: crowd goals"
on public.game_day_crowd_events as restrictive for select to public
using (
  event_type not in ('skor_goal','opponent_goal','opponent_own_goal','skor_own_goal')
  or (
    (select auth.uid()) is not null
    and ((select public.is_approved_captain()) or (select public.current_player_id()) is not null)
  )
);

create policy "Score privacy: crowd goal reports"
on public.game_day_event_reports as restrictive for select to public
using (
  (
    (select auth.uid()) is not null
    and ((select public.is_approved_captain()) or (select public.current_player_id()) is not null)
  )
  or exists (
    select 1 from public.game_day_crowd_events e
    where e.id = event_id
      and e.event_type not in ('skor_goal','opponent_goal','opponent_own_goal','skor_own_goal')
  )
);

-- This intentionally public, no-argument projection is the sole new definer API.
-- It is required to aggregate protected goal rows without exposing any match ID,
-- opponent goal count, result, timestamp, raw event, full name, or private notes.
-- No arbitrary filters, single-match requests, or caller-supplied SQL are accepted.
create or replace function public.get_public_player_season_stats()
returns jsonb
language sql stable security definer set search_path = ''
as $function$
  with event_source as (
    select e.*
    from public.match_events e
    join public.matches m on m.id = e.match_id
    where m.published = true and m.status <> 'scheduled'
  ), contributions as (
    select e.roster_player_key as player_key,
           coalesce(nullif(trim(e.roster_player_number),''),nullif(trim(e.player_number),'')) as number,
           e.player_name as name,
           case e.event_type when 'skor_goal' then 'goals'
             when 'skor_yellow_card' then 'yellow' else 'red' end as metric
    from event_source e
    where e.event_type in ('skor_goal','skor_yellow_card','skor_red_card')
    union all
    select e.assist_roster_player_key,
           coalesce(nullif(trim(e.assist_roster_player_number),''),nullif(trim(e.assist_player_number),'')),
           e.assist_player_name, 'assists'
    from event_source e
    where e.event_type = 'skor_goal'
      and coalesce(nullif(trim(e.assist_player_name),''),nullif(trim(e.assist_player_number),''),nullif(trim(e.assist_roster_player_number),''),e.assist_roster_player_key) is not null
    union all
    select m.man_of_match_player_key,
           coalesce(nullif(trim(m.man_of_match_roster_player_number),''),nullif(trim(m.man_of_match_player_number),'')),
           m.man_of_match_player_name, 'motm'
    from public.matches m
    where m.published = true
      and coalesce(nullif(trim(m.man_of_match_player_name),''),nullif(trim(m.man_of_match_player_number),''),nullif(trim(m.man_of_match_roster_player_number),''),m.man_of_match_player_key) is not null
  ), resolved as (
    select coalesce(p.jersey_number::text,c.number,'') as number,
           coalesce(p.display_name,nullif(split_part(trim(c.name),' ',1),''),'Unknown') as name,
           c.metric
    from contributions c
    left join lateral (
      select r.jersey_number,r.display_name
      from public.public_roster r
      where (c.player_key is not null and r.player_key = c.player_key)
         or (c.player_key is null and r.jersey_number::text = c.number)
      limit 1
    ) p on true
  ), players as (
    select r.number,r.name,
           count(*) filter (where r.metric = 'goals') as goals,
           count(*) filter (where r.metric = 'assists') as assists,
           count(*) filter (where r.metric = 'yellow') as yellow,
           count(*) filter (where r.metric = 'red') as red,
           count(*) filter (where r.metric = 'motm') as motm
    from resolved r
    group by r.number,r.name
  )
  select jsonb_build_object(
    'players',coalesce((select jsonb_agg(to_jsonb(p) order by p.number,p.name) from players p),'[]'::jsonb),
    'totals',jsonb_build_object(
      'goals',(select count(*) from event_source e where e.event_type in ('skor_goal','opponent_own_goal')),
      'assists',(select count(*) from contributions c where c.metric = 'assists'),
      'yellow',(select count(*) from event_source e where e.event_type = 'skor_yellow_card'),
      'red',(select count(*) from event_source e where e.event_type = 'skor_red_card'),
      'motm',(select count(*) from contributions c where c.metric = 'motm')
    )
  );
$function$;

revoke all on function public.get_public_player_season_stats() from public, anon, authenticated;
grant execute on function public.get_public_player_season_stats() to anon, authenticated;

comment on function public.get_public_player_season_stats() is
  'Public season aggregates only; match scores and goal records require an approved player or Captain Portal identity.';
