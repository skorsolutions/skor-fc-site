-- v58.17: reviewable migration draft. Do not apply without user approval.
-- No roster, attendance, match or event rows are inserted, edited or deleted.
-- Helpers live outside the API schema and are inaccessible to client roles.
create schema if not exists skor_private;
revoke all on schema skor_private from public, anon, authenticated;

create or replace function skor_private.completed_attendance()
returns setof public.player_match_attendance
language sql stable security invoker set search_path = ''
as $function$
  select a.* from public.player_match_attendance a
  join public.matches m on m.id=a.match_id
  where m.published=true and m.status='final' and m.kickoff<=now();
$function$;
revoke all on function skor_private.completed_attendance() from public, anon, authenticated;

create or replace function skor_private.player_completed_matches(p_player_id uuid)
returns table (
  match_id uuid, kickoff timestamptz, home_team text, away_team text,
  location text, status text, attendance_status text,
  skor_score integer, opponent_score integer, my_goals integer,
  my_assists integer, my_yellow_cards integer, my_red_cards integer,
  my_motm boolean, record_updated_at timestamptz
)
language sql stable security invoker set search_path = ''
as $function$
  select m.id,m.kickoff,m.home_team,m.away_team,m.location,m.status,
    coalesce(a.status,'unmarked'),e.skor_score,e.opponent_score,
    e.goals,e.assists,e.yellow_cards,e.red_cards,
    coalesce(m.man_of_match_player_key=r.player_key,false),
    greatest(m.updated_at,a.updated_at,e.updated_at)
  from public.team_roster r
  cross join public.matches m
  left join public.player_match_attendance a on a.player_id=r.id and a.match_id=m.id
  cross join lateral (
    select
      count(*) filter(where x.event_type in ('skor_goal','opponent_own_goal'))::integer as skor_score,
      count(*) filter(where x.event_type in ('opponent_goal','skor_own_goal'))::integer as opponent_score,
      count(*) filter(where x.event_type='skor_goal' and x.roster_player_key=r.player_key)::integer as goals,
      count(*) filter(where x.event_type='skor_goal' and x.assist_roster_player_key=r.player_key)::integer as assists,
      count(*) filter(where x.event_type='skor_yellow_card' and x.roster_player_key=r.player_key)::integer as yellow_cards,
      count(*) filter(where x.event_type='skor_red_card' and x.roster_player_key=r.player_key)::integer as red_cards,
      max(x.updated_at) as updated_at
    from public.match_events x where x.match_id=m.id
  ) e
  where r.id=p_player_id and m.published=true and m.status='final' and m.kickoff<=now()
    -- Do not manufacture absences for matches before the roster record existed.
    -- Explicit historical attendance or personal events still include that match.
    and (m.kickoff>=r.created_at or a.player_id is not null
      or e.goals+e.assists+e.yellow_cards+e.red_cards>0
      or m.man_of_match_player_key=r.player_key);
$function$;
revoke all on function skor_private.player_completed_matches(uuid) from public, anon, authenticated;

-- One authenticated, self-scoped snapshot for both totals and match history.
-- SECURITY DEFINER is required by the existing RPC-only attendance/identity model;
-- no direct client table grants or RLS changes are introduced.
create or replace function public.get_my_match_record()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $function$
declare v_player_id uuid;
begin
  if auth.uid() is null then raise exception 'Player portal authorization required.'; end if;
  v_player_id:=public.current_player_id();
  if v_player_id is null then raise exception 'Player portal authorization required.'; end if;
  return (
    with records as materialized (
      select * from skor_private.player_completed_matches(v_player_id)
    ), totals as (
      select count(*)::integer as recorded_matches,
        count(*) filter(where attendance_status='present')::integer as present_count,
        count(*) filter(where attendance_status='absent')::integer as absent_count,
        count(*) filter(where attendance_status='excused')::integer as excused_count,
        count(*) filter(where attendance_status='unmarked')::integer as unmarked_count,
        coalesce(sum(my_goals),0)::integer as goals,
        coalesce(sum(my_assists),0)::integer as assists,
        coalesce(sum(my_yellow_cards),0)::integer as yellow_cards,
        coalesce(sum(my_red_cards),0)::integer as red_cards,
        count(*) filter(where my_motm)::integer as motm,
        min(kickoff) as coverage_start,max(record_updated_at) as last_changed_at
      from records
    )
    select jsonb_build_object('summary',to_jsonb(t)||jsonb_build_object(
      'eligible_count',t.present_count+t.absent_count,
      'attendance_rate',round(100.0*t.present_count/nullif(t.present_count+t.absent_count,0),1)),
      'matches',coalesce((select jsonb_agg(to_jsonb(r) order by r.kickoff desc,r.match_id) from records r),'[]'::jsonb),
      'as_of',now()) from totals t
  );
end;
$function$;
revoke all on function public.get_my_match_record() from public, anon;
grant execute on function public.get_my_match_record() to authenticated;

-- Backward-compatible endpoints now use the exact same completed-match record.
create or replace function public.get_my_player_stats()
returns table(goals bigint,assists bigint,yellow_cards bigint,red_cards bigint,motm bigint)
language plpgsql stable security definer set search_path = ''
as $function$
declare v_record jsonb;
begin
  v_record:=public.get_my_match_record()->'summary';
  return query select (v_record->>'goals')::bigint,(v_record->>'assists')::bigint,
    (v_record->>'yellow_cards')::bigint,(v_record->>'red_cards')::bigint,(v_record->>'motm')::bigint;
