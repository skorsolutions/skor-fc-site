-- Run after the approved migration. All identity contexts are transaction-local.
-- No application records or auth mappings are modified; no identity values returned.
begin;
do $test$
declare
  p record; payload jsonb; legacy jsonb; k text;
  expected_present bigint; expected_absent bigint; expected_excused bigint;
  expected_goals bigint; expected_assists bigint; expected_yellow bigint; expected_red bigint; expected_awards bigint;
  players_checked integer:=0; captains_checked integer:=0; ordinary_checked integer:=0;
begin
  for p in
    select r.id,r.player_key,pa.auth_user_id,pa.approved_email,
      exists(select 1 from public.captain_allowlist c where lower(c.email)=lower(pa.approved_email)
        and c.active and c.role in ('captain','super_admin')) as captain
    from public.team_roster r join public.player_access pa on pa.roster_player_id=r.id
    where r.active and r.portal_enabled and pa.active and pa.auth_user_id is not null
  loop
    select count(*) filter(where a.status='present'),count(*) filter(where a.status='absent'),count(*) filter(where a.status='excused')
    into expected_present,expected_absent,expected_excused
    from public.player_match_attendance a join public.matches m on m.id=a.match_id
    where a.player_id=p.id and m.published and m.status='final' and m.kickoff<=now();
    select count(*) filter(where e.event_type='skor_goal' and e.roster_player_key=p.player_key),
      count(*) filter(where e.event_type='skor_goal' and e.assist_roster_player_key=p.player_key),
      count(*) filter(where e.event_type='skor_yellow_card' and e.roster_player_key=p.player_key),
      count(*) filter(where e.event_type='skor_red_card' and e.roster_player_key=p.player_key)
    into expected_goals,expected_assists,expected_yellow,expected_red
    from public.match_events e join public.matches m on m.id=e.match_id
    where m.published and m.status='final' and m.kickoff<=now();
    select count(*) into expected_awards from public.matches m
    where m.published and m.status='final' and m.kickoff<=now() and m.man_of_match_player_key=p.player_key;

    perform set_config('request.jwt.claims',jsonb_build_object('sub',p.auth_user_id,'email',p.approved_email,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    if public.current_player_id() is distinct from p.id then raise exception 'Identity scope mismatch'; end if;
    payload:=public.get_my_match_record();
    if (payload->'summary'->>'present_count')::bigint<>expected_present
      or (payload->'summary'->>'absent_count')::bigint<>expected_absent
      or (payload->'summary'->>'excused_count')::bigint<>expected_excused
      or (payload->'summary'->>'goals')::bigint<>expected_goals
      or (payload->'summary'->>'assists')::bigint<>expected_assists
      or (payload->'summary'->>'yellow_cards')::bigint<>expected_yellow
      or (payload->'summary'->>'red_cards')::bigint<>expected_red
      or (payload->'summary'->>'motm')::bigint<>expected_awards
      then raise exception 'Self record differs from source records'; end if;
    if (payload->'summary'->>'recorded_matches')::integer<>jsonb_array_length(payload->'matches') then raise exception 'Summary/history size mismatch'; end if;
    if exists(select 1 from jsonb_array_elements(payload->'matches') x where x->>'status'<>'final' or (x->>'kickoff')::timestamptz>now()) then raise exception 'Noncompleted fixture leaked'; end if;
    if expected_present+expected_absent=0 then
      if payload->'summary'->>'attendance_rate' is not null then raise exception 'Empty denominator must not produce a percentage'; end if;
    elsif (payload->'summary'->>'attendance_rate')::numeric<>round(100.0*expected_present/(expected_present+expected_absent),1) then raise exception 'Attendance formula mismatch'; end if;

    select to_jsonb(x) into legacy from public.get_my_player_stats() x;
    foreach k in array array['goals','assists','yellow_cards','red_cards','motm'] loop
      if legacy->>k is distinct from payload->'summary'->>k then raise exception 'Legacy stats disagree'; end if;
    end loop;
    select to_jsonb(x) into legacy from public.get_my_attendance_stats() x;
    foreach k in array array['present_count','absent_count','excused_count','eligible_count','attendance_rate'] loop
      if legacy->>k is distinct from payload->'summary'->>k then raise exception 'Legacy attendance disagrees'; end if;
    end loop;
    perform * from public.get_my_recent_matches(6);
    begin
      perform * from skor_private.completed_attendance();
      raise exception 'Private helper unexpectedly accessible';
    exception when insufficient_privilege then null; end;
    if p.captain then
      perform * from public.get_team_attendance_stats();
      perform * from public.get_team_attendance_by_player();
      perform * from public.get_team_attendance_matrix(12);
      captains_checked:=captains_checked+1;
    else
      begin
        perform * from public.get_team_attendance_stats();
        raise exception 'Captain endpoint unexpectedly accessible';
      exception when raise_exception then
        if sqlerrm<>'Captain access required.' then raise; end if;
      end;
      ordinary_checked:=ordinary_checked+1;
    end if;
    players_checked:=players_checked+1;
    execute 'reset role';
  end loop;
  if players_checked=0 or captains_checked=0 or ordinary_checked=0 then raise exception 'Missing role coverage'; end if;

  perform set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-0000-0000-000000000000','email','unlinked@example.invalid','role','authenticated')::text,true);
  execute 'set local role authenticated';
  begin
    perform public.get_my_match_record();raise exception 'Unlinked account unexpectedly authorized';
  exception when raise_exception then
    if sqlerrm<>'Player portal authorization required.' then raise; end if;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims','{}',true);
  execute 'set local role anon';
  begin
    perform public.get_my_match_record();raise exception 'Anonymous call unexpectedly authorized';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
end;
$test$;
rollback;
select 'Authenticated self scopes, captain guards, private helper denial, unlinked/anonymous denial, source totals and backward-compatible RPCs passed; no application records changed.' as verification;
