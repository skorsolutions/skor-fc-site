-- Approved disposable event fixtures; no existing match/lineup/strategy is changed.
begin;
do $test$
declare
  cap uuid; cap_email text; pid uuid; uid uuid; pkey text; other_uid uuid;
  gid uuid:=gen_random_uuid(); mid uuid:=gen_random_uuid(); lid uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); scid uuid:=gen_random_uuid();
  revision timestamptz; result jsonb; event jsonb; plan jsonb;
begin
  select u.id,u.email into cap,cap_email from auth.users u join public.captain_allowlist c on lower(c.email)=lower(u.email)
    where c.active and c.role in ('captain','super_admin') order by u.id limit 1;
  select r.id,pa.auth_user_id,r.player_key into pid,uid,pkey from public.team_roster r join public.player_access pa on pa.roster_player_id=r.id
    where r.active and r.portal_enabled and pa.active and pa.auth_user_id is not null order by r.id limit 1;
  select pa.auth_user_id into other_uid from public.player_access pa join public.team_roster r on r.id=pa.roster_player_id
    where r.active and r.portal_enabled and pa.active and pa.auth_user_id is not null and pa.auth_user_id<>uid limit 1;
  if cap is null or uid is null or other_uid is null then raise exception 'Linked identities required.'; end if;
  insert into public.matches(id,slug,kickoff,home_team,away_team,published)
    values(mid,'verify-dues-'||mid,now()+interval '1 day','Fixture home','Fixture away',true);
  insert into public.lineup_variations(id,event_key,event_label,name,state,is_production)
    values(lid,mid::text,'Fixture event','Fixture Final',jsonb_build_object('formation','4-4-2','slots',jsonb_build_object('GK',pkey),'bench','[]'::jsonb),true);
  insert into public.match_strategies(id,match_id,event_key,event_label,source_lineup_variation_id,title,created_by,updated_by,lineup_snapshot,scenes)
    values(sid,mid,mid::text,'Fixture event',lid,'Fixture strategy',cap,cap,'{"private":"PRIVATE_SENTINEL"}',
      '[{"name":"Bundle","points":"PRIVATE_SENTINEL","subScenes":[{"name":"Step","home":[{"id":"p18","name":"Fixture player","number":18,"keeperNumber":30,"keeperLabel":"starting temp keeper","x":50,"y":90,"email":"PRIVATE_SENTINEL"}],"opponents":[],"ball":{"x":50,"y":70},"drawings":[]}]}]') returning updated_at into revision;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',cap,'email',cap_email,'role','authenticated')::text,true);execute 'set local role authenticated';
  perform public.manage_team_dues('create_group',jsonb_build_object('group_id',gid,'name','Fixture event','tag','fixture-'||gid,'kind','event','players',jsonb_build_array(pid),'matches',jsonb_build_array(mid)));
  plan:=jsonb_build_object('costs',jsonb_build_array(jsonb_build_object('label','Event cost','cents',10000)),'contribution_cents',0,'players',jsonb_build_array(jsonb_build_object('player_id',pid,'discount',0)));
  perform public.manage_team_dues('save_scenario',jsonb_build_object('group_id',gid,'revision',0,'id',scid,'name','Fixture costs','plan',plan));
  perform public.manage_team_dues('finalize',jsonb_build_object('group_id',gid,'revision',0,'id',scid));
  perform public.manage_team_dues('share_strategy',jsonb_build_object('group_id',gid,'revision',1,'id',sid,'source_revision',revision));
  execute 'reset role';perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);execute 'set local role authenticated';
  result:=public.get_my_dues();select x into event from jsonb_array_elements(result->'groups') x where x->>'id'=gid::text;
  if event is null or (event->'balance'->>'balance_cents')::bigint<>10000 or jsonb_array_length(event->'matches')<>1
    or event->'matches'->0->'lineup' is null or jsonb_array_length(event->'matches'->0->'strategies')<>1 then raise exception 'Unpaid participant cannot see ready event content.'; end if;
  if event::text like '%PRIVATE_SENTINEL%' then raise exception 'Captain source/notes/contact fields leaked.'; end if;
  if event->'matches'->0->'strategies'->0->'scenes'->0->'subScenes'->0->'home'->0->>'keeperNumber'<>'30' then raise exception 'Keeper pair metadata was removed.'; end if;
  execute 'reset role';perform set_config('request.jwt.claims',jsonb_build_object('sub',other_uid,'role','authenticated')::text,true);execute 'set local role authenticated';
  result:=public.get_my_dues();if exists(select 1 from jsonb_array_elements(result->'groups') x where x->>'id'=gid::text) then raise exception 'Untagged player sees private event.'; end if;
  execute 'reset role';
  update skor_private.dues_strategy_shares set source_revision=source_revision-interval '1 second' where group_id=gid;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);execute 'set local role authenticated';
  result:=public.get_my_dues();select x into event from jsonb_array_elements(result->'groups') x where x->>'id'=gid::text;
  if jsonb_array_length(event->'matches'->0->'strategies')<>0 then raise exception 'Changed source revision remains shared.'; end if;
  execute 'reset role';update skor_private.dues_strategy_shares set source_revision=revision where group_id=gid;
  update public.lineup_variations set is_production=false where id=lid;
  execute 'set local role authenticated';result:=public.get_my_dues();select x into event from jsonb_array_elements(result->'groups') x where x->>'id'=gid::text;
  if event->'matches'->0->'lineup'<>'null'::jsonb or jsonb_array_length(event->'matches'->0->'strategies')<>0 then raise exception 'Nonfinal lineup/strategy is visible.'; end if;
  execute 'reset role';update public.lineup_variations set is_production=true where id=lid;update public.matches set published=false where id=mid;
  execute 'set local role authenticated';result:=public.get_my_dues();select x into event from jsonb_array_elements(result->'groups') x where x->>'id'=gid::text;
  if jsonb_array_length(event->'matches')<>0 then raise exception 'Unpublished event match is visible.'; end if;
  execute 'reset role';update public.matches set published=true where id=mid;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',cap,'email',cap_email,'role','authenticated')::text,true);execute 'set local role authenticated';
  perform public.manage_team_dues('save_group',jsonb_build_object('group_id',gid,'revision',2,'name','Fixture event','tag','fixture-'||gid,'players','[]'::jsonb,'matches',jsonb_build_array(mid),'removal_action','retain_history'));
  execute 'reset role';perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);execute 'set local role authenticated';
  result:=public.get_my_dues();select x into event from jsonb_array_elements(result->'groups') x where x->>'id'=gid::text;
  if (event->'balance'->>'active')::boolean or (event->'balance'->>'balance_cents')::bigint<>10000 or jsonb_array_length(event->'matches')<>0 then raise exception 'Removed membership lost balance or retained event access.'; end if;
  execute 'reset role';
end $test$;
rollback;
select true as event_visibility_verification_passed;
