-- Guest history root fix. Prepared v58.30; requires explicit migration approval.
-- No historical identities, attendance, jerseys, lineups, events or ledger rows are rewritten.
begin;
create or replace function skor_private.temp_entry_has_usage(tid uuid)
returns boolean language sql stable set search_path='' as $usage$
  select exists(select 1 from public.lineup_variations r where position(tid::text in to_jsonb(r)::text)>0)
    or exists(select 1 from public.match_events r where position(tid::text in to_jsonb(r)::text)>0)
    or exists(select 1 from public.matches r where r.man_of_match_player_key='temp:'||tid::text)
    or exists(select 1 from public.game_day_crowd_events r where r.player_key='temp:'||tid::text or r.assist_player_key='temp:'||tid::text)
    or exists(select 1 from public.game_day_event_reports r where r.player_key='temp:'||tid::text or r.assist_player_key='temp:'||tid::text)
    or exists(select 1 from public.game_day_motm_votes r where r.player_key='temp:'||tid::text)
    or exists(select 1 from public.match_strategies r where position(tid::text in to_jsonb(r)::text)>0)
    or exists(select 1 from public.strategy_scene_bundles r where position(tid::text in to_jsonb(r)::text)>0);
$usage$;
revoke all on function skor_private.temp_entry_has_usage(uuid) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.get_guest_console()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or not public.is_skor_captain() then raise exception 'Captain access required.' using errcode='42501';end if;
  return jsonb_build_object('history_version',1,'as_of',now(),'ledger',public.get_captain_dues(),
    'profiles',(select coalesce(jsonb_agg(to_jsonb(g)||jsonb_build_object('full_name',r.full_name,'preferred_name',r.preferred_name,'position',r.position,
      'is_guest',r.is_guest,'player_key',r.player_key,'record',skor_private.participant_record(r.id)) order by r.full_name),'[]') from skor_private.guest_profiles g join public.team_roster r on r.id=g.player_id),
    'links',(select coalesce(jsonb_agg(to_jsonb(l)||jsonb_build_object('number',t.jersey_number,'name',t.display_name,'inventory_id',t.jersey_inventory_id,'temp_active',t.active,
      'attendance',a.status,'rsvp',av.status,'rsvp_note',av.note)),'[]') from skor_private.guest_match_links l join public.match_temp_players t on t.id=l.temp_id
      left join public.player_match_attendance a on a.player_id=l.player_id and a.match_id=l.match_id
      left join public.player_match_availability av on av.player_id=l.player_id and av.match_id=l.match_id),
    'event_participants',(select coalesce(jsonb_agg(jsonb_build_object('player_id',p.player_id,'match_id',p.match_id,'number',null,'temp_id',null,'active',true,
      'attendance',a.status,'rsvp',av.status,'rsvp_note',av.note)),'[]')
      from (select distinct dm.player_id,gm.match_id from skor_private.dues_members dm
        join skor_private.dues_groups g on g.id=dm.group_id and g.kind='event'
        join skor_private.dues_matches gm on gm.group_id=g.id join public.team_roster r on r.id=dm.player_id and r.is_guest
        where dm.active and not exists(select 1 from skor_private.guest_match_links l where l.player_id=dm.player_id and l.match_id=gm.match_id)) p
      left join public.player_match_attendance a on a.player_id=p.player_id and a.match_id=p.match_id
      left join public.player_match_availability av on av.player_id=p.player_id and av.match_id=p.match_id),
    'legacy',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'match_id',t.match_id,'name',t.display_name,'number',t.jersey_number,'active',t.active,'updated_at',t.updated_at,'inventory_id',t.jersey_inventory_id,'has_usage',skor_private.temp_entry_has_usage(t.id)) order by m.kickoff desc),'[]')
      from public.match_temp_players t join public.matches m on m.id=t.match_id where not exists(select 1 from skor_private.guest_match_links l where l.temp_id=t.id)),
    'fee_settings',(select coalesce(jsonb_agg(to_jsonb(f)),'[]') from skor_private.guest_fee_settings f),
    'entries',(select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc),'[]') from skor_private.dues_extra_entries e));
