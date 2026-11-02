-- v58.31: match records require real squad selection or official participation evidence.
-- Prepared for explicit database approval. No production data is rewritten or deleted.
begin;
create or replace function skor_private.lineup_has_participant(plan jsonb,pkey text)
returns boolean language sql immutable set search_path='' as $lineup$
  select coalesce(
    case when plan->>'formation'='Freeform / Custom' then
      jsonb_typeof(plan->'freeform'->pkey)='object'
      and jsonb_typeof(plan->'freeform'->pkey->'x')='number'
      and jsonb_typeof(plan->'freeform'->pkey->'y')='number'
    else exists(select 1 from jsonb_each_text(case when jsonb_typeof(plan->'slots')='object' then plan->'slots' else '{}'::jsonb end) s where s.value=pkey) end
    or (case when jsonb_typeof(plan->'bench')='array' then plan->'bench' else '[]'::jsonb end) ? pkey,false);
$lineup$;
create or replace function skor_private.match_has_participant_record(mid uuid,pkeys text[],pid uuid)
returns boolean language sql stable set search_path='' as $record$
  select
    exists(select 1 from public.lineup_variations v where v.event_key=mid::text and v.is_production
      and exists(select 1 from unnest(pkeys) k where skor_private.lineup_has_participant(v.state,k)))
    or exists(select 1 from public.match_events e where e.match_id=mid and (e.roster_player_key=any(pkeys) or e.assist_roster_player_key=any(pkeys)))
    or exists(select 1 from public.matches m where m.id=mid and m.man_of_match_player_key=any(pkeys))
    or exists(select 1 from public.player_match_attendance a where a.match_id=mid and a.player_id=pid and a.status='present');
$record$;
create or replace function skor_private.temp_has_participant_record(tid uuid)
returns boolean language sql stable set search_path='' as $temp$
  select coalesce((select skor_private.match_has_participant_record(t.match_id,
    case when l.player_id is null then array['temp:'||t.id::text] else skor_private.participant_keys(l.player_id,t.match_id) end,l.player_id)
    from public.match_temp_players t left join skor_private.guest_match_links l on l.temp_id=t.id where t.id=tid),false);
$temp$;
revoke all on function skor_private.lineup_has_participant(jsonb,text),skor_private.match_has_participant_record(uuid,text[],uuid),skor_private.temp_has_participant_record(uuid) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.get_guest_console()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or not public.is_skor_captain() then raise exception 'Captain access required.' using errcode='42501';end if;
  return jsonb_build_object('history_version',1,'participation_version',1,'as_of',now(),'ledger',public.get_captain_dues(),
    'profiles',(select coalesce(jsonb_agg(to_jsonb(g)||jsonb_build_object('full_name',r.full_name,'preferred_name',r.preferred_name,'position',r.position,
      'is_guest',r.is_guest,'player_key',r.player_key,'record',skor_private.participant_record(r.id)) order by r.full_name),'[]') from skor_private.guest_profiles g join public.team_roster r on r.id=g.player_id),
    'links',(select coalesce(jsonb_agg(to_jsonb(l)||jsonb_build_object('number',t.jersey_number,'name',t.display_name,'inventory_id',t.jersey_inventory_id,'temp_active',t.active,'history_eligible',skor_private.temp_has_participant_record(t.id),
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
    'legacy',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'match_id',t.match_id,'name',t.display_name,'number',t.jersey_number,'active',t.active,'updated_at',t.updated_at,'inventory_id',t.jersey_inventory_id,'has_usage',skor_private.temp_entry_has_usage(t.id),'history_eligible',skor_private.temp_has_participant_record(t.id)) order by m.kickoff desc),'[]')
      from public.match_temp_players t join public.matches m on m.id=t.match_id where not exists(select 1 from skor_private.guest_match_links l where l.temp_id=t.id)),
    'fee_settings',(select coalesce(jsonb_agg(to_jsonb(f)),'[]') from skor_private.guest_fee_settings f),
    'entries',(select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc),'[]') from skor_private.dues_extra_entries e));
