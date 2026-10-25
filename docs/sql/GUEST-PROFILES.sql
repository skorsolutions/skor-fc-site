-- v58.25 reviewable migration. Do not apply without explicit approval.
-- A guest has a permanent roster identity but stays inactive in the regular squad.
alter table public.team_roster add column is_guest boolean not null default false;
alter table public.team_roster alter column jersey_number drop not null;
alter table public.team_roster add constraint roster_regular_jersey_required check(is_guest or jersey_number is not null);
alter table skor_private.dues_members add column allocation_mode text not null default 'split' check(allocation_mode in ('split','individual'));
create table skor_private.guest_profiles (
  player_id uuid primary key references public.team_roster(id),
  approved_email text,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  enabled boolean not null default true,
  joined_on date,
  promoted_at timestamptz,
  last_login_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  check(approved_email is null or (approved_email=lower(trim(approved_email)) and length(approved_email) between 3 and 254))
);
create unique index guest_profile_email on skor_private.guest_profiles(approved_email) where approved_email is not null;
create table skor_private.guest_match_links (
  player_id uuid not null references skor_private.guest_profiles(player_id),
  match_id uuid not null references public.matches(id),
  temp_id uuid not null unique references public.match_temp_players(id),
  source_group_id uuid references skor_private.dues_groups(id),
  active boolean not null default true,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  primary key(player_id,match_id)
);
create index guest_link_match on skor_private.guest_match_links(match_id);
create index guest_link_group on skor_private.guest_match_links(source_group_id);
create table skor_private.guest_operations (
  id uuid primary key,
  actor uuid not null,
  action text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create table skor_private.guest_fee_settings (
  group_id uuid primary key references skor_private.dues_groups(id),
  enabled boolean not null default false,
  rate_cents bigint not null default 0 check(rate_cents between 0 and 100000000),
  effective_on date not null default current_date,
  updated_by uuid not null
);
create table skor_private.dues_extra_entries (
  id uuid primary key,
  group_id uuid not null,
  player_id uuid not null,
  category text not null check(category in ('participation','guest_fee','guest_waiver','guest_fee_reversal')),
  match_id uuid references public.matches(id),
  delta_cents bigint not null check(delta_cents between -100000000 and 100000000),
  reason text not null default '' check(length(reason)<=1000),
  request jsonb not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  foreign key(group_id,player_id) references skor_private.dues_members(group_id,player_id),
  check((category='participation' and match_id is null) or (category<>'participation' and match_id is not null))
);
create index dues_extra_member on skor_private.dues_extra_entries(group_id,player_id);
create index dues_extra_match on skor_private.dues_extra_entries(match_id);
create unique index guest_fee_once on skor_private.dues_extra_entries(group_id,player_id,match_id) where category in ('guest_fee','guest_waiver');
create unique index guest_reversal_once on skor_private.dues_extra_entries(group_id,player_id,match_id) where category='guest_fee_reversal';
-- Cover the informational event-share FK notice from the previous release.
create index dues_share_group_match on skor_private.dues_strategy_shares(group_id,match_id);

create function skor_private.portal_participant_id() returns uuid language sql stable set search_path='' as $$
select coalesce(public.current_player_id(),(
  select g.player_id from skor_private.guest_profiles g join public.team_roster r on r.id=g.player_id and r.is_guest
  where g.auth_user_id=auth.uid() and g.enabled limit 1));
$$;
create function skor_private.guest_match_access(pid uuid,mid uuid) returns boolean language sql stable set search_path='' as $$
select exists(select 1 from public.matches m where m.id=mid and m.published) and (
  exists(select 1 from skor_private.guest_match_links l join public.match_temp_players t on t.id=l.temp_id and t.active where l.player_id=pid and l.match_id=mid and l.active
    and (l.source_group_id is null or exists(select 1 from skor_private.dues_members dm where dm.group_id=l.source_group_id and dm.player_id=pid and dm.active)))
  or exists(select 1 from skor_private.dues_members dm join skor_private.dues_groups g on g.id=dm.group_id and g.kind='event'
    join skor_private.dues_matches gm on gm.group_id=g.id and gm.match_id=mid where dm.player_id=pid and dm.active)
  or exists(select 1 from skor_private.guest_match_links l join public.matches m on m.id=l.match_id and m.status='final' and m.kickoff<=now() where l.player_id=pid and l.match_id=mid)
  or exists(select 1 from public.player_match_attendance a join public.matches m on m.id=a.match_id and m.status='final' and m.kickoff<=now()
    where a.player_id=pid and a.match_id=mid and a.status='present')
);
$$;
create function public.resolve_player_portal() returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid; g skor_private.guest_profiles; verified_email text;
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode='42501'; end if;
  if public.current_player_id() is not null then return '{"mode":"regular"}'::jsonb; end if;
  select lower(u.email) into verified_email from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null;
  if verified_email is null then raise exception 'A verified email is required.' using errcode='42501'; end if;
  if exists(select 1 from public.player_access pa join public.team_roster r on r.id=pa.roster_player_id and r.active and not r.is_guest and r.portal_enabled
    where pa.active and lower(pa.approved_email)=verified_email) then
    perform public.claim_player_portal();return '{"mode":"regular"}'::jsonb;
  end if;
  select gp.* into g from skor_private.guest_profiles gp join public.team_roster r on r.id=gp.player_id and r.is_guest
    where gp.enabled and (gp.auth_user_id=auth.uid() or (gp.auth_user_id is null and gp.approved_email=verified_email)) for update of gp;
  if not found then raise exception 'Ask a captain to approve your guest profile email.' using errcode='42501'; end if;
  if exists(select 1 from public.player_access pa where pa.auth_user_id=auth.uid() and pa.roster_player_id<>g.player_id) then
    raise exception 'This account already belongs to another player. Ask a captain to review it.' using errcode='42501'; end if;
  update skor_private.guest_profiles set auth_user_id=auth.uid(),last_login_at=now() where player_id=g.player_id;
  return jsonb_build_object('mode','guest');
end $$;

create function public.preview_participation_dues(p jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare gid uuid:=(p->>'group_id')::uuid; pid uuid:=(p->>'player_id')::uuid; g skor_private.dues_groups;
  baseline bigint; fixed bigint; games integer; included integer; proposed bigint; old bigint; paid bigint; guest bigint; replace_fees boolean;
begin
  if auth.uid() is null or not public.is_skor_captain() then raise exception 'Captain access required.' using errcode='42501'; end if;
  select * into g from skor_private.dues_groups where id=gid;
  if not found or g.kind<>'season' then raise exception 'Choose a season.'; end if;
  if not exists(select 1 from public.team_roster where id=pid) then raise exception 'Player not found.'; end if;
  if exists(select 1 from skor_private.dues_members where group_id=gid and player_id=pid and opening_paid) then raise exception 'Existing confirmed-paid opening records are protected.'; end if;
  if coalesce(p->>'baseline_cents','') !~ '^[0-9]{1,9}$' or coalesce(p->>'fixed_cents','') !~ '^[0-9]{1,9}$'
    or coalesce(p->>'total_games','') !~ '^[0-9]{1,3}$' or coalesce(p->>'included_games','') !~ '^[0-9]{1,3}$' then raise exception 'Enter valid cents and whole game counts.'; end if;
  baseline:=(p->>'baseline_cents')::bigint;fixed:=(p->>'fixed_cents')::bigint;games:=(p->>'total_games')::integer;included:=(p->>'included_games')::integer;
  if baseline>100000000 or fixed>baseline or games not between 1 and 200 or included not between 0 and games then raise exception 'Check baseline, fixed costs and game counts.'; end if;
  proposed:=fixed+((baseline-fixed)*included+games/2)/games;
  select assigned_cents,paid_cents into old,paid from skor_private.dues_balances() where group_id=gid and player_id=pid;
  paid:=coalesce(paid,0);
  select coalesce(sum(delta_cents),0) into guest from skor_private.dues_extra_entries where group_id=gid and player_id=pid and category<>'participation';
  replace_fees:=coalesce((p->>'replace_guest_fees')::boolean,false);
  return jsonb_build_object('group_id',gid,'player_id',pid,'revision',g.revision,'old_cents',old,'paid_cents',paid,'guest_fee_cents',guest,
    'participation_cents',proposed,'new_cents',proposed+case when replace_fees then 0 else guest end,
    'balance_cents',proposed+case when replace_fees then 0 else guest end-paid,'delta_cents',proposed+case when replace_fees then 0 else guest end-coalesce(old,0),
    'budget_delta_cents',proposed+case when replace_fees then 0 else guest end-coalesce(old,0),'plan',p);
end $$;

create function public.manage_participant_dues(p_action text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare gid uuid:=(p->>'group_id')::uuid; pid uuid:=(p->>'player_id')::uuid; mid uuid:=(p->>'match_id')::uuid;
  rid uuid:=(p->>'id')::uuid; g skor_private.dues_groups; cfg skor_private.guest_fee_settings; old skor_private.dues_extra_entries;
  q jsonb; amount bigint; base bigint; previous bigint; fee record; entry_kind text;
begin
  if auth.uid() is null or not public.is_skor_captain() then raise exception 'Captain access required.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(682401);
  if octet_length(p::text)>20000 then raise exception 'Request too large.'; end if;
  select * into old from skor_private.dues_extra_entries where id=rid;
  if found then if old.request=p then return '{"ok":true}'::jsonb; end if;raise exception 'Retry differs from the original charge.';end if;
  select * into g from skor_private.dues_groups where id=gid for update;
  if not found or g.kind<>'season' then raise exception 'Choose a season.'; end if;
  if g.revision is distinct from (p->>'revision')::integer then raise exception 'Season changed. Refresh and review again.' using errcode='40001'; end if;
  if p_action='fee_settings' then
    insert into skor_private.guest_fee_settings(group_id,enabled,rate_cents,effective_on,updated_by)
      values(gid,(p->>'enabled')::boolean,(p->>'rate_cents')::bigint,(p->>'effective_on')::date,auth.uid())
      on conflict(group_id) do update set enabled=excluded.enabled,rate_cents=excluded.rate_cents,effective_on=excluded.effective_on,updated_by=auth.uid();
  else
    if exists(select 1 from skor_private.dues_members where group_id=gid and player_id=pid and opening_paid) then raise exception 'Confirmed-paid opening records are protected.'; end if;
    if p_action='participation' then
      q:=public.preview_participation_dues(p->'plan');
      if q->>'group_id'<>gid::text or q->>'player_id'<>pid::text or coalesce(q->'old_cents','null') is distinct from coalesce(p->'expected_old_cents','null') then raise exception 'Balance changed. Review again.'; end if;
      insert into skor_private.dues_members(group_id,player_id,allocation_mode) values(gid,pid,'individual') on conflict(group_id,player_id) do update set allocation_mode='individual';
      select coalesce(sum(delta_cents),0) into base from skor_private.dues_assessments where group_id=gid and player_id=pid;
      select coalesce(sum(delta_cents),0) into previous from skor_private.dues_extra_entries where group_id=gid and player_id=pid and category='participation';
      insert into skor_private.dues_extra_entries(id,group_id,player_id,category,delta_cents,reason,request,created_by)
        values(rid,gid,pid,'participation',(q->>'participation_cents')::bigint-base-previous,left(coalesce(p->>'reason','Reviewed participation fee'),1000),p,auth.uid());
      if coalesce((p->'plan'->>'replace_guest_fees')::boolean,false) then
        for fee in select e.* from skor_private.dues_extra_entries e where e.group_id=gid and e.player_id=pid and e.category='guest_fee'
          and not exists(select 1 from skor_private.dues_extra_entries z where z.group_id=gid and z.player_id=pid and z.match_id=e.match_id and z.category='guest_fee_reversal') loop
          insert into skor_private.dues_extra_entries(id,group_id,player_id,category,match_id,delta_cents,reason,request,created_by)
            values(gen_random_uuid(),gid,pid,'guest_fee_reversal',fee.match_id,-fee.delta_cents,'Consolidated into reviewed season assessment',p,auth.uid());
        end loop;
      end if;
    elsif p_action='guest_fee' then
      select * into cfg from skor_private.guest_fee_settings where group_id=gid and enabled;
      if not found then raise exception 'Guest fees are disabled for this season.'; end if;
      if not exists(select 1 from skor_private.guest_profiles gp join public.matches m on m.id=mid and m.published and m.status='final' and m.kickoff<=now()
        join public.player_match_attendance a on a.match_id=m.id and a.player_id=gp.player_id and a.status='present'
        join skor_private.dues_matches dm on dm.match_id=m.id and dm.group_id=gid
        where gp.player_id=pid and (exists(select 1 from skor_private.guest_match_links l where l.player_id=pid and l.match_id=mid)
          or exists(select 1 from skor_private.dues_members em join skor_private.dues_groups eg on eg.id=em.group_id and eg.kind='event'
            join skor_private.dues_matches gm on gm.group_id=eg.id and gm.match_id=mid where em.player_id=pid and em.active))
        and (m.kickoff at time zone 'America/New_York')::date>=cfg.effective_on and (gp.joined_on is null or (m.kickoff at time zone 'America/New_York')::date<gp.joined_on)) then
        raise exception 'Choose a confirmed Present guest in a completed linked season game within the fee dates.'; end if;
      if exists(select 1 from skor_private.dues_extra_entries where group_id=gid and player_id=pid and match_id=mid and category in ('guest_fee','guest_waiver')) then raise exception 'This appearance already has a fee or waiver.'; end if;
      amount:=coalesce((p->>'amount_cents')::bigint,cfg.rate_cents);entry_kind:=case when coalesce((p->>'waive')::boolean,false) then 'guest_waiver' else 'guest_fee' end;
      if entry_kind='guest_waiver' then amount:=0;if length(trim(coalesce(p->>'reason','')))=0 then raise exception 'A waiver needs a reason.';end if;end if;
      if amount not between 0 and 100000000 then raise exception 'Invalid fee.'; end if;
      insert into skor_private.dues_members(group_id,player_id,allocation_mode) values(gid,pid,'individual') on conflict(group_id,player_id) do update set allocation_mode='individual';
      insert into skor_private.dues_extra_entries(id,group_id,player_id,category,match_id,delta_cents,reason,request,created_by)
        values(rid,gid,pid,entry_kind,mid,amount,coalesce(p->>'reason',''),p,auth.uid());
    elsif p_action='reverse_guest_fee' then
      select * into old from skor_private.dues_extra_entries where id=(p->>'fee_id')::uuid and group_id=gid and player_id=pid and category='guest_fee';
      if not found or length(trim(coalesce(p->>'reason','')))=0 then raise exception 'Choose a fee and give a correction reason.'; end if;
      if exists(select 1 from skor_private.dues_extra_entries e where e.group_id=gid and e.player_id=pid and e.match_id=old.match_id and e.category='guest_fee_reversal') then raise exception 'This guest fee has already been reversed.';end if;
      insert into skor_private.dues_extra_entries(id,group_id,player_id,category,match_id,delta_cents,reason,request,created_by)
        values(rid,gid,pid,'guest_fee_reversal',old.match_id,-old.delta_cents,p->>'reason',p,auth.uid());
    else raise exception 'Unknown fee action.';end if;
  end if;
  update skor_private.dues_groups set revision=revision+1 where id=gid;
  insert into skor_private.dues_audit(actor,action,group_id,detail) values(auth.uid(),p_action,gid,jsonb_build_object('entry_id',rid,'player_id',pid));
  return '{"ok":true}'::jsonb;
end $$;

create function public.manage_guest_profile(p_action text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
      n:=(p->>'number')::integer;
      if n is null or n not between 1 and 99 or exists(select 1 from public.team_roster where active and id<>pid and jersey_number=n) then raise exception 'Choose an available regular squad number (1–99).';end if;
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
end $$;

-- Compatibility functions: all signatures and existing grants are retained.

create function skor_private.participant_keys(pid uuid,mid uuid) returns text[] language sql stable set search_path='' as $$
select array_agg(k) from (select player_key k from public.team_roster where id=pid union select 'temp:'||temp_id::text from skor_private.guest_match_links where player_id=pid and match_id=mid) s;
$$;
create function skor_private.canonical_participant_key(mid uuid,pkey text) returns text language sql stable set search_path='' as $$
select coalesce((select r.player_key from skor_private.guest_match_links l join public.team_roster r on r.id=l.player_id where l.match_id=mid and 'temp:'||l.temp_id::text=pkey),pkey);
$$;
revoke all on function skor_private.canonical_participant_key(uuid,text) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION skor_private.dues_balances()
 RETURNS TABLE(group_id uuid, player_id uuid, active boolean, opening_paid boolean, assigned_cents bigint, paid_cents bigint, balance_cents bigint, status text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with a as (select x.group_id,x.player_id,sum(x.delta_cents)::bigint cents from (select group_id,player_id,delta_cents from skor_private.dues_assessments union all select group_id,player_id,delta_cents from skor_private.dues_extra_entries) x group by 1,2),
  p as (select x.group_id,x.player_id,sum(case x.kind when 'refund' then -x.amount_cents else x.amount_cents end)::bigint cents
    from skor_private.dues_payments x where not exists(select 1 from skor_private.dues_voids v where v.payment_id=x.id) group by 1,2),
  b as (select m.*,coalesce(a.cents,0) due,coalesce(p.cents,0) paid,
    (exists(select 1 from skor_private.dues_assessments z where z.group_id=m.group_id and z.player_id=m.player_id) or exists(select 1 from skor_private.dues_extra_entries z where z.group_id=m.group_id and z.player_id=m.player_id)) assessed
    from skor_private.dues_members m left join a using(group_id,player_id) left join p using(group_id,player_id))
  select group_id,player_id,active,opening_paid,case when opening_paid or not assessed then null else due end,
    paid,case when opening_paid or not assessed then null else due-paid end,
    case when opening_paid then 'Paid — confirmed by captain' when not assessed then 'Not assigned'
      when due-paid<0 then 'Credit' when due-paid=0 then 'Paid' when paid>0 then 'Partial' else 'Unpaid' end from b;
$function$;
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
    and ((r.is_guest and skor_private.guest_match_access(r.id,m.id)) or (not r.is_guest and (
      not exists(select 1 from skor_private.guest_profiles g where g.player_id=r.id and g.joined_on is not null and (m.kickoff at time zone 'America/New_York')::date<g.joined_on)
      or exists(select 1 from skor_private.guest_match_links l where l.player_id=r.id and l.match_id=m.id))))
    -- Do not manufacture absences for matches before the roster record existed.
    -- Explicit historical attendance or personal events still include that match.
    and (m.kickoff>=r.created_at or a.player_id is not null
      or e.goals+e.assists+e.yellow_cards+e.red_cards>0
      or m.man_of_match_player_key=any(skor_private.participant_keys(r.id,m.id)));
$function$;
create function skor_private.participant_record(pid uuid) returns jsonb language sql stable set search_path='' as $$
select (
    with records as materialized (
      select * from skor_private.player_completed_matches(pid)
    ), totals as (
      select count(*)::integer as recorded_matches,
        count(*) filter(where attendance_status='present')::integer as present_count,
        count(*) filter(where attendance_status='absent')::integer as absent_count,
        count(*) filter(where attendance_status='excused')::integer as excused_count,
        count(*) filter(where attendance_status='unmarked')::integer as unmarked_count,
        coalesce(sum(my_goals),0)::integer as goals,
        coalesce(sum(my_assists),0)::integer as assists,
        coalesce(sum(my_yellow_cards),0)::integer as yellow_cards,
        coalesce(sum(my_red_cards),0)::integer as red_cards,
        count(*) filter(where my_motm)::integer as motm,
        min(kickoff) as coverage_start,max(record_updated_at) as last_changed_at
      from records
    )
    select jsonb_build_object('summary',to_jsonb(t)||jsonb_build_object(
      'eligible_count',t.present_count+t.absent_count,
      'attendance_rate',round(100.0*t.present_count/nullif(t.present_count+t.absent_count,0),1)),
      'matches',coalesce((select jsonb_agg(to_jsonb(r) order by r.kickoff desc,r.match_id) from records r),'[]'::jsonb),
      'as_of',now()) from totals t
  );
$$;
CREATE OR REPLACE FUNCTION public.get_my_match_record()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_player_id uuid;
begin
  if auth.uid() is null then raise exception 'Player portal authorization required.'; end if;
  v_player_id:=skor_private.portal_participant_id();
  if v_player_id is null then raise exception 'Player portal authorization required.'; end if;
  return (
    with records as materialized (
      select * from skor_private.player_completed_matches(v_player_id)
    ), totals as (
      select count(*)::integer as recorded_matches,
        count(*) filter(where attendance_status='present')::integer as present_count,
        count(*) filter(where attendance_status='absent')::integer as absent_count,
        count(*) filter(where attendance_status='excused')::integer as excused_count,
        count(*) filter(where attendance_status='unmarked')::integer as unmarked_count,
        coalesce(sum(my_goals),0)::integer as goals,
        coalesce(sum(my_assists),0)::integer as assists,
        coalesce(sum(my_yellow_cards),0)::integer as yellow_cards,
        coalesce(sum(my_red_cards),0)::integer as red_cards,
        count(*) filter(where my_motm)::integer as motm,
        min(kickoff) as coverage_start,max(record_updated_at) as last_changed_at
      from records
    )
    select jsonb_build_object('summary',to_jsonb(t)||jsonb_build_object(
      'eligible_count',t.present_count+t.absent_count,
      'attendance_rate',round(100.0*t.present_count/nullif(t.present_count+t.absent_count,0),1)),
      'matches',coalesce((select jsonb_agg(to_jsonb(r) order by r.kickoff desc,r.match_id) from records r),'[]'::jsonb),
      'as_of',now()) from totals t
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.get_captain_dues()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or not public.is_skor_captain() then raise exception 'Captain access required.' using errcode='42501'; end if;
  return jsonb_build_object('as_of',now(),
    'instructions',(select instructions from skor_private.dues_settings),
    'roster',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',r.full_name,'number',r.jersey_number,'active',r.active,'player_key',r.player_key,'is_guest',r.is_guest,
      'captain',exists(select 1 from public.player_access pa join public.captain_allowlist ca on lower(ca.email)=lower(pa.approved_email) and ca.active and ca.role in ('captain','super_admin') where pa.roster_player_id=r.id and pa.active)) order by r.sort_order,r.full_name),'[]') from public.team_roster r),
    'groups',(select coalesce(jsonb_agg(to_jsonb(g) order by g.is_current desc,g.created_at desc),'[]') from skor_private.dues_groups g),
    'members',(select coalesce(jsonb_agg(to_jsonb(b)||jsonb_build_object('allocation_mode',m.allocation_mode)),'[]') from skor_private.dues_balances() b join skor_private.dues_members m on m.group_id=b.group_id and m.player_id=b.player_id),
    'scenarios',(select coalesce(jsonb_agg(to_jsonb(s) order by created_at desc),'[]') from skor_private.dues_scenarios s),
    'payments',(select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('void',to_jsonb(v)) order by p.received_on desc,p.created_at desc),'[]') from skor_private.dues_payments p left join skor_private.dues_voids v on v.payment_id=p.id),
    'matches',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',home_team||' vs '||away_team,'kickoff',kickoff,'published',published,'status',status) order by kickoff desc),'[]') from public.matches),
    'group_matches',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from skor_private.dues_matches m),
    'strategies',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'match_id',s.match_id,'updated_at',s.updated_at,
      'final',coalesce(v.is_production,false))),'[]') from public.match_strategies s left join public.lineup_variations v on v.id=s.source_lineup_variation_id and v.event_key=s.match_id::text),
    'shares',(select coalesce(jsonb_agg(to_jsonb(s)-'animation'),'[]') from skor_private.dues_strategy_shares s),
    'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by id desc),'[]') from (select * from skor_private.dues_audit order by id desc limit 200) a));