end $function$;
CREATE OR REPLACE FUNCTION public.manage_guest_profile(p_action text, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare pid uuid:=(p->>'player_id')::uuid; mid uuid:=(p->>'match_id')::uuid; gid uuid:=(p->>'group_id')::uuid;
  request_id uuid:=(p->>'request_id')::uuid; gp skor_private.guest_profiles; r public.team_roster; temp public.match_temp_players; old skor_private.guest_operations;
  email text:=nullif(lower(trim(p->>'email')),''); n integer; sid uuid; v text; group_revision integer;
begin
  if auth.uid() is null or not public.is_skor_captain() then raise exception 'Captain access required.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(682401);
  if octet_length(p::text)>20000 then raise exception 'Request too large.'; end if;
  select * into old from skor_private.guest_operations where id=request_id;
  if found then if old.action=p_action and old.payload=p then return jsonb_build_object('ok',true,'player_id',pid);end if;raise exception 'Retry differs from the original action.';end if;
  if length(coalesce(p->>'preferred_name',''))>60 or length(coalesce(p->>'position',''))>80 then raise exception 'Preferred name or position is too long.';end if;
  if p_action='create' then
    if length(trim(coalesce(p->>'full_name',''))) not between 1 and 80 then raise exception 'Enter a name (maximum 80 characters).'; end if;
    if email is not null and (email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or exists(select 1 from public.player_access where lower(approved_email)=email)) then raise exception 'Email is invalid or already belongs to a roster profile. Review the existing profile.';end if;
    insert into public.team_roster(id,player_key,full_name,preferred_name,jersey_number,active,portal_enabled,is_guest,position,created_by)
      values(pid,pid::text,trim(p->>'full_name'),nullif(trim(p->>'preferred_name'),''),null,false,false,true,coalesce(nullif(p->>'position',''),'Player'),auth.uid());
    insert into skor_private.guest_profiles(player_id,approved_email,created_by) values(pid,email,auth.uid());
    if gid is not null then
      select revision into group_revision from skor_private.dues_groups where id=gid and kind='event' for update;
      if group_revision is null or group_revision is distinct from (p->>'revision')::integer then raise exception 'Event changed. Review the participant addition again.';end if;
      insert into skor_private.dues_members(group_id,player_id) values(gid,pid);
      update skor_private.dues_groups set revision=revision+1 where id=gid;
    end if;
  else
    select * into gp from skor_private.guest_profiles where player_id=pid for update;
    select * into r from public.team_roster where id=pid;
    if gp.player_id is null then raise exception 'Guest profile not found.';end if;
    if p_action='edit' then
      if length(trim(coalesce(p->>'full_name',''))) not between 1 and 80 then raise exception 'Enter a valid name.';end if;
      if not r.is_guest then raise exception 'Edit promoted players in Roster.';end if;
      if email is not null and (email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or exists(select 1 from public.player_access where roster_player_id<>pid and lower(approved_email)=email)) then raise exception 'Email invalid or already approved for another player.';end if;
      update public.team_roster set full_name=trim(p->>'full_name'),preferred_name=nullif(trim(p->>'preferred_name'),''),position=coalesce(nullif(p->>'position',''),'Player') where id=pid;
      update skor_private.guest_profiles set approved_email=email,enabled=coalesce((p->>'enabled')::boolean,true),
        auth_user_id=case when approved_email is distinct from email then null else auth_user_id end where player_id=pid;
    elsif p_action='bind_game' then
      if not gp.enabled or not exists(select 1 from public.matches where id=mid) then raise exception 'Choose an enabled guest and an existing game.';end if;
      select t.* into temp from skor_private.guest_match_links l join public.match_temp_players t on t.id=l.temp_id where l.player_id=pid and l.match_id=mid;
      if temp.id is not null and p->>'temp_id' is not null and temp.id<>(p->>'temp_id')::uuid then raise exception 'This profile already has another TEMP identity in that game. Review it first.';end if;
      if p->>'temp_id' is not null then
        if coalesce((p->>'reviewed')::boolean,false) is not true then raise exception 'Review and confirm the historical appearance.';end if;
        select * into temp from public.match_temp_players where id=(p->>'temp_id')::uuid and match_id=mid;
        if not found then raise exception 'Historical TEMP row not found.';end if;
        if exists(select 1 from public.match_temp_players other where other.match_id=mid and other.id<>temp.id
          and lower(regexp_replace(trim(other.display_name),'\s+',' ','g'))=lower(regexp_replace(trim(temp.display_name),'\s+',' ','g'))
          and (other.active or skor_private.temp_entry_has_usage(other.id))) then
          raise exception 'Another active or referenced TEMP identity exists for this person in that game. Review the duplicate before linking.';
        end if;
      end if;
      if gid is not null and not exists(select 1 from skor_private.dues_groups g join skor_private.dues_members dm on dm.group_id=g.id and dm.player_id=pid and dm.active
        join skor_private.dues_matches m on m.group_id=g.id and m.match_id=mid where g.id=gid and g.kind='event') then raise exception 'Guest is not an active participant of that event/game.';end if;
      if temp.id is null then
        if not r.is_guest then raise exception 'Promoted players use their regular roster entry for new games.';end if;
        if exists(select 1 from public.match_temp_players t where t.match_id=mid
          and lower(regexp_replace(trim(t.display_name),'\s+',' ','g'))=lower(regexp_replace(trim(r.full_name),'\s+',' ','g'))
          and not exists(select 1 from skor_private.guest_match_links l where l.temp_id=t.id)) then
          raise exception 'Saved TEMP entries for this person need review in Roster / Guest directory before adding them again.';
        end if;
        insert into public.match_temp_players(match_id,display_name,jersey_number,created_by) values(mid,r.full_name,nullif(p->>'number','')::integer,auth.uid()) returning * into temp;
      elsif p ? 'number' then
        n:=nullif(p->>'number','')::integer;
        if temp.jersey_inventory_id is not null and n is distinct from temp.jersey_number then raise exception 'Update the existing kit assignment in Lineups / Jerseys.';end if;
        update public.match_temp_players set jersey_number=n,active=coalesce((p->>'active')::boolean,true),updated_at=now() where id=temp.id;
      end if;
      insert into skor_private.guest_match_links(player_id,match_id,temp_id,source_group_id,created_by)
        values(pid,mid,temp.id,gid,auth.uid()) on conflict(player_id,match_id) do update set active=coalesce((p->>'active')::boolean,true),source_group_id=excluded.source_group_id;
    elsif p_action='attendance' then
      if not exists(select 1 from skor_private.guest_match_links where player_id=pid and match_id=mid)
        and not exists(select 1 from skor_private.dues_members dm join skor_private.dues_groups g on g.id=dm.group_id and g.kind='event'
          join skor_private.dues_matches gm on gm.group_id=g.id and gm.match_id=mid where dm.player_id=pid and dm.active)
        then raise exception 'Assign or link this guest to the game first.';end if;
      v:=p->>'status';if v not in ('present','absent','excused','unmarked') then raise exception 'Invalid attendance.';end if;
      if v='unmarked' then delete from public.player_match_attendance where player_id=pid and match_id=mid;
      else insert into public.player_match_attendance(player_id,match_id,status,marked_by) values(pid,mid,v,auth.uid())
        on conflict(player_id,match_id) do update set status=excluded.status,marked_by=auth.uid(),updated_at=now();end if;
    elsif p_action='event_member' then
      select revision into group_revision from skor_private.dues_groups where id=gid and kind='event' for update;
      if group_revision is null or group_revision is distinct from (p->>'revision')::integer then raise exception 'Choose an unchanged event and review again.';end if;
      insert into skor_private.dues_members(group_id,player_id,active) values(gid,pid,coalesce((p->>'active')::boolean,true))
        on conflict(group_id,player_id) do update set active=excluded.active;
      update skor_private.dues_groups set revision=revision+1 where id=gid;
    elsif p_action='promote' then
      if not r.is_guest then raise exception 'This player is already on the regular roster.';end if;
      if not gp.enabled then raise exception 'Enable and review this guest before promotion.';end if;
      n:=nullif(trim(p->>'number'),'')::integer;
      if n is not null and (n not between 1 and 99 or exists(select 1 from public.team_roster where active and id<>pid and jersey_number=n)) then raise exception 'Choose an available regular squad number (1–99), or leave it blank for TBD.';end if;
      if not exists(select 1 from skor_private.dues_groups where id=gid and kind='season') then raise exception 'Choose the joining season.';end if;
      if p->>'joined_on' is null then raise exception 'Choose the first eligible season date.';end if;
      if p->'charge_plan' is not null and p->'charge_plan'<>'null'::jsonb then
        perform public.manage_participant_dues('participation',jsonb_build_object('id',gen_random_uuid(),'group_id',gid,'player_id',pid,
          'revision',(p->>'revision')::integer,'expected_old_cents',p->'expected_old_cents','plan',p->'charge_plan','reason','Reviewed at regular-season promotion'));
      end if;
      update public.team_roster set is_guest=false,active=true,portal_enabled=true,jersey_number=n,email=gp.approved_email where id=pid;
      update skor_private.guest_profiles set joined_on=(p->>'joined_on')::date,promoted_at=now() where player_id=pid;
      if gp.approved_email is not null then
        insert into public.player_access(roster_player_id,approved_email,auth_user_id,active,claimed_at) values(pid,gp.approved_email,gp.auth_user_id,true,case when gp.auth_user_id is not null then now() end)
          on conflict(roster_player_id) do update set approved_email=excluded.approved_email,auth_user_id=excluded.auth_user_id,active=true,claimed_at=excluded.claimed_at;
      end if;
      insert into skor_private.dues_members(group_id,player_id,allocation_mode) values(gid,pid,'individual') on conflict(group_id,player_id) do update set active=true;
      update skor_private.dues_groups set revision=revision+1 where id=gid;
    else raise exception 'Unknown guest action.';end if;
  end if;
  insert into skor_private.guest_operations(id,actor,action,payload) values(request_id,auth.uid(),p_action,p);
  return jsonb_build_object('ok',true,'player_id',pid);
end $function$;

create or replace function public.manage_guest_history(p_action text,p jsonb)
returns jsonb language plpgsql security definer set search_path='' as $history$
declare
  pid uuid:=(p->>'player_id')::uuid; rid uuid:=(p->>'request_id')::uuid;
  mid uuid; tid uuid; item jsonb; old skor_private.guest_operations;
  temp public.match_temp_players; roster public.team_roster; result jsonb;
  seen_games uuid[]:='{}'; seen_temps uuid[]:='{}'; n integer; inv uuid;
begin
  if auth.uid() is null or not public.is_skor_captain() then raise exception 'Captain access required.' using errcode='42501';end if;
  perform pg_advisory_xact_lock(682401);
  if rid is null or pid is null or p is null or octet_length(p::text)>20000 then raise exception 'Invalid history request.';end if;
  if p_action not in ('import','assign') then raise exception 'Unknown history action.';end if;
  select * into old from skor_private.guest_operations where id=rid;
  if found then
    if old.actor=auth.uid() and old.action='history_'||p_action and old.payload=p then return jsonb_build_object('ok',true,'player_id',pid);end if;
    raise exception 'Retry differs from the original action.';
  end if;
  if coalesce((p->>'create_profile')::boolean,false) then
    if exists(select 1 from public.team_roster r where lower(regexp_replace(trim(r.full_name),'\s+',' ','g'))=lower(regexp_replace(trim(p->>'full_name'),'\s+',' ','g')))
      and coalesce((p->>'different_person')::boolean,false) is not true then
      raise exception 'A profile already uses this name. Choose the existing person, or explicitly confirm this is a different person.';
    end if;
    perform public.manage_guest_profile('create',jsonb_build_object('request_id',gen_random_uuid(),'player_id',pid,'full_name',p->>'full_name',
      'preferred_name',p->>'preferred_name','email',p->>'email','position',coalesce(p->>'position','Player')));
  end if;
  select * into roster from public.team_roster where id=pid;
  if roster.id is null or not exists(select 1 from skor_private.guest_profiles g where g.player_id=pid and g.enabled) then raise exception 'Choose an enabled reusable profile.';end if;
  if p_action='import' then
    if coalesce((p->>'reviewed')::boolean,false) is not true or jsonb_typeof(p->'games') is distinct from 'array' then raise exception 'Review the person and selected saved games.';end if;
    if jsonb_array_length(p->'games') not between 1 and 50 then raise exception 'Select between 1 and 50 saved games.';end if;
    for item in select value from jsonb_array_elements(p->'games') loop
      tid:=(item->>'temp_id')::uuid;mid:=(item->>'match_id')::uuid;
      if tid is null or mid is null or mid=any(seen_games) or tid=any(seen_temps) then raise exception 'Select only one TEMP assignment per game.';end if;
      seen_games:=array_append(seen_games,mid);seen_temps:=array_append(seen_temps,tid);
      select * into temp from public.match_temp_players where id=tid and match_id=mid for update;
      if not found or nullif(item->>'updated_at','') is null or temp.updated_at is distinct from (item->>'updated_at')::timestamptz then
        raise exception 'Saved game changed. Refresh and review the history again.';
      end if;
      if exists(select 1 from skor_private.guest_match_links l where l.temp_id=tid) then raise exception 'This TEMP assignment was already linked. Refresh and review.';end if;
      if exists(select 1 from public.match_temp_players other where other.match_id=mid and other.id<>tid
        and lower(regexp_replace(trim(other.display_name),'\s+',' ','g'))=lower(regexp_replace(trim(temp.display_name),'\s+',' ','g'))
        and (other.active or skor_private.temp_entry_has_usage(other.id))
        and not exists(select 1 from skor_private.guest_match_links l where l.temp_id=other.id)) then
        raise exception 'Another active or referenced TEMP identity exists for this person in that game. Review the duplicate before linking.';
      end if;
      -- No number or active field: preserve the exact historical assignment, even when archived.
      perform public.manage_guest_profile('bind_game',jsonb_build_object('request_id',gen_random_uuid(),'player_id',pid,'match_id',mid,'temp_id',tid,'reviewed',true));
    end loop;
  else
    mid:=(p->>'match_id')::uuid;
    if not roster.is_guest then raise exception 'Regular players use the roster entry and match jersey panel.';end if;
    if mid is null then raise exception 'Choose a game.';end if;
    select t.* into temp from skor_private.guest_match_links l join public.match_temp_players t on t.id=l.temp_id where l.player_id=pid and l.match_id=mid for update of t;
    -- bind_game reuses the canonical identity and refuses unreviewed same-game legacy records.
    result:=public.manage_guest_profile('bind_game',jsonb_build_object('request_id',gen_random_uuid(),'player_id',pid,'match_id',mid,'group_id',p->'group_id'));
    select t.* into temp from skor_private.guest_match_links l join public.match_temp_players t on t.id=l.temp_id where l.player_id=pid and l.match_id=mid for update of t;
    if p ? 'inventory_id' then
      inv:=nullif(p->>'inventory_id','')::uuid;
      update public.match_temp_players set jersey_inventory_id=inv,jersey_number=case when inv is null then null else jersey_number end,active=true,updated_at=now() where id=temp.id;
    elsif p ? 'number' then
      n:=nullif(p->>'number','')::integer;
      if temp.jersey_inventory_id is not null and n is distinct from temp.jersey_number then raise exception 'Update the existing kit assignment in Lineups / Jerseys.';end if;
      update public.match_temp_players set jersey_number=n,active=true,updated_at=now() where id=temp.id;
    else update public.match_temp_players set active=true,updated_at=now() where id=temp.id;
    end if;
  end if;
  insert into skor_private.guest_operations(id,actor,action,payload) values(rid,auth.uid(),'history_'||p_action,p);
  return jsonb_build_object('ok',true,'player_id',pid);
end $history$;
revoke all on function public.manage_guest_history(text,jsonb) from public,anon;
grant execute on function public.manage_guest_history(text,jsonb) to authenticated;

-- Old clients must use the guarded profile API instead of creating a fresh game identity.
create or replace function skor_private.require_guest_assignment_api()
returns trigger language plpgsql set search_path='' as $guard$
begin
  if current_user in ('anon','authenticated') then
    raise exception 'Add TEMP players through reusable guest profiles. Refresh the Captain Portal.' using errcode='42501';
  end if;
  return new;
end $guard$;
revoke all on function skor_private.require_guest_assignment_api() from public,anon,authenticated;
create trigger match_temp_players_require_profile before insert on public.match_temp_players
for each row execute function skor_private.require_guest_assignment_api();
commit;
