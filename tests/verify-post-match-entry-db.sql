-- POST-APPROVAL ONLY. Administrative connection; every fixture rolls back.
begin;
do $test$
declare
  cap uuid; cap_email text; uid uuid; player_id uuid; player_key text; other_key text;
  mid uuid:=gen_random_uuid(); other_mid uuid:=gen_random_uuid(); live_id uuid:=gen_random_uuid(); own_id uuid:=gen_random_uuid();
  temp_id uuid:=gen_random_uuid(); other_temp uuid:=gen_random_uuid(); guest_id uuid:=gen_random_uuid();
  new_goal uuid:=gen_random_uuid(); opponent_id uuid:=gen_random_uuid(); request_id uuid:=gen_random_uuid(); invalid_request uuid:=gen_random_uuid(); atomic_id uuid:=gen_random_uuid();
  snapshot jsonb; after_save jsonb; result jsonb; entries jsonb; rejected boolean; revision text; fingerprint text; original_stamp integer;
begin
  select u.id,u.email into cap,cap_email from auth.users u join public.captain_allowlist c on lower(c.email)=lower(u.email)
    where c.active and c.role in ('captain','super_admin') order by u.id limit 1;
  select pa.auth_user_id,r.id,r.player_key into uid,player_id,player_key from public.player_access pa join public.team_roster r on r.id=pa.roster_player_id and r.active
    join auth.users u on u.id=pa.auth_user_id where pa.active and not exists(select 1 from public.captain_allowlist c where lower(c.email)=lower(u.email) and c.active) limit 1;
  select r.player_key into other_key from public.team_roster r where r.active and r.id<>player_id order by r.id limit 1;
  if cap is null or uid is null or other_key is null then raise exception 'Linked captain/player identities required.';end if;
  select md5(string_agg(to_jsonb(e)::text,'' order by e.id)) into fingerprint from public.match_events e;
  insert into public.matches(id,slug,kickoff,home_team,away_team,status,published) values
    (mid,'verify-post-match-'||mid,now()-interval '2 hours','SKOR FC','Fixture opponent','first_half',true),
    (other_mid,'verify-post-match-'||other_mid,now()-interval '3 hours','Fixture opponent','SKOR FC','scheduled',true);
  insert into public.game_day_sessions(match_id,active,motm_voting_open,ref_review_open,created_by,clock_phase,clock_running,clock_elapsed_seconds)
    values(mid,false,false,true,cap,'first_half',false,321);
  insert into public.match_temp_players(id,match_id,display_name,jersey_number,created_by) values
    (temp_id,mid,'Fixture Guest',null,cap),(other_temp,other_mid,'Other match fixture',null,cap);
  insert into public.team_roster(id,player_key,full_name,active,portal_enabled,is_guest,jersey_number,created_by)
    values(guest_id,guest_id::text,'Fixture Guest',false,false,true,null,cap);
  insert into skor_private.guest_profiles(player_id,created_by) values(guest_id,cap);
  insert into skor_private.guest_match_links(player_id,match_id,temp_id,created_by) values(guest_id,mid,temp_id,cap);
  insert into public.player_match_attendance(player_id,match_id,status,marked_by) values(guest_id,mid,'present',cap),(player_id,mid,'present',cap);
  insert into public.match_events(id,match_id,event_type,half,player_name,player_number,roster_player_number,roster_player_key,created_by)
    values(live_id,mid,'skor_goal','first','Original scorer','30','18',player_key,cap),
      (own_id,mid,'opponent_own_goal','first',null,null,null,null,cap);
  select clock_elapsed_seconds into original_stamp from public.match_events where id=live_id;
  if original_stamp<>321 then raise exception 'Original live trigger no longer stamps official clock.';end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',cap,'email',cap_email,'role','authenticated')::text,true);execute 'set local role authenticated';
  snapshot:=public.get_post_match_editor(mid);revision:=snapshot->>'revision';
  if not exists(select 1 from jsonb_array_elements(snapshot->'participants') p where p->>'player_key'='temp:'||temp_id::text and p->'number'='null'::jsonb) then raise exception 'TBD match guest missing.';end if;
  entries:=jsonb_build_array(
    jsonb_build_object('id',live_id,'event_type','skor_goal','half','first','player_key',player_key,'assist_key',other_key,'assist_status','known'),
    jsonb_build_object('id',new_goal,'event_type','skor_goal','half','second','player_key','temp:'||temp_id::text,'assist_key',null,'assist_status','unknown'),
    jsonb_build_object('id',opponent_id,'event_type','opponent_goal','half','first','player_key',null,'assist_key',null,'assist_status',null));
  result:=public.save_post_match_events(mid,request_id,revision,entries,'[]',true);
  if (result->>'added')::integer<>2 or (result->>'updated')::integer<>1 or (result->>'removed')::integer<>0 then raise exception 'Atomic result counts differ.';end if;
  if public.save_post_match_events(mid,request_id,revision,entries,'[]',true)<>result then raise exception 'Exact retry did not return original result.';end if;
  rejected:=false;begin perform public.save_post_match_events(mid,request_id,revision,entries,'[]',false);exception when others then if sqlerrm not like '%different submission%' then raise;end if;rejected:=true;end;
  if not rejected then raise exception 'Changed retry accepted.';end if;
  rejected:=false;begin perform public.save_post_match_events(mid,gen_random_uuid(),revision,'[]','[]',true);exception when serialization_failure then rejected:=true;end;
  if not rejected then raise exception 'Stale event revision accepted.';end if;
  after_save:=public.get_post_match_editor(mid);revision:=after_save->>'revision';
  if after_save->'match'->>'status'<>'final' then raise exception 'Post-match save did not mark completed game Final.';end if;
  if not exists(select 1 from jsonb_array_elements(after_save->'events') e where e->>'id'=new_goal::text and e->>'half'='second' and e->>'entry_source'='post_match'
    and e->'clock_elapsed_seconds'='null'::jsonb and e->'clock_period'='null'::jsonb and e->'clock_recorded_at'='null'::jsonb) then raise exception 'Retrospective half was overwritten or a minute invented.';end if;
  if not exists(select 1 from jsonb_array_elements(after_save->'events') e where e->>'id'=live_id::text and e->>'entry_source'='live'
    and (e->>'clock_elapsed_seconds')::integer=original_stamp and e->>'player_number'='30' and e->>'roster_player_number'='18' and e->>'player_name'='Original scorer') then raise exception 'Live time or original match identity fields were changed by assist correction.';end if;
  if not exists(select 1 from jsonb_array_elements(after_save->'events') e where e->>'id'=own_id::text) then raise exception 'Own goal was lost.';end if;
  -- Invalid second row must roll back a valid first row and its request receipt.
  entries:=jsonb_build_array(
    jsonb_build_object('id',atomic_id,'event_type','skor_yellow_card','half','second','player_key',player_key),
    jsonb_build_object('id',gen_random_uuid(),'event_type','skor_goal','half','second','player_key','temp:'||other_temp::text,'assist_status','none'));
  rejected:=false;begin perform public.save_post_match_events(mid,invalid_request,revision,entries,'[]',true);exception when others then if sqlerrm not like '%Choose a roster player%' then raise;end if;rejected:=true;end;
  if not rejected then raise exception 'Cross-match TEMP identity accepted.';end if;
  result:=public.get_post_match_editor(mid);
  if result->>'revision'<>revision or exists(select 1 from jsonb_array_elements(result->'events') e where e->>'id'=atomic_id::text) then raise exception 'Failed batch partially committed.';end if;
  rejected:=false;begin perform public.save_post_match_events(mid,gen_random_uuid(),revision,'[]',jsonb_build_array(own_id),true);exception when others then if sqlerrm not like '%Only supported events%' then raise;end if;rejected:=true;end;
  if not rejected then raise exception 'Protected existing event was removed.';end if;
  -- A second captain's direct edit changes the revision, even outside this editor.
  execute 'reset role';update public.match_events set player_name='Reviewed original name' where id=live_id;
  execute 'set local role authenticated';rejected:=false;begin perform public.save_post_match_events(mid,gen_random_uuid(),revision,'[]','[]',true);exception when serialization_failure then rejected:=true;end;
  if not rejected then raise exception 'Independent event edit was overwritten.';end if;
  result:=public.get_post_match_editor(mid);revision:=result->>'revision';
  perform public.save_post_match_events(mid,gen_random_uuid(),revision,'[]',jsonb_build_array(opponent_id),false);
  result:=public.get_post_match_editor(mid);if jsonb_array_length(result->'events')<>3 then raise exception 'Reviewed removal changed the wrong rows.';end if;
  -- Stats are derived from these same official events, including bound TEMP keys.
  execute 'reset role';
  if (skor_private.participant_record(guest_id)->'summary'->>'goals')::integer<>1 then raise exception 'Guest stats do not follow exact TEMP event identity.';end if;
  if exists(select 1 from skor_private.post_match_saves s where s.request_id=invalid_request) then raise exception 'Failed save left an idempotency receipt.';end if;
  if not exists(select 1 from public.game_day_sessions where match_id=mid and clock_phase='full_time' and not clock_running and clock_elapsed_seconds=321) then raise exception 'Final save did not stop clock without inventing regulation time.';end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);execute 'set local role authenticated';
  result:=public.get_my_match_record();if not exists(select 1 from jsonb_array_elements(result->'matches') m where m->>'match_id'=mid::text and (m->>'my_goals')::integer=1) then raise exception 'Regular player record does not reflect bulk events.';end if;
  rejected:=false;begin perform public.get_post_match_editor(mid);exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception 'Player read captain bulk editor.';end if;
  rejected:=false;begin perform public.save_post_match_events(mid,gen_random_uuid(),revision,'[]','[]',true);exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception 'Player wrote official events.';end if;
  rejected:=false;begin perform count(*) from skor_private.post_match_saves;exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception 'Player read private save audit.';end if;
  execute 'reset role';perform set_config('request.jwt.claims',jsonb_build_object('sub',cap,'email',cap_email,'role','authenticated')::text,true);execute 'set local role authenticated';
  result:=public.get_post_match_editor(other_mid);perform public.save_post_match_events(other_mid,gen_random_uuid(),result->>'revision','[]','[]',true);
  execute 'reset role';if exists(select 1 from public.game_day_sessions where match_id=other_mid) then raise exception 'Saving invented a match clock/session.';end if;
  perform set_config('request.jwt.claims','{"role":"anon"}',true);execute 'set local role anon';
  rejected:=false;begin perform public.get_post_match_editor(mid);exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception 'Anonymous bulk editor allowed.';end if;
  if exists(select 1 from public.match_events where match_id=mid and event_type='skor_goal') then raise exception 'Bulk goal entry bypassed public score privacy.';end if;
  execute 'reset role';
  if fingerprint is distinct from (select md5(string_agg(to_jsonb(e)::text,'' order by e.id)) from public.match_events e where e.match_id not in(mid,other_mid)) then raise exception 'An original event was changed by verification.';end if;
  raise notice 'PASS: atomic batches, retry/stale guards, unknown clocks/assists, live-field preservation, exact guest stats, finalization, removal and real-role privacy.';
end $test$;
rollback;
select true as post_match_rollback_verification_passed;