end $function$;
CREATE OR REPLACE FUNCTION public.get_my_dues()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare pid uuid:=skor_private.portal_participant_id(); result jsonb;
begin
  if auth.uid() is null or pid is null then raise exception 'Linked player access required.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'tag',g.tag,'kind',g.kind,'description',g.description,
    'due_on',g.due_on,'is_current',g.is_current,'instructions',coalesce(g.instructions,t.instructions),
    'balance',to_jsonb(b)-'player_id'-'group_id',
    'payments',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'cents',p.amount_cents,'kind',p.kind,'method',p.method,'date',p.received_on,'voided',v.payment_id is not null) order by p.received_on desc),'[]') from skor_private.dues_payments p left join skor_private.dues_voids v on v.payment_id=p.id where p.group_id=g.id and p.player_id=pid),
    'matches',case when not b.active then '[]'::jsonb else (select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'label',m.home_team||' vs '||m.away_team,'kickoff',m.kickoff,
      'lineup',(select to_jsonb(l) from public.get_public_production_lineup(m.id) l),
      'strategies',(select coalesce(jsonb_agg(jsonb_build_object('id',s.strategy_id,'title',ms.title,'scenes',s.animation)),'[]')
        from skor_private.dues_strategy_shares s join public.match_strategies ms on ms.id=s.strategy_id and ms.updated_at=s.source_revision
        join public.lineup_variations lv on lv.id=ms.source_lineup_variation_id and lv.is_production and lv.event_key=m.id::text
        where s.group_id=g.id and s.match_id=m.id)) order by m.kickoff),'[]')
      from skor_private.dues_matches gm join public.matches m on m.id=gm.match_id and m.published where gm.group_id=g.id and (public.current_player_id() is not null or skor_private.guest_match_access(pid,m.id))) end
  ) order by g.is_current desc,g.created_at desc),'[]') into result
  from skor_private.dues_balances() b join skor_private.dues_groups g on g.id=b.group_id cross join skor_private.dues_settings t where b.player_id=pid;
  return jsonb_build_object('as_of',now(),'groups',result,
    'roster',(select coalesce(jsonb_agg(jsonb_build_object('key',player_key,'name',coalesce(preferred_name,split_part(full_name,' ',1)),'number',jersey_number,'position',position)),'[]') from public.team_roster where not is_guest));
