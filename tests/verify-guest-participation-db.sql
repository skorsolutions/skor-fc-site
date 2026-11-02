-- POST-APPROVAL ONLY after GUEST-PARTICIPATION-RECORDS.sql. Every fixture rolls back.
begin;
do $test$
declare
 cap uuid; mail text; uid uuid; email text; regular_id uuid;
 mid uuid:=gen_random_uuid(); upcoming uuid:=gen_random_uuid(); tid uuid:=gen_random_uuid(); unused uuid:=gen_random_uuid();
 pid uuid:=gen_random_uuid(); rejected_pid uuid:=gen_random_uuid(); final_id uuid:=gen_random_uuid();
 body jsonb; result jsonb; record jsonb; failed boolean; key text:='temp:'||tid::text;
begin
 select u.id,u.email into cap,mail from auth.users u join public.captain_allowlist c on lower(c.email)=lower(u.email)
   where c.active and c.role in ('captain','super_admin') order by u.id limit 1;
 select pa.roster_player_id,u.id,lower(u.email) into regular_id,uid,email from public.player_access pa join auth.users u on u.id=pa.auth_user_id and u.email_confirmed_at is not null
   where pa.active and not exists(select 1 from public.captain_allowlist c where c.active and lower(c.email)=lower(u.email)) limit 1;
 if cap is null or uid is null then raise exception 'Captain and verified noncaptain fixtures required.';end if;
 update public.player_access set active=false,auth_user_id=null,approved_email='participation-release@example.invalid' where roster_player_id=regular_id;
 insert into public.matches(id,slug,kickoff,home_team,away_team,published,status) values
   (mid,'verify-participation-'||mid,now()-interval '2 days','Fixture home','Fixture away',true,'final'),
   (upcoming,'verify-participation-'||upcoming,now()+interval '2 days','Fixture home','Fixture away',true,'scheduled');
 insert into public.match_temp_players(id,match_id,display_name,jersey_number,active,created_by) values
   (tid,mid,'Fixture Draft Guest',44,true,cap),(unused,mid,'Fixture Unused Guest',45,false,cap);
 insert into public.lineup_variations(id,event_key,event_label,name,state,created_by,is_production) values
   (gen_random_uuid(),mid::text,'Fixture game','Old draft',jsonb_build_object('bench',jsonb_build_array(key),'subs',jsonb_build_object('firstHalf',jsonb_build_array(jsonb_build_object('in',jsonb_build_array(key))))),cap,false),
   (final_id,mid::text,'Fixture game','Final',jsonb_build_object('slots','{}'::jsonb,'bench','[]'::jsonb,'depth',jsonb_build_object('GK',jsonb_build_array('temp:'||unused::text)),
     'keeperPlan',jsonb_build_object('assignments',jsonb_build_array(jsonb_build_object('playerKey','temp:'||unused::text)))),cap,true);
 if not skor_private.temp_entry_has_usage(tid) or not skor_private.temp_entry_has_usage(unused) then raise exception 'Technical draft/depth references must remain retained.';end if;
 if skor_private.temp_has_participant_record(tid) or skor_private.temp_has_participant_record(unused) then raise exception 'Draft/depth/keeper-only reference created match history.';end if;
 if not skor_private.lineup_has_participant(jsonb_build_object('bench',jsonb_build_array(key)),key)
   or not skor_private.lineup_has_participant(jsonb_build_object('slots',jsonb_build_object('GK',key)),key)
   or not skor_private.lineup_has_participant(jsonb_build_object('formation','Freeform / Custom','freeform',jsonb_build_object(key,jsonb_build_object('x',50,'y',75))),key)
   or skor_private.lineup_has_participant(jsonb_build_object('formation','Freeform / Custom','slots',jsonb_build_object('GK',key),'freeform','{}'::jsonb),key)
   or skor_private.lineup_has_participant(jsonb_build_object('notes',key,'bench',jsonb_build_object(key,true)),key) then raise exception 'Exact field/bench/freeform selection checks failed.';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',cap,'email',mail,'role','authenticated')::text,true);execute 'set local role authenticated';
 perform public.manage_guest_profile('create',jsonb_build_object('request_id',gen_random_uuid(),'player_id',pid,'full_name','Fixture Draft Guest','email',email));
 perform public.manage_guest_profile('bind_game',jsonb_build_object('request_id',gen_random_uuid(),'player_id',pid,'match_id',mid,'temp_id',tid,'reviewed',true));
 perform public.manage_guest_history('assign',jsonb_build_object('request_id',gen_random_uuid(),'player_id',pid,'match_id',upcoming));
 result:=public.get_guest_console();
 if result->>'participation_version'<>'1' then raise exception 'Missing participation contract.';end if;
 if not exists(select 1 from jsonb_array_elements(result->'legacy') t where t->>'id'=unused::text and t->>'has_usage'='true' and t->>'history_eligible'='false') then raise exception 'Unused legacy classification incorrect.';end if;
 select p->'record' into record from jsonb_array_elements(result->'profiles') p where p->>'player_id'=pid::text;
 if record->'summary'->>'recorded_matches'<>'0' then raise exception 'Created or draft-only guest gained a completed match.';end if;
 execute 'reset role';
 -- A reviewed historical import must reject a now-unused source and roll back profile creation.
 update public.lineup_variations set state=jsonb_set(state,'{bench}',jsonb_build_array('temp:'||unused::text)) where id=final_id;
 if not skor_private.temp_has_participant_record(unused) then raise exception 'Review setup must have a valid Final bench selection.';end if;
 body:=jsonb_build_object('request_id',gen_random_uuid(),'player_id',rejected_pid,'create_profile',true,'full_name','Fixture Unused Guest','reviewed',true,
   'games',(select jsonb_build_array(jsonb_build_object('temp_id',id,'match_id',match_id,'updated_at',updated_at)) from public.match_temp_players where id=unused));
 -- The TEMP updated_at revision stays the same while Final selection changes after review.
 update public.lineup_variations set state=jsonb_set(state,'{bench}','[]'::jsonb) where id=final_id;
 execute 'set local role authenticated';
 failed:=false;begin perform public.manage_guest_history('import',body);exception when others then if sqlerrm not like '%no Final squad selection%' then raise;end if;failed:=true;end;
 if not failed then raise exception 'Unused historical import accepted.';end if;
 execute 'reset role';if exists(select 1 from public.team_roster where id=rejected_pid) then raise exception 'Failed unused import left a profile behind.';end if;
 -- Private portal keeps upcoming assignments but removes unused completed games.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'email',email,'role','authenticated')::text,true);execute 'set local role authenticated';
 result:=public.resolve_player_portal();if result->>'mode'<>'guest' then raise exception 'Guest fixture claim failed.';end if;
 result:=public.get_my_guest_portal();
 if jsonb_array_length(result->'matches')<>1 or result->'matches'->0->>'id'<>upcoming::text or result->'record'->'summary'->>'recorded_matches'<>'0' then raise exception 'Portal showed an unused completed game or lost an upcoming assignment.';end if;
 execute 'reset role';
 -- Final bench selection enables the saved match, without inventing Present attendance.
 update public.lineup_variations set state=jsonb_set(state,'{bench}',jsonb_build_array(key)) where id=final_id;
 if not skor_private.temp_has_participant_record(tid) then raise exception 'Final bench selection missing.';end if;
 execute 'set local role authenticated';result:=public.get_my_guest_portal();
 if result->'record'->'summary'->>'recorded_matches'<>'1' or result->'record'->'summary'->>'present_count'<>'0' then raise exception 'Final selection lost historical match or invented attendance.';end if;
 execute 'reset role';update public.lineup_variations set state=jsonb_set(state,'{bench}','[]'::jsonb) where id=final_id;
 update public.match_temp_players set active=false where id=tid;
 execute 'set local role authenticated';result:=public.get_my_guest_portal();
 if result->'record'->'summary'->>'recorded_matches'<>'0' or jsonb_array_length(result->'matches')<>1 then raise exception 'Removing Final selection left a phantom match.';end if;
 execute 'reset role';
 -- Confirmed attendance is authoritative even when a saved lineup is incomplete.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',cap,'email',mail,'role','authenticated')::text,true);execute 'set local role authenticated';
 perform public.manage_guest_profile('attendance',jsonb_build_object('request_id',gen_random_uuid(),'player_id',pid,'match_id',mid,'status','present'));
 execute 'reset role';record:=skor_private.participant_record(pid);
 if record->'summary'->>'present_count'<>'1' or record->'summary'->>'recorded_matches'<>'1' then raise exception 'Explicit Present attendance was lost.';end if;
 execute 'set local role authenticated';perform public.manage_guest_profile('attendance',jsonb_build_object('request_id',gen_random_uuid(),'player_id',pid,'match_id',mid,'status','unmarked'));execute 'reset role';
 if skor_private.participant_record(pid)->'summary'->>'recorded_matches'<>'0' then raise exception 'Clearing the last participation evidence left a game record.';end if;
 -- Captain-confirmed MOTM is official evidence without relying on a draft.
 update public.matches set man_of_match_player_key='temp:'||unused::text where id=mid;
 if not skor_private.temp_has_participant_record(unused) then raise exception 'Official MOTM evidence was lost.';end if;
 update public.matches set man_of_match_player_key=null where id=mid;
 -- Official events survive TEMP removal and recover the precise original identity.
 insert into public.match_events(match_id,event_type,half,sequence,roster_player_key,assist_roster_player_key,player_name,assist_player_name)
   values(mid,'skor_goal','first',1,key,'temp:'||unused::text,'Fixture','Fixture');
 record:=skor_private.participant_record(pid);
 if record->'summary'->>'goals'<>'1' or record->'summary'->>'present_count'<>'0' or not skor_private.temp_has_participant_record(unused) then raise exception 'Official goal/assist evidence was lost or invented attendance.';end if;
 if exists(select 1 from public.player_match_attendance where player_id=pid and match_id=mid) then raise exception 'Participation eligibility wrote attendance.';end if;
 if exists(select 1 from skor_private.dues_extra_entries where player_id=pid) then raise exception 'Participation eligibility charged a guest automatically.';end if;
 -- New helpers remain private; ordinary clients use guarded public APIs.
 perform set_config('request.jwt.claims','{"role":"anon"}',true);execute 'set local role anon';
 failed:=false;begin perform skor_private.temp_has_participant_record(tid);exception when insufficient_privilege then failed:=true;end;
 if not failed then raise exception 'Anonymous private helper access accepted.';end if;
 execute 'reset role';
end $test$;
rollback;
