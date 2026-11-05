begin;
set local request.jwt.claims='{"sub":"20000000-0000-4000-8000-000000000001","email":"captain@fixture.invalid"}';
set local role authenticated;
do $$
declare console jsonb; oid uuid; profile jsonb; obs jsonb; snap jsonb;
begin
  console:=public.get_opponents_console();oid:=(console->'profile'->>'id')::uuid;
  if jsonb_array_length(console->'opponents')<>1 or jsonb_array_length(console->'matches')<>2 then raise exception 'Exact fixture identity links failed';end if;
  profile:=public.save_opponent_scouting('profile',oid,1,jsonb_build_object('name','Fixture Wolves','ai_enabled',true,'details',jsonb_build_object('style','High press','dangerous_players',jsonb_build_array(jsonb_build_object('id','scout-a','number','10','position','CAM','threat','Plays through the middle','containment','Screen the passing lane')))));
  if profile->'details'->>'style'<>'High press' then raise exception 'Profile roundtrip failed';end if;
  -- Lost-response retry returns the same revision.
  if public.save_opponent_scouting('profile',oid,1,jsonb_build_object('name','Fixture Wolves','ai_enabled',true,'details',profile->'details'))->>'revision'<>'2' then raise exception 'Retry identity failed';end if;
  begin perform public.save_opponent_scouting('profile',oid,1,'{"name":"Changed","details":{}}');raise exception 'Stale overwrite accepted';exception when serialization_failure then null;end;
  obs:=public.save_opponent_scouting('observation','30000000-0000-4000-8000-000000000001',0,jsonb_build_object('opponent_id',oid,'match_id','10000000-0000-4000-8000-000000000001','kind','observed','phase','first_half','formation','4-4-2','details','{"notes":"Observed shape"}'::jsonb));
  snap:=public.get_opponent_scouting_for_match('10000000-0000-4000-8000-000000000002',true);
  if jsonb_array_length(snap->'observations')<>1 or snap->'profile'->'details'->>'style'<>'High press' then raise exception 'Scouting snapshot failed';end if;
  perform public.save_opponent_scouting('observation','30000000-0000-4000-8000-000000000002',0,jsonb_build_object('opponent_id',oid,'match_id','10000000-0000-4000-8000-000000000002','kind','expected','phase','pregame','formation','4-3-3','details','{}'::jsonb));
  if public.get_opponent_scouting_for_match('10000000-0000-4000-8000-000000000002')->'observations'->0->>'kind'<>'expected' then raise exception 'Expected is not separately retained';end if;
  begin perform public.save_opponent_scouting('observation','30000000-0000-4000-8000-000000000003',0,jsonb_build_object('opponent_id',oid,'match_id','10000000-0000-4000-8000-000000000009','kind','observed','phase','pregame','formation','4-4-2','details','{}'::jsonb));raise exception 'Wrong game accepted';exception when raise_exception then if sqlerrm='Wrong game accepted' then raise;end if;end;
  perform public.save_opponent_scouting('profile',oid,2,jsonb_build_object('name','Fixture Wolves','ai_enabled',false,'details',profile->'details'));
  snap:=public.get_opponent_scouting_for_match('10000000-0000-4000-8000-000000000002',true);
  if snap->>'ai_enabled'<>'false' or snap->'profile'<>'null'::jsonb then raise exception 'AI opt-out ignored';end if;
  if public.get_opponent_scouting_for_match('10000000-0000-4000-8000-000000000002',false)->'profile'='null'::jsonb then raise exception 'Captain lost scouting after AI opt-out';end if;
end $$;
reset role;
set local request.jwt.claims='{"sub":"20000000-0000-4000-8000-000000000002","email":"viewer@fixture.invalid"}';
set local role authenticated;
do $$begin
  begin perform public.get_opponents_console();raise exception 'Viewer accessed scouting';exception when insufficient_privilege then null;end;
  begin perform public.save_opponent_scouting('profile',gen_random_uuid(),0,'{"name":"Forbidden","details":{}}');raise exception 'Viewer wrote scouting';exception when insufficient_privilege then null;end;
end$$;
reset role;
do $$begin
  if has_function_privilege('anon','public.get_opponents_console(uuid)','execute') then raise exception 'Anonymous scouting API grant';end if;
  if has_table_privilege('authenticated','skor_private.opponents','select') or has_table_privilege('authenticated','skor_private.opponents','insert') then raise exception 'Direct table grants';end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='skor_private' and c.relname like 'opponent%' and c.relkind='r' and not c.relrowsecurity) then raise exception 'RLS missing';end if;
end$$;
rollback;
select 'Opponent database role/roundtrip/retry/conflict/AI checks passed' as result;