end $function$;
CREATE OR REPLACE FUNCTION public.manage_team_dues(p_action text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); gid uuid; g skor_private.dues_groups; sid uuid; sc skor_private.dues_scenarios;
  val jsonb; item jsonb; plan jsonb; preview jsonb; pid uuid; amount bigint; net bigint; existing skor_private.dues_payments;
  receipt skor_private.dues_payments; ids uuid[]; mid uuid; ms public.match_strategies; result jsonb:='{"ok":true}';
begin
  if actor is null or not public.is_skor_captain() then raise exception 'Captain access required.' using errcode='42501'; end if;
  -- One team ledger lock precedes all row locks, avoiding cross-season lock inversions.
  perform pg_advisory_xact_lock(682401);
  if octet_length(p_payload::text)>1000000 then raise exception 'Ledger request is too large.'; end if;
  if p_action='instructions' then
    update skor_private.dues_settings set instructions=p_payload->>'instructions';
    insert into skor_private.dues_audit(actor,action,detail) values(actor,p_action,'{}');
    return result;
  end if;
  gid:=(p_payload->>'group_id')::uuid;
  if p_action='initialize_fall_2026' then
    -- Called once with the reviewed private roster snapshot, never a dynamic paid default.
    if exists(select 1 from skor_private.dues_groups where opening_paid) then raise exception 'Opening paid snapshot already exists.'; end if;
    select array_agg(value::uuid order by value::uuid) into ids from jsonb_array_elements_text(p_payload->'players');
    if ids is null or ids is distinct from (select array_agg(r.id order by r.id) from public.team_roster r where r.active is true)
      then raise exception 'Roster changed since review. Review the opening paid snapshot again.'; end if;
    update skor_private.dues_groups set is_current=false,revision=revision+1 where is_current;
    insert into skor_private.dues_groups(id,name,tag,kind,is_current,opening_paid,created_by)
      values(gid,'Fall 2026','Fall 2026','season',true,true,actor);
    insert into skor_private.dues_members(group_id,player_id,opening_paid) select gid,u,true from unnest(ids) u;
    update skor_private.dues_settings set instructions=p_payload->>'instructions';
    insert into skor_private.dues_audit(actor,action,group_id,detail) values(actor,p_action,gid,
      jsonb_build_object('basis','Confirmed paid by captain; historical amounts and methods unknown','players',cardinality(ids)));
    return result;
  end if;
  if p_action='create_group' then
    select * into g from skor_private.dues_groups where id=gid;
    if found then
      if g.created_by=actor and g.name=trim(p_payload->>'name') and g.tag=trim(p_payload->>'tag') and g.kind=p_payload->>'kind' then return result; end if;
      raise exception 'This group ID already exists. Refresh before trying again.'; end if;
    if p_payload->>'kind'='season' and coalesce((p_payload->>'is_current')::boolean,false) then
      perform pg_advisory_xact_lock(682401);update skor_private.dues_groups set is_current=false,revision=revision+1 where is_current;
    end if;
    insert into skor_private.dues_groups(id,name,tag,kind,description,due_on,instructions,is_current,created_by)
      values(gid,trim(p_payload->>'name'),trim(p_payload->>'tag'),p_payload->>'kind',coalesce(p_payload->>'description',''),nullif(p_payload->>'due_on','')::date,
        nullif(p_payload->>'instructions',''),coalesce((p_payload->>'is_current')::boolean,false) and p_payload->>'kind'='season',actor);
  else
    select * into g from skor_private.dues_groups where id=gid for update;
    if not found then raise exception 'Fee group not found.'; end if;
    if p_action in ('save_group','finalize','share_strategy','unshare_strategy') and g.revision is distinct from (p_payload->>'revision')::integer
      then raise exception 'This group changed. Refresh and review it again.' using errcode='40001'; end if;
  end if;

  if p_action in ('create_group','save_group') then
    if p_action='save_group' then
      if coalesce((p_payload->>'is_current')::boolean,false) and g.kind='season' then
        perform pg_advisory_xact_lock(682401);update skor_private.dues_groups set is_current=false,revision=revision+1 where is_current and id<>gid;
      end if;
      update skor_private.dues_groups set name=trim(p_payload->>'name'),tag=trim(p_payload->>'tag'),description=coalesce(p_payload->>'description',''),
        due_on=nullif(p_payload->>'due_on','')::date,instructions=nullif(p_payload->>'instructions',''),
        is_current=coalesce((p_payload->>'is_current')::boolean,false) and kind='season',revision=revision+1 where id=gid;
    end if;
    if jsonb_typeof(p_payload->'players') is distinct from 'array' then raise exception 'Select participants.'; end if;
    select coalesce(array_agg(value::uuid),'{}') into ids from jsonb_array_elements_text(p_payload->'players');
    if cardinality(ids)<>(select count(distinct u) from unnest(ids) u) then raise exception 'Choose each participant once.'; end if;
    if cardinality(ids)>200 then raise exception 'Too many participants.'; end if;
    if exists(select 1 from unnest(ids) u where not exists(select 1 from public.team_roster r where r.id=u)) then raise exception 'Unknown roster player.'; end if;
    -- Removal changes event access only; assessments and receipts remain. The review explicitly retains credit/history.
    if exists(select 1 from skor_private.dues_members where group_id=gid and active and not(player_id=any(ids)))
      and coalesce(p_payload->>'removal_action','')<>'retain_history' then raise exception 'Confirm removed players retain balances and payment history.'; end if;
    update skor_private.dues_members set active=player_id=any(ids) where group_id=gid;
    insert into skor_private.dues_members(group_id,player_id) select gid,u from unnest(ids) u on conflict(group_id,player_id) do update set active=true;
    delete from skor_private.dues_matches where group_id=gid and not(match_id in(select value::uuid from jsonb_array_elements_text(coalesce(p_payload->'matches','[]'))));
    insert into skor_private.dues_matches(group_id,match_id) select gid,value::uuid from jsonb_array_elements_text(coalesce(p_payload->'matches','[]')) on conflict do nothing;
  elsif p_action='save_scenario' then
    if g.opening_paid then raise exception 'Fall 2026 is a confirmed-paid opening record. Create another season or event to run numbers.'; end if;
    sid:=(p_payload->>'id')::uuid;plan:=p_payload->'plan';preview:=public.preview_team_dues(plan);
    if g.revision is distinct from (p_payload->>'revision')::integer then raise exception 'Refresh the changed group before saving a scenario.' using errcode='40001'; end if;
    if exists(select 1 from skor_private.dues_scenarios where id=sid) then
      select * into sc from skor_private.dues_scenarios where id=sid;
      if sc.group_id=gid and sc.plan=plan and sc.name=p_payload->>'name' then return result; end if;
      raise exception 'Scenario retry does not match the original.';
    end if;
    insert into skor_private.dues_scenarios(id,group_id,name,base_revision,plan,preview,created_by)
      values(sid,gid,trim(p_payload->>'name'),g.revision,plan,preview,actor);
    result:=result||jsonb_build_object('scenario_id',sid,'preview',preview);
  elsif p_action='finalize' then
    if g.opening_paid then raise exception 'Opening paid records cannot be reassessed.'; end if;
    sid:=(p_payload->>'id')::uuid;select * into sc from skor_private.dues_scenarios where id=sid and group_id=gid;
    if not found then raise exception 'Scenario not found.'; end if;
    if sc.applied_revision is not null then raise exception 'This scenario has already been assigned.'; end if;
    if sc.base_revision<>g.revision then raise exception 'Scenario is stale. Run numbers again and save a fresh scenario.' using errcode='40001'; end if;
    if exists(select 1 from jsonb_array_elements(sc.plan->'players') p join skor_private.dues_members im on im.group_id=gid and im.player_id=(p->>'player_id')::uuid where im.allocation_mode='individual') then raise exception 'Individually assessed participants use the participation calculator.'; end if;
    preview:=public.preview_team_dues(sc.plan);
    if preview<>sc.preview then raise exception 'Allocation changed. Save and review a fresh scenario.'; end if;
    if exists(select 1 from skor_private.dues_balances() b where b.group_id=gid and b.assigned_cents is not null and exists(select 1 from skor_private.dues_members im where im.group_id=gid and im.player_id=b.player_id and im.allocation_mode='split')
        and not exists(select 1 from jsonb_array_elements(preview->'players') x where (x->>'player_id')::uuid=b.player_id))
      and coalesce(p_payload->>'excluded_action','')<>'retain_credit' then raise exception 'Confirm excluded players have zero dues and retain receipts as credit.'; end if;
    update skor_private.dues_members set active=false where group_id=gid and allocation_mode='split';
    for item in select * from jsonb_array_elements(preview->'players') loop
      pid:=(item->>'player_id')::uuid;
      insert into skor_private.dues_members(group_id,player_id) values(gid,pid) on conflict(group_id,player_id) do update set active=true;
    end loop;
    insert into skor_private.dues_assessments(scenario_id,group_id,player_id,delta_cents)
      select sid,gid,b.player_id,coalesce((x->>'cents')::bigint,0)-coalesce(b.assigned_cents,0)
      from skor_private.dues_balances() b left join jsonb_array_elements(preview->'players') x on (x->>'player_id')::uuid=b.player_id where b.group_id=gid and exists(select 1 from skor_private.dues_members im where im.group_id=gid and im.player_id=b.player_id and im.allocation_mode='split');
    update skor_private.dues_groups set revision=revision+1 where id=gid;
    update skor_private.dues_scenarios set applied_revision=g.revision+1 where id=sid;
    result:=result||jsonb_build_object('revision',g.revision+1);
  elsif p_action='payment' then
    if exists(select 1 from skor_private.dues_members where group_id=gid and player_id=(p_payload->>'player_id')::uuid and opening_paid) then raise exception 'Do not invent receipts for confirmed-paid opening players.'; end if;
    pid:=(p_payload->>'player_id')::uuid;amount:=(p_payload->>'amount_cents')::bigint;
    select * into existing from skor_private.dues_payments where id=(p_payload->>'id')::uuid;
    if found then
      if existing.group_id=gid and existing.player_id=pid and existing.amount_cents=amount and existing.kind=p_payload->>'kind'
        and existing.method=p_payload->>'method' and existing.received_on=(p_payload->>'received_on')::date
        and existing.reference=coalesce(p_payload->>'reference','') and existing.note=coalesce(p_payload->>'note','') then return result; end if;
      raise exception 'Payment retry differs from the original. Refresh first.';
    end if;
    select paid_cents into net from skor_private.dues_balances() where group_id=gid and player_id=pid and assigned_cents is not null;
    if not found then raise exception 'Assign dues before recording a receipt.'; end if;
    if p_payload->>'kind'='refund' and amount>net then raise exception 'Refund cannot exceed recorded net receipts.'; end if;
    if (p_payload->>'received_on')::date>current_date then raise exception 'Payment date cannot be in the future.'; end if;
    insert into skor_private.dues_payments(id,group_id,player_id,amount_cents,kind,method,received_on,reference,note,created_by)
      values((p_payload->>'id')::uuid,gid,pid,amount,p_payload->>'kind',p_payload->>'method',(p_payload->>'received_on')::date,coalesce(p_payload->>'reference',''),coalesce(p_payload->>'note',''),actor);
  elsif p_action='void' then
    select * into receipt from skor_private.dues_payments where id=(p_payload->>'id')::uuid and group_id=gid;
    if not found then raise exception 'Payment not found.'; end if;
    if exists(select 1 from skor_private.dues_voids where payment_id=receipt.id) then return result; end if;
    select paid_cents into net from skor_private.dues_balances() where group_id=gid and player_id=receipt.player_id;
    if receipt.kind='receipt' and net-receipt.amount_cents<0 then raise exception 'Void related refunds first; net receipts cannot be negative.'; end if;
    insert into skor_private.dues_voids(payment_id,reason,created_by) values(receipt.id,trim(p_payload->>'reason'),actor);
  elsif p_action='share_strategy' then
    select * into ms from public.match_strategies where id=(p_payload->>'id')::uuid;
    if not found or ms.updated_at is distinct from (p_payload->>'source_revision')::timestamptz then raise exception 'Strategy changed. Refresh and review it again.'; end if;
    if not exists(select 1 from skor_private.dues_matches gm join public.matches m on m.id=gm.match_id and m.published
      join public.lineup_variations lv on lv.id=ms.source_lineup_variation_id and lv.event_key=m.id::text and lv.is_production
      where gm.group_id=gid and gm.match_id=ms.match_id) then raise exception 'Choose a strategy based on a Final / Production lineup for a linked published match.'; end if;
    insert into skor_private.dues_strategy_shares(group_id,match_id,strategy_id,source_revision,animation,created_by)
      values(gid,ms.match_id,ms.id,ms.updated_at,skor_private.dues_animation(ms.scenes),actor)
      on conflict(group_id,strategy_id) do update set source_revision=excluded.source_revision,animation=excluded.animation,created_by=actor;
    update skor_private.dues_groups set revision=revision+1 where id=gid;
  elsif p_action='unshare_strategy' then
    delete from skor_private.dues_strategy_shares where group_id=gid and strategy_id=(p_payload->>'id')::uuid;
    update skor_private.dues_groups set revision=revision+1 where id=gid;
  else raise exception 'Unknown ledger action.' using errcode='22023';
  end if;
  insert into skor_private.dues_audit(actor,action,group_id,detail) values(actor,p_action,gid,
    case when p_action in ('payment','void') then jsonb_build_object('id',p_payload->>'id')
      when p_action in ('save_scenario','finalize') then jsonb_build_object('scenario_id',sid)
      else jsonb_build_object('revision',(select revision from skor_private.dues_groups where id=gid)) end);
  return result;
