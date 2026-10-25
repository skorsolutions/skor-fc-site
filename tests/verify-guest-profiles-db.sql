-- POST-APPROVAL ONLY. Run as the administrative database connection after applying
-- the approved migration. All fixture rows, identity rebinding and receipts roll back.
begin;
do $test$
declare
  cap uuid; cap_mail text; regular_id uuid; uid uuid; verified_mail text; spare integer;
  pid uuid:=gen_random_uuid(); pid2 uuid:=gen_random_uuid(); gid uuid:=gen_random_uuid(); eid uuid:=gen_random_uuid();
  mid uuid:=gen_random_uuid(); hidden_mid uuid:=gen_random_uuid(); tid uuid; fee_id uuid:=gen_random_uuid(); receipt uuid:=gen_random_uuid();
  payload jsonb; plan jsonb; result jsonb; q jsonb; rejected boolean; rev integer; scenario_id uuid:=gen_random_uuid(); before_opening text; before_roster text;
begin
  select u.id,u.email into cap,cap_mail from auth.users u join public.captain_allowlist c on lower(c.email)=lower(u.email)
    where c.active and c.role in ('captain','super_admin') order by u.id limit 1;
  select pa.roster_player_id,u.id,lower(u.email) into regular_id,uid,verified_mail from public.player_access pa join auth.users u on u.id=pa.auth_user_id and u.email_confirmed_at is not null
    where pa.active and not exists(select 1 from public.captain_allowlist c where lower(c.email)=lower(u.email) and c.active) limit 1;
  select n into spare from generate_series(1,99) n where not exists(select 1 from public.team_roster r where r.active and r.jersey_number=n) limit 1;
  if cap is null or uid is null or spare is null then raise exception 'Verified captain, noncaptain player and spare regular number required.';end if;
  select md5(string_agg(to_jsonb(m)::text,'' order by m.group_id,m.player_id)) into before_opening from skor_private.dues_members m where opening_paid;
  select md5(string_agg(to_jsonb(r)::text,'' order by r.id)) into before_roster from public.team_roster r;
  -- Temporarily release one real verified noncaptain auth identity for fixture claiming.
  -- No auth.users row changes. This and every following change are rolled back.
  update public.player_access set active=false,auth_user_id=null,approved_email='released-fixture@example.invalid' where roster_player_id=regular_id;
  insert into public.matches(id,slug,kickoff,home_team,away_team,published,status) values
    (mid,'verify-guest-'||mid,now()-interval '1 day','Fixture home','Fixture away',true,'final'),
    (hidden_mid,'verify-guest-'||hidden_mid,now()+interval '1 day','Private fixture','Other fixture',true,'scheduled');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',cap,'email',cap_mail,'role','authenticated')::text,true);execute 'set local role authenticated';
  payload:=jsonb_build_object('request_id',gen_random_uuid(),'player_id',pid,'full_name','Fixture Guest','preferred_name','Fixture','email',verified_mail);
  perform public.manage_guest_profile('create',payload);perform public.manage_guest_profile('create',payload);
  perform public.manage_guest_profile('create',jsonb_build_object('request_id',gen_random_uuid(),'player_id',pid2,'full_name','Unclaimed fixture'));
  perform public.manage_team_dues('create_group',jsonb_build_object('group_id',gid,'name','Fixture season','tag','verify-'||gid,'kind','season','players','[]'::jsonb,'matches',jsonb_build_array(mid)));
  perform public.manage_team_dues('create_group',jsonb_build_object('group_id',eid,'name','Fixture event','tag','verify-'||eid,'kind','event','players',jsonb_build_array(pid),'matches',jsonb_build_array(mid)));
  perform public.manage_guest_profile('event_member',jsonb_build_object('request_id',gen_random_uuid(),'player_id',pid2,'group_id',eid,'revision',0,'active',true));
  perform public.manage_guest_profile('bind_game',jsonb_build_object('request_id',gen_random_uuid(),'player_id',pid,'match_id',mid,'group_id',eid));
  result:=public.get_guest_console();
  if not exists(select 1 from jsonb_array_elements(result->'event_participants') x where x->>'player_id'=pid2::text and x->>'match_id'=mid::text) then raise exception 'Event participant missing before jersey assignment.';end if;
  select (x->>'temp_id')::uuid into tid from jsonb_array_elements(result->'links') x where x->>'player_id'=pid::text;
  if tid is null then raise exception 'Guest match alias missing.';end if;
  if not exists(select 1 from jsonb_array_elements(result->'links') x where x->>'player_id'=pid::text and x->'number'='null'::jsonb) then raise exception 'Unknown jersey was not preserved.';end if;
  rejected:=false;begin perform public.manage_guest_profile('bind_game',jsonb_build_object('request_id',gen_random_uuid(),'player_id',pid2,'match_id',mid,'temp_id',tid,'reviewed',true));exception when others then rejected:=true;end;
  if not rejected then raise exception 'Same TEMP identity bound to two people.';end if;
  payload:=jsonb_build_object('id',fee_id,'group_id',gid,'player_id',pid,'match_id',mid,'revision',0,'amount_cents',1200);
  rejected:=false;begin perform public.manage_participant_dues('guest_fee',payload);exception when others then rejected:=true;end;
  if not rejected then raise exception 'Disabled guest fees produced charge.';end if;
  perform public.manage_participant_dues('fee_settings',jsonb_build_object('id',gen_random_uuid(),'group_id',gid,'revision',0,'enabled',true,'rate_cents',1200,'effective_on',current_date-2));
  rejected:=false;begin perform public.manage_participant_dues('guest_fee',payload||'{"revision":1}');exception when others then rejected:=true;end;
  if not rejected then raise exception 'Unmarked attendance incurred fee.';end if;
  perform public.manage_guest_profile('attendance',jsonb_build_object('request_id',gen_random_uuid(),'player_id',pid,'match_id',mid,'status','present'));
  payload:=payload||'{"revision":1}';perform public.manage_participant_dues('guest_fee',payload);perform public.manage_participant_dues('guest_fee',payload);
  rejected:=false;begin perform public.manage_participant_dues('guest_fee',payload||jsonb_build_object('id',gen_random_uuid(),'revision',2));exception when others then rejected:=true;end;
  if not rejected then raise exception 'Duplicate appearance fee accepted.';end if;
  perform public.manage_guest_profile('attendance',jsonb_build_object('request_id',gen_random_uuid(),'player_id',pid2,'match_id',mid,'status','present'));
  perform public.manage_participant_dues('guest_fee',jsonb_build_object('id',gen_random_uuid(),'group_id',gid,'player_id',pid2,'match_id',mid,'revision',2,'waive',true,'reason','Reviewed unnumbered event attendee'));

  perform public.manage_team_dues('payment',jsonb_build_object('group_id',gid,'id',receipt,'player_id',pid,'amount_cents',500,'kind','receipt','method','Cash','received_on',current_date));
  perform public.manage_team_dues('payment',jsonb_build_object('group_id',gid,'id',gen_random_uuid(),'player_id',pid,'amount_cents',200,'kind','receipt','method','Zelle','received_on',current_date));
  execute 'reset role';
  insert into public.match_events(match_id,event_type,half,sequence,roster_player_key,player_name) values(mid,'skor_goal','first',1,'temp:'||tid::text,'Fixture');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'email',verified_mail,'role','authenticated')::text,true);execute 'set local role authenticated';
  result:=public.resolve_player_portal();if result->>'mode'<>'guest' then raise exception 'Verified guest claim failed.';end if;
  if public.current_player_id() is not null then raise exception 'Guest gained regular player identity.';end if;
  result:=public.get_my_guest_portal();if jsonb_array_length(result->'matches')<>1 or result->'matches'->0->>'id'<>mid::text then raise exception 'Guest game scope leaked.';end if;
  if (result->'record'->'summary'->>'present_count')::integer<>1 or (result->'record'->'summary'->>'goals')::integer<>1 then raise exception 'Exact TEMP alias record did not follow guest.';end if;
  result:=public.get_my_dues();if not exists(select 1 from jsonb_array_elements(result->'groups') x where x->>'id'=gid::text and (x->'balance'->>'balance_cents')::bigint=500) then raise exception 'Guest partial mixed dues mismatch.';end if;
  perform public.manage_my_guest_match('rsvp',jsonb_build_object('match_id',mid,'status','going','note','Fixture'));
  perform public.manage_my_guest_match('comment',jsonb_build_object('id',gen_random_uuid(),'match_id',mid,'visibility','captains','comment','Fixture feedback'));
  rejected:=false;begin perform public.manage_my_guest_match('rsvp',jsonb_build_object('match_id',hidden_mid,'status','going'));exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception 'Guest wrote to unassigned game.';end if;
  rejected:=false;begin perform public.get_captain_dues();exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception 'Guest read captain ledger.';end if;
  rejected:=false;begin perform public.get_my_player_profile();exception when others then rejected:=true;end;if not rejected then raise exception 'Guest gained full regular profile.';end if;
  rejected:=false;begin perform count(*) from skor_private.guest_profiles;exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception 'Guest read private profile table.';end if;
  execute 'reset role';perform set_config('request.jwt.claims',jsonb_build_object('sub',cap,'email',cap_mail,'role','authenticated')::text,true);execute 'set local role authenticated';
  plan:=jsonb_build_object('group_id',gid,'player_id',pid,'baseline_cents',30000,'fixed_cents',5000,'total_games',10,'included_games',6,'replace_guest_fees',true);
  q:=public.preview_participation_dues(plan);if (q->>'participation_cents')::bigint<>20000 or (q->>'balance_cents')::bigint<>19300 then raise exception 'Proration/credit preview mismatch.';end if;
  perform public.manage_guest_profile('promote',jsonb_build_object('request_id',gen_random_uuid(),'player_id',pid,'group_id',gid,'number',spare,'joined_on',current_date,'revision',(q->>'revision')::integer,'charge_plan',plan,'expected_old_cents',q->'old_cents'));
  result:=public.get_captain_dues();if not exists(select 1 from jsonb_array_elements(result->'members') x where x->>'group_id'=gid::text and x->>'player_id'=pid::text and (x->>'assigned_cents')::bigint=20000 and (x->>'paid_cents')::bigint=700 and x->>'allocation_mode'='individual') then raise exception 'Promotion lost individual charge or receipts.';end if;
  -- Later shared-cost assignments must neither remove nor zero individual members.
  select (x->>'revision')::integer into rev from jsonb_array_elements(result->'groups') x where x->>'id'=gid::text;
  plan:=jsonb_build_object('costs',jsonb_build_array(jsonb_build_object('label','Shared fixture budget','cents',10000)),'contribution_cents',0,'players',jsonb_build_array(jsonb_build_object('player_id',regular_id,'discount',0)));
  perform public.manage_team_dues('save_scenario',jsonb_build_object('group_id',gid,'revision',rev,'id',scenario_id,'name','Shared fixture','plan',plan));
  perform public.manage_team_dues('finalize',jsonb_build_object('group_id',gid,'revision',rev,'id',scenario_id));
  result:=public.get_captain_dues();if not exists(select 1 from jsonb_array_elements(result->'members') x where x->>'group_id'=gid::text and x->>'player_id'=pid::text and (x->>'assigned_cents')::bigint=20000 and (x->>'paid_cents')::bigint=700 and (x->>'active')::boolean) then raise exception 'Shared assignment overwrote individual participant.';end if;
  execute 'reset role';perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'email',verified_mail,'role','authenticated')::text,true);execute 'set local role authenticated';
  result:=public.resolve_player_portal();if result->>'mode'<>'regular' or public.current_player_id()<>pid then raise exception 'Promotion did not retain login/profile identity.';end if;
  result:=public.get_my_match_record();if (result->'summary'->>'goals')::integer<>1 then raise exception 'Promotion lost exact TEMP stats.';end if;
  rejected:=false;begin perform public.get_my_guest_portal();exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception 'Promoted player remained in guest mode.';end if;
  execute 'reset role';perform set_config('request.jwt.claims','{"role":"anon"}',true);execute 'set local role anon';
  rejected:=false;begin perform public.get_my_guest_portal();exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception 'Anonymous guest access allowed.';end if;
  execute 'reset role';
  if before_opening is distinct from (select md5(string_agg(to_jsonb(m)::text,'' order by m.group_id,m.player_id)) from skor_private.dues_members m where opening_paid) then raise exception 'Original opening paid memberships changed.';end if;
  if before_roster is distinct from (select md5(string_agg(to_jsonb(r)::text,'' order by r.id)) from public.team_roster r where r.id not in(pid,pid2)) then raise exception 'Original roster changed.';end if;
  if (select count(*) from skor_private.dues_extra_entries where group_id=gid and player_id=pid and category='guest_fee')<>1 then raise exception 'Fee retry duplicated charge.';end if;
  raise notice 'PASS: guest identity, scope, exact aliases, attendance/fee guards, partial receipts, proration, promotion, role boundaries and opening preservation.';
end $test$;
rollback;
