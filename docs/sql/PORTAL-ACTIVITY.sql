-- v58.6: repair Captain/Player Portal activity.
-- Explicitly approved and applied 2026-10-19 as 20261019065353 repair_portal_activity.
-- Executed SHA-256 before this audit-header update:
-- 08ad288a7c4ee5a3b971dddfe19f5fba453ade13649049ea5e7ebda95f0df250.
-- Existing event IDs, timestamps, legacy history and access claims are preserved.

alter table public.player_portal_login_events
  add column portal text not null default 'player'
    check (portal in ('player','captain'));
alter table public.player_portal_login_events alter column player_id drop not null;
alter table public.player_portal_login_events
  add constraint portal_activity_identity_required
    check (player_id is not null or auth_user_id is not null);
alter table public.player_portal_login_events enable row level security;
revoke all on table public.player_portal_login_events from anon, authenticated;
create index portal_activity_account_seen_idx
  on public.player_portal_login_events(auth_user_id,portal,last_seen_at desc);
create index portal_activity_player_seen_idx
  on public.player_portal_login_events(player_id,last_seen_at desc);

create or replace function public.record_my_portal_activity(p_portal text)
returns uuid
language plpgsql security definer set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_player uuid;
  v_event uuid;
  v_now timestamptz := now();
begin
  if v_user is null then raise exception 'Sign in first.'; end if;
  if p_portal is null or p_portal not in ('player','captain') then
    raise exception 'Unknown portal.';
  end if;
  v_player := public.current_player_id();
  if p_portal='player' and v_player is null then
    raise exception 'Player portal authorization required.';
  end if;
  if p_portal='captain' and not public.is_approved_captain() then
    raise exception 'Captain portal authorization required.';
  end if;

  -- The caller can record only their own server-resolved identity/time.
  -- Serialize tabs/retries so simultaneous opens reuse the same session.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('skor-activity:'||v_user::text||':'||p_portal,0));
  select e.id into v_event
  from public.player_portal_login_events e
  where e.auth_user_id=v_user and e.portal=p_portal
    and e.player_id is not distinct from v_player
    and e.event_type='portal_login'
    and e.last_seen_at >= v_now-interval '15 minutes'
  order by e.last_seen_at desc, e.id
  limit 1;
  if v_event is not null then
    update public.player_portal_login_events
      set last_seen_at=v_now,open_count=open_count+1
      where id=v_event;
  else
    insert into public.player_portal_login_events
      (player_id,auth_user_id,event_type,portal,occurred_at,last_seen_at,open_count)
    values (v_player,v_user,'portal_login',p_portal,v_now,v_now,1)
    returning id into v_event;
  end if;
  return v_event;
end;
$function$;
revoke all on function public.record_my_portal_activity(text) from public, anon, authenticated;
grant execute on function public.record_my_portal_activity(text) to authenticated;

-- Keep older Player Portal tabs compatible and correctly labeled. Their existing
-- no-argument recorder shares the same session lock and authorization checks.
create or replace function public.record_my_player_portal_login()
returns uuid
language sql security invoker set search_path = ''
as $function$
  select public.record_my_portal_activity('player'::text);
$function$;
revoke all on function public.record_my_player_portal_login() from public, anon, authenticated;
grant execute on function public.record_my_player_portal_login() to authenticated;

create or replace function public.get_portal_activity(p_limit_per_person integer default 5)
returns table (
  participant_id text, roster_player_id uuid, jersey_number integer,
  display_name text, playing_status text, portal_role text,
  event_id uuid, event_type text, portal text,
  occurred_at timestamptz, last_seen_at timestamptz, open_count integer
)
language plpgsql security definer set search_path = ''
as $function$
begin
  if auth.uid() is null or not public.is_skor_captain() then
    raise exception 'Captain access required.';
  end if;
  return query
  with participants as (
    -- Roster activity follows the claimed identity, never an editable name/email.
    select 'player:'||r.id::text as person_id,r.id as player_id,
      pa.auth_user_id as user_id,r.jersey_number as number,
      coalesce(nullif(trim(r.preferred_name),''),split_part(trim(r.full_name),' ',1)) as name,
      coalesce(ps.playing_status,'active') as status,
      coalesce(c.role,'player') as role
    from public.team_roster r
    left join public.player_access pa on pa.roster_player_id=r.id and pa.active
    left join public.player_playing_status ps on ps.player_id=r.id
    left join auth.users u on u.id=pa.auth_user_id
    left join public.captain_allowlist c on lower(c.email)=lower(u.email) and c.active
    where r.active
    union all
    -- Approved console accounts without a claimed player remain separate.
    select 'captain:'||pg_catalog.md5(lower(c.email)),null::uuid,u.id,null::integer,
      coalesce(nullif(trim(c.display_name),''),'Captain account'),
      'active',c.role
    from public.captain_allowlist c
    left join auth.users u on lower(u.email)=lower(c.email)
    where c.active
      and not exists (
        select 1 from public.player_access pa
        join public.team_roster r on r.id=pa.roster_player_id and r.active
        where pa.auth_user_id=u.id and pa.active
      )
  )
  select p.person_id,p.player_id,p.number,p.name,p.status,p.role,
    e.id,e.event_type,e.portal,e.occurred_at,e.last_seen_at,e.open_count
  from participants p
  left join lateral (
    select le.id,le.event_type,le.portal,le.occurred_at,le.last_seen_at,le.open_count
    from public.player_portal_login_events le
    where (p.player_id is not null and le.player_id=p.player_id)
       or (p.user_id is not null and le.auth_user_id=p.user_id and le.portal='captain'
           and (le.player_id is null or le.player_id=p.player_id))
    order by le.last_seen_at desc,le.occurred_at desc,le.id
    limit greatest(1,least(coalesce(p_limit_per_person,5),10))
  ) e on true
  order by p.number nulls last,p.name,e.last_seen_at desc nulls last;
end;
$function$;
revoke all on function public.get_portal_activity(integer) from public, anon, authenticated;
grant execute on function public.get_portal_activity(integer) to authenticated;