end $function$;
create or replace function public.get_public_player_season_stats()
returns jsonb
language sql stable security definer set search_path = ''
as $function$
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
    select coalesce(p.jersey_number::text,c.number,'') as number,
           coalesce(p.display_name,nullif(split_part(trim(c.name),' ',1),''),'Unknown') as name,
           c.metric
    from contributions c
    left join lateral (
      select r.jersey_number,r.display_name
      from public.public_roster r
      where (c.player_key is not null and r.player_key = c.player_key)
         or (c.player_key is null and r.jersey_number::text = c.number)
      limit 1
    ) p on true
  ), players as (
    select r.number,r.name,
           count(*) filter (where r.metric = 'goals') as goals,
           count(*) filter (where r.metric = 'assists') as assists,
           count(*) filter (where r.metric = 'yellow') as yellow,
           count(*) filter (where r.metric = 'red') as red,
           count(*) filter (where r.metric = 'motm') as motm
    from resolved r
    group by r.number,r.name
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
$function$;CREATE OR REPLACE FUNCTION skor_private.captain_notification_items()
 RETURNS TABLE(kind text, id text, revision timestamp with time zone, title text, body text, audience text, match_id uuid, opponent text, kickoff timestamp with time zone, loan_id uuid, report_id uuid, is_read boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with feedback as (
    select 'comment'::text as kind,c.id::text as id,
      coalesce(c.updated_at,c.created_at) as revision,
      concat(case when r.is_guest then 'Guest · ' else '#'||r.jersey_number::text||' ' end,coalesce(nullif(trim(r.preferred_name),''),split_part(trim(r.full_name),' ',1))) as title,
      c.comment as body,c.visibility as audience,c.match_id
    from public.player_match_comments c
    join public.team_roster r on r.id=c.player_id
    union all
    select 'reaction',concat(rx.match_id,':',rx.player_id),
      coalesce(rx.updated_at,rx.created_at),
      concat(case when r.is_guest then 'Guest · ' else '#'||r.jersey_number::text||' ' end,coalesce(nullif(trim(r.preferred_name),''),split_part(trim(r.full_name),' ',1))),
      concat('Personal: ',coalesce(rx.self_reaction,'Not answered'),' · Team: ',coalesce(rx.team_reaction,'Not answered')),
      'team',rx.match_id
    from public.player_match_reactions rx
    join public.team_roster r on r.id=rx.player_id
    where rx.self_reaction is not null or rx.team_reaction is not null
  )
  select 'equipment'::text,n.id::text,n.created_at,'Equipment update'::text,n.body,n.audience,
    null::uuid,null::text,null::timestamptz,n.loan_id,n.report_id,
    exists(select 1 from skor_equipment.notification_reads er
      where er.notification_id=n.id and er.user_id=auth.uid())
  from skor_equipment.notifications n
  where n.audience in ('team','captains') or (n.audience='user' and n.recipient_user=auth.uid())
  union all
  select f.kind,f.id,f.revision,f.title,f.body,f.audience,f.match_id,
    case when m.home_team='SKOR FC' then m.away_team else m.home_team end,m.kickoff,
    null::uuid,null::uuid,
    exists(select 1 from skor_private.captain_feedback_reads fr
      where fr.user_id=auth.uid() and fr.kind=f.kind and fr.source_id=f.id and fr.revision>=f.revision)
  from feedback f join public.matches m on m.id=f.match_id;
$function$;
-- Appended by the migration packaging script after the compatibility function updates.
create function public.get_guest_console() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_skor_captain() then raise exception 'Captain access required.' using errcode='42501';end if;
  return jsonb_build_object('as_of',now(),'ledger',public.get_captain_dues(),
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
    'legacy',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'match_id',t.match_id,'name',t.display_name,'number',t.jersey_number) order by m.kickoff desc),'[]')
      from public.match_temp_players t join public.matches m on m.id=t.match_id where not exists(select 1 from skor_private.guest_match_links l where l.temp_id=t.id)),
    'fee_settings',(select coalesce(jsonb_agg(to_jsonb(f)),'[]') from skor_private.guest_fee_settings f),
    'entries',(select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc),'[]') from skor_private.dues_extra_entries e));
