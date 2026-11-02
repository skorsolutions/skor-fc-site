-- POST-APPROVAL ONLY: execute after GUEST-HISTORY-ROOT-FIX.sql. Everything rolls back.
begin;
do $test$
declare
  cap uuid; cap_mail text; outsider uuid; mid uuid:=gen_random_uuid(); mid2 uuid:=gen_random_uuid();
  tid uuid:=gen_random_uuid(); old_tid uuid:=gen_random_uuid(); tid2 uuid:=gen_random_uuid();
  pid uuid:=gen_random_uuid(); failed_pid uuid:=gen_random_uuid(); lid uuid:=gen_random_uuid();
  inv uuid; inv_number integer;
  body jsonb; result jsonb; before_rows text; after_rows text; failed boolean; pkey text;
begin
  select u.id,u.email into cap,cap_mail from auth.users u join public.captain_allowlist c on lower(c.email)=lower(u.email)
    where c.active and c.role in ('captain','super_admin') order by u.id limit 1;
  select u.id into outsider from auth.users u where not exists(select 1 from public.captain_allowlist c where lower(c.email)=lower(u.email) and c.active) limit 1;
  if cap is null or outsider is null then raise exception 'Captain and noncaptain fixtures required.';end if;
  insert into public.matches(id,slug,kickoff,home_team,away_team,published,status) values
    (mid,'verify-history-'||mid,now()-interval '1 day','Fixture home','Fixture away',true,'final'),
    (mid2,'verify-history-'||mid2,now()-interval '2 days','Fixture home','Fixture away',true,'final');
  insert into public.match_temp_players(id,match_id,display_name,jersey_number,active,created_by) values
    (old_tid,mid,'Fixture History Person',77,false,cap),(tid,mid,'Fixture History Person',77,true,cap),
    (tid2,mid2,'Fixture History Person',66,false,cap);
  insert into public.lineup_variations(id,event_key,event_label,name,state,created_by,is_production) values
    (lid,mid2::text,'Fixture game','Fixture history','{}'::jsonb||jsonb_build_object('slots',jsonb_build_object('GK','temp:'||tid2::text)),cap,false);
  if skor_private.temp_entry_has_usage(old_tid) or not skor_private.temp_entry_has_usage(tid2) then raise exception 'Unused vs referenced archive detection failed.';end if;
  select md5(string_agg(to_jsonb(t)::text,'' order by t.id)) into before_rows from public.match_temp_players t where t.id in(tid,old_tid,tid2);
  body:=jsonb_build_object('request_id',gen_random_uuid(),'player_id',pid,'create_profile',true,'full_name','Fixture History Person','reviewed',true,
    'games',(select jsonb_agg(jsonb_build_object('temp_id',t.id,'match_id',t.match_id,'updated_at',t.updated_at) order by t.id) from public.match_temp_players t where t.id in(tid,tid2)));
  perform set_config('request.jwt.claims',jsonb_build_object('sub',cap,'email',cap_mail,'role','authenticated')::text,true);execute 'set local role authenticated';
  result:=public.get_guest_console();
  if result->>'history_version'<>'1' then raise exception 'Missing history contract.';end if;
  if not exists(select 1 from jsonb_array_elements(result->'legacy') t where t->>'id'=old_tid::text and t->>'active'='false' and t->>'has_usage'='false') then raise exception 'Unused archive metadata missing.';end if;
  -- The old raw INSERT path cannot bypass profile identities.
  failed:=false;begin insert into public.match_temp_players(match_id,display_name) values(mid,'Bypass Fixture');exception when insufficient_privilege then failed:=true;end;
  if not failed then raise exception 'Direct TEMP insert bypass accepted.';end if;
  -- A stale final item rolls back the new profile and every preceding link.
  failed:=false;begin
    perform public.manage_guest_history('import',jsonb_set(body,'{player_id}',to_jsonb(failed_pid))||jsonb_build_object('request_id',gen_random_uuid(),
      'games',jsonb_build_array(body->'games'->0,(body->'games'->1)||jsonb_build_object('updated_at','2000-01-01T00:00:00Z'))));
  exception when others then failed:=true;end;
  if not failed then raise exception 'Stale multi-game import accepted.';end if;
  execute 'reset role';
  if exists(select 1 from public.team_roster where id=failed_pid) or exists(select 1 from skor_private.guest_match_links where player_id=failed_pid) then raise exception 'Atomic import left partial changes.';end if;
  execute 'set local role authenticated';
  perform public.manage_guest_history('import',body);perform public.manage_guest_history('import',body);
  result:=public.get_guest_console();
  if (select count(*) from jsonb_array_elements(result->'links') l where l->>'player_id'=pid::text)<>2 then raise exception 'Import/retry did not retain exactly two links.';end if;
  if not exists(select 1 from jsonb_array_elements(result->'profiles') g where g->>'player_id'=pid::text and g->'record'->'summary'->>'present_count'='0') then raise exception 'History import invented attendance.';end if;
  execute 'reset role';
  select md5(string_agg(to_jsonb(t)::text,'' order by t.id)) into after_rows from public.match_temp_players t where t.id in(tid,old_tid,tid2);
  if before_rows is distinct from after_rows then raise exception 'Import changed exact TEMP rows/jerseys/active status.';end if;
  if not exists(select 1 from public.lineup_variations where id=lid and state->'slots'->>'GK'='temp:'||tid2::text) then raise exception 'Historical lineup reference changed.';end if;
  if exists(select 1 from public.player_match_attendance where player_id=pid) then raise exception 'Unconfirmed attendance was written.';end if;
  -- Removed canonical identities are reused by a new assignment, never replaced.
  update public.match_temp_players set active=false where id=tid;
  execute 'set local role authenticated';
  perform public.manage_guest_history('assign',jsonb_build_object('request_id',gen_random_uuid(),'player_id',pid,'match_id',mid,'number',78));
  execute 'reset role';
  if not exists(select 1 from public.match_temp_players where id=tid and active and jersey_number=78) then raise exception 'Canonical reactivation/number assignment failed.';end if;
  if (select count(*) from public.match_temp_players where match_id=mid)<>2 or (select temp_id from skor_private.guest_match_links where player_id=pid and match_id=mid)<>tid then raise exception 'Re-add created a new TEMP identity.';end if;
  select i.id,i.jersey_number into inv,inv_number from public.jersey_inventory i join public.team_kits k on k.id=i.kit_id where i.status='on_hand' and k.active order by i.id limit 1;
  if inv is null then raise exception 'An available physical jersey is required for assignment verification.';end if;
  execute 'set local role authenticated';
  perform public.manage_guest_history('assign',jsonb_build_object('request_id',gen_random_uuid(),'player_id',pid,'match_id',mid,'inventory_id',inv));
  execute 'reset role';
  if not exists(select 1 from public.match_temp_players where id=tid and jersey_inventory_id=inv and jersey_number=inv_number and active) then raise exception 'Physical inventory assignment did not set the match number.';end if;
  execute 'set local role authenticated';
  failed:=false;begin perform public.manage_guest_history('assign',jsonb_build_object('request_id',gen_random_uuid(),'player_id',pid,'match_id',mid,'number',case when inv_number=99 then 98 else 99 end));exception when others then failed:=true;end;
  if not failed then raise exception 'Number-only update bypassed physical inventory.';end if;
  perform public.manage_guest_history('assign',jsonb_build_object('request_id',gen_random_uuid(),'player_id',pid,'match_id',mid));
  execute 'reset role';
  if not exists(select 1 from public.match_temp_players where id=tid and jersey_inventory_id=inv and jersey_number=inv_number) then raise exception 'Re-adding without a jersey change lost the kit assignment.';end if;
  execute 'set local role authenticated';
  perform public.manage_guest_history('assign',jsonb_build_object('request_id',gen_random_uuid(),'player_id',pid,'match_id',mid,'inventory_id',null));
  execute 'reset role';
  if not exists(select 1 from public.match_temp_players where id=tid and jersey_inventory_id is null and jersey_number is null and active) then raise exception 'Explicit unassignment did not restore jersey TBD.';end if;
  execute 'set local role authenticated';
  failed:=false;begin perform public.manage_guest_profile('bind_game',jsonb_build_object('request_id',gen_random_uuid(),'player_id',pid,'match_id',mid,'temp_id',old_tid,'reviewed',true));exception when others then failed:=true;end;
  if not failed then raise exception 'Canonical identity was replaced by archived duplicate.';end if;
  -- A new profile cannot bypass review by adding a raw-name duplicate.
  failed:=false;begin perform public.manage_guest_history('assign',jsonb_build_object('request_id',gen_random_uuid(),'player_id',failed_pid,'match_id',mid,'create_profile',true,'full_name','Fixture History Person'));exception when others then failed:=true;end;
  if not failed then raise exception 'Duplicate named profile accepted without explicit identity review.';end if;
  execute 'reset role';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);execute 'set local role authenticated';
  failed:=false;begin perform public.manage_guest_history('import',body);exception when insufficient_privilege then failed:=true;end;
  if not failed then raise exception 'Noncaptain history access accepted.';end if;
  execute 'reset role';perform set_config('request.jwt.claims','{"role":"anon"}',true);execute 'set local role anon';
  failed:=false;begin perform public.manage_guest_history('import',body);exception when insufficient_privilege then failed:=true;end;
  if not failed then raise exception 'Anonymous history access accepted.';end if;
  execute 'reset role';
end $test$;
rollback;
