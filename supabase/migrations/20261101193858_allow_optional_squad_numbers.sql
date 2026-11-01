-- v58.28: optional permanent squad numbers. Prepared for explicit database approval.
-- Existing roster identities, jersey values, events, receipts and opening paid memberships are not rewritten.
-- Null is the pending state; numeric jerseys keep their 1–99 CHECK and active UNIQUE index.
ALTER TABLE public.team_roster DROP CONSTRAINT roster_regular_jersey_required;

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
      end if;
      if gid is not null and not exists(select 1 from skor_private.dues_groups g join skor_private.dues_members dm on dm.group_id=g.id and dm.player_id=pid and dm.active
        join skor_private.dues_matches m on m.group_id=g.id and m.match_id=mid where g.id=gid and g.kind='event') then raise exception 'Guest is not an active participant of that event/game.';end if;
      if temp.id is null then
        if not r.is_guest then raise exception 'Promoted players use their regular roster entry for new games.';end if;
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
end $function$
;

CREATE OR REPLACE FUNCTION public.get_public_player_season_stats()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with event_source as (
    select e.*
    from public.match_events e
    join public.matches m on m.id = e.match_id
    where m.published = true and m.status <> 'scheduled'
  ), contributions as (
    select skor_private.canonical_participant_key(e.match_id,e.roster_player_key) as player_key,
           coalesce(nullif(trim(e.roster_player_number),''),nullif(trim(e.player_number),'')) as number,
           e.player_name as name,
           case e.event_type when 'skor_goal' then 'goals'
             when 'skor_yellow_card' then 'yellow' else 'red' end as metric
    from event_source e
    where e.event_type in ('skor_goal','skor_yellow_card','skor_red_card')
    union all
    select skor_private.canonical_participant_key(e.match_id,e.assist_roster_player_key),
           coalesce(nullif(trim(e.assist_roster_player_number),''),nullif(trim(e.assist_player_number),'')),
           e.assist_player_name, 'assists'
    from event_source e
    where e.event_type = 'skor_goal'
      and coalesce(nullif(trim(e.assist_player_name),''),nullif(trim(e.assist_player_number),''),nullif(trim(e.assist_roster_player_number),''),e.assist_roster_player_key) is not null
    union all
    select skor_private.canonical_participant_key(m.id,m.man_of_match_player_key),
           coalesce(nullif(trim(m.man_of_match_roster_player_number),''),nullif(trim(m.man_of_match_player_number),'')),
           m.man_of_match_player_name, 'motm'
    from public.matches m
    where m.published = true
      and coalesce(nullif(trim(m.man_of_match_player_name),''),nullif(trim(m.man_of_match_player_number),''),nullif(trim(m.man_of_match_roster_player_number),''),m.man_of_match_player_key) is not null
  ), resolved as (
    select p.player_key,
           case when p.player_key is not null then coalesce(p.jersey_number::text,'TBD') else coalesce(c.number,'') end as number,
           coalesce(p.display_name,nullif(split_part(trim(c.name),' ',1),''),'Unknown') as name,
           c.metric
    from contributions c
    left join lateral (
      select r.player_key,r.jersey_number,r.display_name
      from public.public_roster r
      where (c.player_key is not null and r.player_key = c.player_key)
         or (c.player_key is null and r.jersey_number::text = c.number)
      limit 1
    ) p on true
  ), players as (
    select r.player_key,r.number,r.name,
           count(*) filter (where r.metric = 'goals') as goals,
           count(*) filter (where r.metric = 'assists') as assists,
           count(*) filter (where r.metric = 'yellow') as yellow,
           count(*) filter (where r.metric = 'red') as red,
           count(*) filter (where r.metric = 'motm') as motm
    from resolved r
    group by r.player_key,r.number,r.name
  )
  select jsonb_build_object(
    'players',coalesce((select jsonb_agg(to_jsonb(p) order by p.number,p.name) from players p),'[]'::jsonb),
    'totals',jsonb_build_object(
      'goals',(select count(*) from event_source e where e.event_type in ('skor_goal','opponent_own_goal')),
      'assists',(select count(*) from contributions c where c.metric = 'assists'),
      'yellow',(select count(*) from event_source e where e.event_type = 'skor_yellow_card'),
      'red',(select count(*) from event_source e where e.event_type = 'skor_red_card'),
      'motm',(select count(*) from contributions c where c.metric = 'motm')
    )
  );
$function$
;

-- Official post-match events use this match's saved jersey and canonical player key.
CREATE OR REPLACE FUNCTION skor_private.post_match_people(mid uuid)
 RETURNS TABLE(player_key text, name text, number integer, is_temp boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select r.player_key,coalesce(nullif(trim(r.preferred_name),''),split_part(trim(r.full_name),' ',1)),case when a.numbers ? r.player_key then
      case when (a.numbers->>r.player_key) ~ '^[0-9]{1,2}$' then
        case when (a.numbers->>r.player_key)::integer between 1 and 99 then (a.numbers->>r.player_key)::integer end
      end else r.jersey_number end,r.is_guest
  from public.team_roster r
  left join lateral (select v.state->'matchJerseys' as numbers from public.lineup_variations v
    where v.event_key=mid::text and v.is_production=true limit 1) a on true
  where
    ((r.active and not r.is_guest) or (r.is_guest and skor_private.guest_match_access(r.id,mid))
      or exists(select 1 from public.match_events e where e.match_id=mid and r.player_key in(e.roster_player_key,e.assist_roster_player_key)))
    and (not exists(select 1 from skor_private.guest_match_links l join public.match_temp_players t on t.id=l.temp_id and t.active
      where l.player_id=r.id and l.match_id=mid and l.active)
      or exists(select 1 from public.match_events e where e.match_id=mid and r.player_key in(e.roster_player_key,e.assist_roster_player_key)))
  union all
  select 'temp:'||t.id::text,split_part(trim(t.display_name),' ',1),t.jersey_number,true
  from public.match_temp_players t where t.match_id=mid and (t.active or exists(select 1 from public.match_events e
    where e.match_id=mid and 'temp:'||t.id::text in(e.roster_player_key,e.assist_roster_player_key)));
$function$
;