end;
$function$;
revoke all on function public.get_my_player_stats() from public, anon;
grant execute on function public.get_my_player_stats() to authenticated;

create or replace function public.get_my_attendance_stats()
returns table(present_count bigint,absent_count bigint,excused_count bigint,eligible_count bigint,attendance_rate numeric)
language plpgsql stable security definer set search_path = ''
as $function$
declare v_record jsonb;
begin
  v_record:=public.get_my_match_record()->'summary';
  return query select (v_record->>'present_count')::bigint,(v_record->>'absent_count')::bigint,
    (v_record->>'excused_count')::bigint,(v_record->>'eligible_count')::bigint,(v_record->>'attendance_rate')::numeric;
end;
$function$;
revoke all on function public.get_my_attendance_stats() from public, anon;
grant execute on function public.get_my_attendance_stats() to authenticated;

create or replace function public.get_my_recent_matches(p_limit integer default 6)
returns table(match_id uuid,kickoff timestamptz,home_team text,away_team text,location text,status text,
  skor_score integer,opponent_score integer,my_goals integer,my_assists integer,my_yellow_cards integer,my_red_cards integer,my_motm boolean)
language plpgsql stable security definer set search_path = ''
as $function$
declare v_player_id uuid;
begin
  if auth.uid() is null then raise exception 'Player portal authorization required.'; end if;
  v_player_id:=public.current_player_id();
  if v_player_id is null then raise exception 'Player portal authorization required.'; end if;
  return query select r.match_id,r.kickoff,r.home_team,r.away_team,r.location,r.status,
    r.skor_score,r.opponent_score,r.my_goals,r.my_assists,r.my_yellow_cards,r.my_red_cards,r.my_motm
  from skor_private.player_completed_matches(v_player_id) r
  order by r.kickoff desc,r.match_id limit least(20,greatest(1,coalesce(p_limit,6)));
end;
$function$;
revoke all on function public.get_my_recent_matches(integer) from public, anon;
grant execute on function public.get_my_recent_matches(integer) to authenticated;

create or replace function public.get_team_attendance_stats()
returns table(present_count bigint,absent_count bigint,excused_count bigint,eligible_count bigint,attendance_rate numeric)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if auth.uid() is null or not public.is_skor_captain() then raise exception 'Captain access required.'; end if;
  return query select
    count(*) filter(where a.status='present'),count(*) filter(where a.status='absent'),
    count(*) filter(where a.status='excused'),count(*) filter(where a.status in ('present','absent')),
    round(100.0*count(*) filter(where a.status='present')/nullif(count(*) filter(where a.status in ('present','absent')),0),1)
  from skor_private.completed_attendance() a;
end;
$function$;
revoke all on function public.get_team_attendance_stats() from public, anon;
grant execute on function public.get_team_attendance_stats() to authenticated;

create or replace function public.get_team_attendance_by_player()
returns table(roster_player_id uuid,jersey_number integer,display_name text,playing_status text,
  present_count bigint,absent_count bigint,excused_count bigint,eligible_count bigint,attendance_rate numeric,last_attendance_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if auth.uid() is null or not public.is_skor_captain() then raise exception 'Captain access required.'; end if;
  return query select r.id,r.jersey_number,
    coalesce(nullif(trim(r.preferred_name),''),split_part(trim(r.full_name),' ',1)),coalesce(ps.playing_status,'active'),
    count(*) filter(where a.status='present'),count(*) filter(where a.status='absent'),count(*) filter(where a.status='excused'),
    count(*) filter(where a.status in ('present','absent')),
    round(100.0*count(*) filter(where a.status='present')/nullif(count(*) filter(where a.status in ('present','absent')),0),1),max(a.updated_at)
  from public.team_roster r
  left join public.player_playing_status ps on ps.player_id=r.id
  left join skor_private.completed_attendance() a on a.player_id=r.id
  where r.active=true
  group by r.id,r.jersey_number,r.preferred_name,r.full_name,ps.playing_status
  order by r.jersey_number,r.full_name;
end;
$function$;
revoke all on function public.get_team_attendance_by_player() from public, anon;
grant execute on function public.get_team_attendance_by_player() to authenticated;

create or replace function public.get_team_attendance_matrix(p_limit integer default 12)
returns table(match_id uuid,kickoff timestamptz,opponent text,roster_player_id uuid,jersey_number integer,display_name text,attendance_status text)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if auth.uid() is null or not public.is_skor_captain() then raise exception 'Captain access required.'; end if;
  return query with recent_matches as (
    select m.id,m.kickoff,case when m.home_team='SKOR FC' then m.away_team else m.home_team end as opponent
    from public.matches m where m.published=true and m.status='final' and m.kickoff<=now()
    order by m.kickoff desc,m.id limit greatest(1,least(coalesce(p_limit,12),24))
  )
  select rm.id,rm.kickoff,rm.opponent,r.id,r.jersey_number,
    coalesce(nullif(trim(r.preferred_name),''),split_part(trim(r.full_name),' ',1)),a.status
  from recent_matches rm cross join public.team_roster r
  left join public.player_match_attendance a on a.match_id=rm.id and a.player_id=r.id
  where r.active=true and (rm.kickoff>=r.created_at or a.player_id is not null)
  order by rm.kickoff asc,r.jersey_number,r.full_name;
end;
$function$;
revoke all on function public.get_team_attendance_matrix(integer) from public, anon;
grant execute on function public.get_team_attendance_matrix(integer) to authenticated;

notify pgrst, 'reload schema';