end $function$;
CREATE OR REPLACE FUNCTION skor_private.player_completed_matches(p_player_id uuid)
 RETURNS TABLE(match_id uuid, kickoff timestamp with time zone, home_team text, away_team text, location text, status text, attendance_status text, skor_score integer, opponent_score integer, my_goals integer, my_assists integer, my_yellow_cards integer, my_red_cards integer, my_motm boolean, record_updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select m.id,m.kickoff,m.home_team,m.away_team,m.location,m.status,
    coalesce(a.status,'unmarked'),e.skor_score,e.opponent_score,
    e.goals,e.assists,e.yellow_cards,e.red_cards,
    coalesce(m.man_of_match_player_key=any(skor_private.participant_keys(r.id,m.id)),false),
    greatest(m.updated_at,a.updated_at,e.updated_at)
  from public.team_roster r
  cross join public.matches m
  left join public.player_match_attendance a on a.player_id=r.id and a.match_id=m.id
  cross join lateral (
    select
      count(*) filter(where x.event_type in ('skor_goal','opponent_own_goal'))::integer as skor_score,
      count(*) filter(where x.event_type in ('opponent_goal','skor_own_goal'))::integer as opponent_score,
      count(*) filter(where x.event_type='skor_goal' and x.roster_player_key=any(skor_private.participant_keys(r.id,m.id)))::integer as goals,
      count(*) filter(where x.event_type='skor_goal' and x.assist_roster_player_key=any(skor_private.participant_keys(r.id,m.id)))::integer as assists,
      count(*) filter(where x.event_type='skor_yellow_card' and x.roster_player_key=any(skor_private.participant_keys(r.id,m.id)))::integer as yellow_cards,
      count(*) filter(where x.event_type='skor_red_card' and x.roster_player_key=any(skor_private.participant_keys(r.id,m.id)))::integer as red_cards,
      max(x.updated_at) as updated_at
    from public.match_events x where x.match_id=m.id
  ) e
  where r.id=p_player_id and m.published=true and m.status='final' and m.kickoff<=now()
    and ((r.is_guest and skor_private.guest_match_access(r.id,m.id) and skor_private.match_has_participant_record(m.id,skor_private.participant_keys(r.id,m.id),r.id)) or (not r.is_guest and (
      not exists(select 1 from skor_private.guest_profiles g where g.player_id=r.id and g.joined_on is not null and (m.kickoff at time zone 'America/New_York')::date<g.joined_on)
      or exists(select 1 from skor_private.guest_match_links l where l.player_id=r.id and l.match_id=m.id and skor_private.match_has_participant_record(m.id,skor_private.participant_keys(r.id,m.id),r.id)))))
    -- Do not manufacture absences for matches before the roster record existed.
    -- Explicit historical attendance or personal events still include that match.
    and (m.kickoff>=r.created_at or a.player_id is not null
      or e.goals+e.assists+e.yellow_cards+e.red_cards>0
      or m.man_of_match_player_key=any(skor_private.participant_keys(r.id,m.id))
      or (exists(select 1 from skor_private.guest_profiles g where g.player_id=r.id)
        and skor_private.match_has_participant_record(m.id,skor_private.participant_keys(r.id,m.id),r.id)));
$function$;
CREATE OR REPLACE FUNCTION public.get_my_guest_portal()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare pid uuid:=skor_private.portal_participant_id(); result jsonb;
begin
  if auth.uid() is null or not exists(select 1 from skor_private.guest_profiles gp join public.team_roster r on r.id=gp.player_id and r.is_guest where gp.player_id=pid and gp.enabled and gp.auth_user_id=auth.uid())
    then raise exception 'Guest profile access required.' using errcode='42501';end if;
  select jsonb_build_object('as_of',now(),'profile',jsonb_build_object('name',coalesce(r.preferred_name,split_part(r.full_name,' ',1)),'position',r.position),
    'record',skor_private.participant_record(pid),'roster',(select coalesce(jsonb_agg(jsonb_build_object('key',r.player_key,'name',coalesce(r.preferred_name,split_part(r.full_name,' ',1)),'number',r.jersey_number,'position',r.position)),'[]') from public.team_roster r where not r.is_guest),
    'matches',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'label',m.home_team||' vs '||m.away_team,'kickoff',m.kickoff,'location',m.location,'status',m.status,
      'number',(select t.jersey_number from skor_private.guest_match_links l join public.match_temp_players t on t.id=l.temp_id where l.player_id=pid and l.match_id=m.id),
      'attendance',(select a.status from public.player_match_attendance a where a.player_id=pid and a.match_id=m.id),
      'rsvp',(select jsonb_build_object('status',a.status,'note',a.note) from public.player_match_availability a where a.player_id=pid and a.match_id=m.id),
      'lineup',(select to_jsonb(l) from public.get_public_production_lineup(m.id) l),
      'strategies',(select coalesce(jsonb_agg(jsonb_build_object('id',s.strategy_id,'title',ms.title,'scenes',s.animation)),'[]') from skor_private.dues_strategy_shares s
        join public.match_strategies ms on ms.id=s.strategy_id and ms.updated_at=s.source_revision
        join public.lineup_variations v on v.id=ms.source_lineup_variation_id and v.is_production and v.event_key=m.id::text where s.match_id=m.id),
      'comments',(select coalesce(jsonb_agg(jsonb_build_object('comment',c.comment,'visibility',c.visibility,'created_at',c.created_at,
        'replies',(select coalesce(jsonb_agg(jsonb_build_object('name',rp.captain_name,'message',rp.message,'created_at',rp.created_at) order by rp.created_at),'[]') from public.player_captain_comment_replies rp where rp.source_comment_id=c.id and rp.player_id=pid)) order by c.created_at desc),'[]')
        from public.player_match_comments c where c.player_id=pid and c.match_id=m.id)
    ) order by m.kickoff desc),'[]') from public.matches m where skor_private.guest_match_access(pid,m.id) and (m.status<>'final' or m.kickoff>now() or skor_private.match_has_participant_record(m.id,skor_private.participant_keys(pid,m.id),pid)))) into result from public.team_roster r where r.id=pid;
  return result;
end $function$;
CREATE OR REPLACE FUNCTION public.manage_guest_history(p_action text, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      if not skor_private.temp_has_participant_record(tid) then raise exception 'This TEMP entry has no Final squad selection or confirmed participation. Refresh and review the history again.';end if;
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
end $function$;
commit;