end $$;

create function public.get_my_guest_portal() returns jsonb language plpgsql stable security definer set search_path='' as $$
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
    ) order by m.kickoff desc),'[]') from public.matches m where skor_private.guest_match_access(pid,m.id))) into result from public.team_roster r where r.id=pid;
  return result;
end $$;
create function public.manage_my_guest_match(p_action text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid:=skor_private.portal_participant_id(); mid uuid:=(p->>'match_id')::uuid; v text;
begin
  if auth.uid() is null or not exists(select 1 from public.team_roster r join skor_private.guest_profiles g on g.player_id=r.id and g.enabled and g.auth_user_id=auth.uid() where r.id=pid and r.is_guest)
    or not skor_private.guest_match_access(pid,mid) then raise exception 'This game is not available to your guest profile.' using errcode='42501';end if;
  if p_action='rsvp' then
    v:=p->>'status';if v not in ('going','out') or length(coalesce(p->>'note',''))>500 then raise exception 'Check RSVP and note.';end if;
    insert into public.player_match_availability(player_id,match_id,status,note) values(pid,mid,v,p->>'note') on conflict(player_id,match_id) do update set status=excluded.status,note=excluded.note,updated_at=now();
  elsif p_action='comment' then
    insert into public.player_match_comments(id,player_id,match_id,visibility,comment)
      values((p->>'id')::uuid,pid,mid,p->>'visibility',trim(p->>'comment')) on conflict(id) do nothing;
  else raise exception 'Unknown guest action.';end if;
  return '{"ok":true}'::jsonb;
end $$;

do $$ declare t text;begin
  foreach t in array array['guest_profiles','guest_match_links','guest_operations','guest_fee_settings','dues_extra_entries'] loop
    execute format('alter table skor_private.%I enable row level security',t);
    execute format('revoke all on table skor_private.%I from public,anon,authenticated',t);
  end loop;
end $$;
revoke all on function skor_private.portal_participant_id(),skor_private.guest_match_access(uuid,uuid),skor_private.participant_keys(uuid,uuid),skor_private.participant_record(uuid) from public,anon,authenticated;
revoke all on function public.resolve_player_portal(),public.preview_participation_dues(jsonb),public.manage_participant_dues(text,jsonb),public.manage_guest_profile(text,jsonb),public.get_guest_console(),public.get_my_guest_portal(),public.manage_my_guest_match(text,jsonb) from public,anon,authenticated;
grant execute on function public.resolve_player_portal(),public.preview_participation_dues(jsonb),public.manage_participant_dues(text,jsonb),public.manage_guest_profile(text,jsonb),public.get_guest_console(),public.get_my_guest_portal(),public.manage_my_guest_match(text,jsonb) to authenticated;
