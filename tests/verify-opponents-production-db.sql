-- Administrative post-deploy verification only. Fictional unpublished fixtures
-- and all scouting writes roll back; no auth user or real roster is changed.
begin;
do $test$
declare cap uuid;email text;mid uuid:=gen_random_uuid();oid uuid;obsid uuid:=gen_random_uuid();profile jsonb;snap jsonb;payload jsonb;v jsonb;
begin
 select u.id,u.email into cap,email from auth.users u join public.captain_allowlist c on lower(c.email)=lower(u.email) where c.active and c.role in('captain','super_admin') limit 1;
 if cap is null then raise exception 'Existing approved captain required';end if;
 insert into public.matches(id,slug,kickoff,home_team,away_team,status,published) values(mid,'verify-opponent-'||mid,now()+interval '10 days','SKOR FC','Fixture scouting '||mid,'scheduled',false);
 select opponent_id into oid from skor_private.opponent_games where match_id=mid;
 if oid is null then raise exception 'Fixture did not link';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',cap,'email',email,'role','authenticated')::text,true);execute 'set local role authenticated';
 snap:=public.get_opponents_console(oid);
 if jsonb_array_length(snap->'matches')<>1 then raise exception 'Console fixture scope failed';end if;
 payload:=jsonb_build_object('name','Fixture scouting '||mid,'ai_enabled',true,'details',jsonb_build_object('style','Fixture high press','dangerous_players',jsonb_build_array(jsonb_build_object('number','10','position','ST','threat','Fixture runs','containment','Fixture cover'))));
 profile:=public.save_opponent_scouting('profile',oid,1,payload);
 if profile->'details'->>'style'<>'Fixture high press' then raise exception 'Profile roundtrip failed';end if;
 if public.save_opponent_scouting('profile',oid,1,payload)->>'revision'<>'2' then raise exception 'Lost-response retry failed';end if;
 begin perform public.save_opponent_scouting('profile',oid,1,jsonb_build_object('name','Stale fixture','details','{}'::jsonb));raise exception 'Stale write accepted';exception when serialization_failure then null;end;
 perform public.save_opponent_scouting('observation',obsid,0,jsonb_build_object('opponent_id',oid,'match_id',mid,'kind','expected','phase','pregame','formation','4-3-3','details',jsonb_build_object('notes','Fixture expected shape')));
 snap:=public.get_opponent_scouting_for_match(mid,true);
 if snap->>'opponent_id'<>oid::text or jsonb_array_length(snap->'observations')<>1 or snap->'observations'->0->>'formation'<>'4-3-3' then raise exception 'Scouting snapshot failed';end if;
 v:=public.get_match_plan_candidates(mid);
 if jsonb_typeof(v)<>'array' then raise exception 'Candidates failed';end if;
 payload:=payload||jsonb_build_object('ai_enabled',false);perform public.save_opponent_scouting('profile',oid,2,payload);
 if public.get_opponent_scouting_for_match(mid,true)->'profile'<>'null'::jsonb then raise exception 'AI opt-out failed';end if;
 if public.get_opponent_scouting_for_match(mid,false)->'profile'='null'::jsonb then raise exception 'Captain lost opt-out profile';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',cap,'email','viewer@fixture.invalid','role','authenticated')::text,true);
 begin perform public.get_opponents_console(oid);raise exception 'Viewer read accepted';exception when insufficient_privilege then null;end;
 begin perform public.save_opponent_scouting('profile',oid,3,payload);raise exception 'Viewer write accepted';exception when insufficient_privilege then null;end;
 begin perform public.get_match_plan_candidates(mid);raise exception 'Viewer candidates accepted';exception when insufficient_privilege then null;end;
 execute 'set local role postgres';
 if has_function_privilege('anon','public.get_opponents_console(uuid)','execute') or has_function_privilege('anon','public.get_match_plan_candidates(uuid)','execute') then raise exception 'Anonymous RPC execution enabled';end if;
 if has_table_privilege('authenticated','skor_private.opponents','select') or has_table_privilege('authenticated','skor_private.opponent_observations','insert') then raise exception 'Direct private grants found';end if;
 if exists(select 1 from public.matches where id=mid and published) then raise exception 'Fixture published';end if;
end $test$;
rollback;
select true as opponents_production_rollback_passed;
