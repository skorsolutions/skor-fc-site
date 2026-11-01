-- POST-APPROVAL ONLY: administrative connection after OPTIONAL-SQUAD-NUMBERS.sql.
-- All fixtures and temporary identity rebinding roll back. No auth.users edits.
begin;
do $test$
declare
  cap uuid; cap_email text; uid uuid; approved text; old_player uuid;
  a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); gid uuid:=gen_random_uuid(); mid uuid:=gen_random_uuid();
  tid uuid; other_number integer; rejected boolean; data jsonb; before_paid text; before_roster text;
begin
  select u.id,u.email into cap,cap_email from auth.users u join public.captain_allowlist c on lower(c.email)=lower(u.email)
    where c.active and c.role in ('captain','super_admin') limit 1;
  select pa.roster_player_id,u.id,lower(u.email) into old_player,uid,approved from public.player_access pa join auth.users u on u.id=pa.auth_user_id and u.email_confirmed_at is not null
    where pa.active and not exists(select 1 from public.captain_allowlist c where lower(c.email)=lower(u.email) and c.active) limit 1;
  select jersey_number into other_number from public.team_roster where active and jersey_number is not null limit 1;
  if cap is null or uid is null or other_number is null then raise exception 'Verified captain/player and numbered roster fixture prerequisites required.';end if;
  select md5(string_agg(to_jsonb(m)::text,'' order by group_id,player_id)) into before_paid from skor_private.dues_members m where opening_paid;
  select md5(string_agg(to_jsonb(r)::text,'' order by id)) into before_roster from public.team_roster r;
  update public.player_access set active=false,auth_user_id=null,approved_email='released-optional-number@example.invalid' where roster_player_id=old_player;
  insert into public.matches(id,slug,kickoff,home_team,away_team,published,status) values(mid,'verify-number-'||mid,now()-interval '1 day','SKOR FC','Fixture opponent',true,'final');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',cap,'email',cap_email,'role','authenticated')::text,true);execute 'set local role authenticated';
  perform public.manage_guest_profile('create',jsonb_build_object('request_id',gen_random_uuid(),'player_id',a,'full_name','Alex Fixture One','preferred_name','Alex','email',approved));
  perform public.manage_guest_profile('create',jsonb_build_object('request_id',gen_random_uuid(),'player_id',b,'full_name','Alex Fixture Two','preferred_name','Alex'));
  perform public.manage_team_dues('create_group',jsonb_build_object('group_id',gid,'name','Optional number fixture','tag','verify-'||gid,'kind','season','players','[]'::jsonb,'matches',jsonb_build_array(mid)));
  perform public.manage_guest_profile('bind_game',jsonb_build_object('request_id',gen_random_uuid(),'player_id',a,'match_id',mid));
  data:=public.get_guest_console();select (x->>'temp_id')::uuid into tid from jsonb_array_elements(data->'links') x where x->>'player_id'=a::text and x->>'match_id'=mid::text;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'email',approved,'role','authenticated')::text,true);
  if public.resolve_player_portal()->>'mode'<>'guest' then raise exception 'Guest portal claim failed.';end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',cap,'email',cap_email,'role','authenticated')::text,true);
  rejected:=false;begin perform public.manage_guest_profile('promote',jsonb_build_object('request_id',gen_random_uuid(),'player_id',a,'group_id',gid,'joined_on',current_date,'number',other_number));exception when others then rejected:=true;end;
  if not rejected then raise exception 'Taken permanent number was accepted.';end if;
  perform public.manage_guest_profile('promote',jsonb_build_object('request_id',gen_random_uuid(),'player_id',a,'group_id',gid,'joined_on',current_date,'number',''));
  perform public.manage_guest_profile('promote',jsonb_build_object('request_id',gen_random_uuid(),'player_id',b,'group_id',gid,'joined_on',current_date));
  if (select count(*) from public.team_roster where id in(a,b) and active and not is_guest and portal_enabled and jersey_number is null)<>2 then raise exception 'Two TBD promotions were not preserved.';end if;
  if (select count(*) from public.public_roster where player_key in(a::text,b::text) and jersey_number is null)<>2 then raise exception 'TBD regular players missing from public squad.';end if;
  insert into public.lineup_variations(event_key,event_label,name,is_production,state,created_by) values(mid::text,'Fixture','Fixture',true,
    jsonb_build_object('formation','4-2-3-1','slots',jsonb_build_object('LB',a::text,'RB',b::text),'bench','[]'::jsonb,'matchJerseys',jsonb_build_object(a::text,18,b::text,19)),cap);
  -- Earlier TEMP alias survives promotion; new regular events keep canonical keys.
  insert into public.match_events(match_id,event_type,half,player_name,player_number,roster_player_key,entry_source,created_by) values
    (mid,'skor_goal','first','Alex Fixture One','18','temp:'||tid,'post_match',cap),
    (mid,'skor_goal','second','Alex Fixture Two','19',b::text,'post_match',cap);
  data:=public.get_public_player_season_stats();
  if (select count(*) from jsonb_array_elements(data->'players') x where x->>'player_key' in(a::text,b::text) and x->>'number'='TBD' and (x->>'goals')::integer=1)<>2 then raise exception 'Same-name TBD players lost or merged stats.';end if;
  if not exists(select 1 from jsonb_array_elements(public.get_post_match_editor(mid)->'participants') p where p->>'player_key'=b::text and (p->>'number')::integer=19 and (p->>'is_temp')::boolean=false) then raise exception 'Post-match editor lost regular identity or match jersey.';end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'email',approved,'role','authenticated')::text,true);
  if public.resolve_player_portal()->>'mode'<>'regular' then raise exception 'Promoted guest did not retain regular portal login.';end if;
  if public.current_player_id() is distinct from a then raise exception 'Promotion changed the claimed identity.';end if;
  rejected:=false;begin perform public.manage_guest_profile('promote',jsonb_build_object('request_id',gen_random_uuid(),'player_id',b));exception when others then rejected:=true;end;
  if not rejected then raise exception 'Player could promote another player.';end if;
  execute 'set local role postgres';
  if exists(select 1 from skor_private.dues_members where player_id in(a,b) and opening_paid) then raise exception 'Promotion invented opening paid status.';end if;
  if (select md5(string_agg(to_jsonb(m)::text,'' order by group_id,player_id)) from skor_private.dues_members m where opening_paid) is distinct from before_paid then raise exception 'Opening paid records changed.';end if;
  if (select md5(string_agg(to_jsonb(r)::text,'' order by id)) from public.team_roster r where id not in(a,b)) is distinct from before_roster then raise exception 'Original roster changed.';end if;
end $test$;
rollback;
select true as optional_squad_numbers_rollback_verification_passed;
