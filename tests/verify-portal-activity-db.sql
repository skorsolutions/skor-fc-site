-- Run ONLY after the exact PORTAL-ACTIVITY.sql migration is explicitly approved
-- and applied. This production verification uses existing identities but never
-- commits test activity. No fixture names, account IDs or emails are hardcoded.
begin;
do $test$
declare
  v_captain record;
  v_player record;
  v_console record;
  v_viewer record;
  v_stranger record;
  v_event uuid;
  v_repeat uuid;
  v_initial timestamptz;
  v_denied boolean;
  v_rows integer;
begin
  select u.id,u.email into strict v_captain
  from auth.users u join public.captain_allowlist c on lower(c.email)=lower(u.email)
  where c.active and c.role in ('captain','super_admin') limit 1;
  select u.id,u.email,pa.roster_player_id into strict v_player
  from auth.users u join public.player_access pa on pa.auth_user_id=u.id and pa.active
  join public.team_roster r on r.id=pa.roster_player_id and r.active and r.portal_enabled
  where not exists(select 1 from public.captain_allowlist c where c.active and lower(c.email)=lower(u.email))
  limit 1;
  select u.id,u.email into strict v_console
  from auth.users u join public.captain_allowlist c on lower(c.email)=lower(u.email)
  where c.active and c.role in ('captain','super_admin')
    and not exists(select 1 from public.player_access pa join public.team_roster r on r.id=pa.roster_player_id
      where pa.auth_user_id=u.id and pa.active and r.active and r.portal_enabled)
  limit 1;
  select u.id,u.email into v_viewer
  from auth.users u join public.captain_allowlist c on lower(c.email)=lower(u.email)
  where c.active and c.role='viewer' limit 1;
  select u.id,u.email into v_stranger
  from auth.users u
  where not exists(select 1 from public.captain_allowlist c where c.active and lower(c.email)=lower(u.email))
    and not exists(select 1 from public.player_access pa where pa.auth_user_id=u.id and pa.active)
  limit 1;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_player.id,'email',v_player.email,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  v_event:=public.record_my_portal_activity('player');
  v_repeat:=public.record_my_player_portal_login();
  if v_event is distinct from v_repeat then raise exception 'Legacy/new player recorder must reuse a session'; end if;
  v_denied:=false;
  begin perform public.get_portal_activity(5); exception when raise_exception then v_denied:=true; end;
  if not v_denied then raise exception 'An ordinary player must not read activity'; end if;
  v_denied:=false;
  begin perform public.record_my_portal_activity('captain'); exception when raise_exception then v_denied:=true; end;
  if not v_denied then raise exception 'An ordinary player must not record console activity'; end if;
  execute 'reset role';
  if not exists(select 1 from public.player_portal_login_events e where e.id=v_event and e.player_id=v_player.roster_player_id and e.auth_user_id=v_player.id and e.portal='player') then
    raise exception 'Player identity/source persistence failed';
  end if;
  select occurred_at into v_initial from public.player_portal_login_events where id=v_event;
  -- A fresh heartbeat must not create a session or move its original start time.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_player.id,'email',v_player.email,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  if public.record_my_portal_activity('player')<>v_event then raise exception 'Heartbeat created a duplicate session'; end if;
  execute 'reset role';
  if not exists(select 1 from public.player_portal_login_events where id=v_event and occurred_at=v_initial and last_seen_at>=occurred_at) then
    raise exception 'Heartbeat timestamp contract failed';
  end if;
  -- Force the verified test session outside the idle window, within this rollback.
  update public.player_portal_login_events set last_seen_at=now()-interval '16 minutes'
    where auth_user_id=v_player.id and portal='player' and event_type='portal_login';
  execute 'set local role authenticated';
  v_repeat:=public.record_my_portal_activity('player');
  if v_repeat=v_event then raise exception 'A return after idle must create a new session'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_console.id,'email',v_console.email,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  v_event:=public.record_my_portal_activity('captain');
  if public.record_my_portal_activity('captain')<>v_event then raise exception 'Console heartbeat duplicated a session'; end if;
  select count(*) into v_rows from public.get_portal_activity(5) a where a.event_id=v_event and a.portal='captain';
  if v_rows<>1 then raise exception 'Console-only captain must appear once in report'; end if;
  select count(*) into v_rows from public.get_portal_activity(100) a;
  execute 'reset role';
  if not exists(select 1 from public.player_portal_login_events where id=v_event and player_id is null and auth_user_id=v_console.id) then
    raise exception 'Console-only identity was not persisted';
  end if;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_captain.id,'email',v_captain.email,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  perform public.record_my_portal_activity('captain');
  v_denied:=false;
  begin perform public.record_my_portal_activity('unknown'); exception when raise_exception then v_denied:=true; end;
  if not v_denied then raise exception 'Unknown portal must be rejected'; end if;
  select count(*) into v_rows from (select a.participant_id from public.get_portal_activity(100) a group by a.participant_id having count(a.event_id)>10) x;
  if v_rows<>0 then raise exception 'Per-person result limit exceeded'; end if;
  execute 'reset role';

  if v_viewer.id is not null then
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_viewer.id,'email',v_viewer.email,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    perform public.record_my_portal_activity('captain');
    v_denied:=false;
    begin perform public.get_portal_activity(5); exception when raise_exception then v_denied:=true; end;
    if not v_denied then raise exception 'View-only user must not read activity'; end if;
    execute 'reset role';
  end if;
  if v_stranger.id is not null then
    perform set_config('request.jwt.claims',jsonb_build_object('sub',v_stranger.id,'email',v_stranger.email,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    v_denied:=false;
    begin perform public.record_my_portal_activity('captain'); exception when raise_exception then v_denied:=true; end;
    if not v_denied then raise exception 'Unlinked login must not record console activity'; end if;
    v_denied:=false;
    begin perform public.record_my_portal_activity('player'); exception when raise_exception then v_denied:=true; end;
    if not v_denied then raise exception 'Unlinked login must not record player activity'; end if;
    execute 'reset role';
  end if;

  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  execute 'set local role anon';
  v_denied:=false;
  begin perform public.get_portal_activity(5); exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'Anonymous report access must be denied'; end if;
  v_denied:=false;
  begin perform public.record_my_portal_activity('player'); exception when insufficient_privilege then v_denied:=true; end;
  if not v_denied then raise exception 'Anonymous recording must be denied'; end if;
  execute 'reset role';
  if has_table_privilege('authenticated','public.player_portal_login_events','select,insert,update,delete')
     or has_table_privilege('anon','public.player_portal_login_events','select,insert,update,delete') then
    raise exception 'Direct activity table grants must remain revoked';
  end if;
  raise notice 'Portal activity role/persistence verification passed; all test writes will roll back.';
end;
$test$;
rollback;
