-- v58.26. Reviewable migration; do not apply without explicit approval.
-- No existing event or match data is rewritten by this migration.
alter table public.match_events add column entry_source text not null default 'live'
  check(entry_source in ('live','post_match'));
alter table public.match_events add column assist_status text
  check(assist_status in ('known','none','unknown'));
create table skor_private.post_match_saves (
  request_id uuid primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  actor uuid not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index post_match_save_match on skor_private.post_match_saves(match_id);
create index post_match_save_actor on skor_private.post_match_saves(actor);
alter table skor_private.post_match_saves enable row level security;
revoke all on skor_private.post_match_saves from public,anon,authenticated;

-- Existing single-event updates/deletes and new bulk saves share a match lock.
-- A racing row update can deadlock rather than overwrite; the caller must reload.
-- Owner privileges allow locking unpublished matches as well. Row mutation RLS
-- still runs on the original caller; this private trigger only acquires a lock.
create function skor_private.lock_official_event_match() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and old.match_id<>new.match_id then
    perform 1 from public.matches m where m.id in(old.match_id,new.match_id) order by m.id for update;
  else
    perform 1 from public.matches m where m.id=case when tg_op='DELETE' then old.match_id else new.match_id end for update;
  end if;
  if tg_op='DELETE' then return old;end if;
  return new;
end $$;
create trigger trg_guard_match_event_write before insert or update or delete on public.match_events
  for each row execute function skor_private.lock_official_event_match();

create or replace function public.stamp_match_event_clock() returns trigger
language plpgsql set search_path='' as $$
declare v_session public.game_day_sessions%rowtype;v_now timestamptz:=now();
begin
  if new.entry_source='post_match' then
    new.clock_period:=null;new.clock_elapsed_seconds:=null;new.clock_recorded_at:=null;
    return new;
  end if;
  select * into v_session from public.game_day_sessions s where s.match_id=new.match_id;
  if found and v_session.clock_phase in ('first_half','second_half') then
    new.clock_period:=v_session.clock_phase;
    new.clock_elapsed_seconds:=greatest(0,v_session.clock_elapsed_seconds+
      case when v_session.clock_running and v_session.clock_started_at is not null
        then floor(extract(epoch from(v_now-v_session.clock_started_at)))::integer else 0 end);
    new.clock_recorded_at:=v_now;
    new.half:=case when v_session.clock_phase='second_half' then 'second' else 'first' end;
  end if;
  return new;
end $$;

create function skor_private.post_match_people(mid uuid)
returns table(player_key text,name text,number integer,is_temp boolean) language sql stable set search_path='' as $$
  select r.player_key,coalesce(nullif(trim(r.preferred_name),''),split_part(trim(r.full_name),' ',1)),r.jersey_number,r.is_guest
  from public.team_roster r where
    ((r.active and not r.is_guest) or (r.is_guest and skor_private.guest_match_access(r.id,mid))
      or exists(select 1 from public.match_events e where e.match_id=mid and r.player_key in(e.roster_player_key,e.assist_roster_player_key)))
    and (not exists(select 1 from skor_private.guest_match_links l join public.match_temp_players t on t.id=l.temp_id and t.active
      where l.player_id=r.id and l.match_id=mid and l.active)
      or exists(select 1 from public.match_events e where e.match_id=mid and r.player_key in(e.roster_player_key,e.assist_roster_player_key)))
  union all
  select 'temp:'||t.id::text,split_part(trim(t.display_name),' ',1),t.jersey_number,true
  from public.match_temp_players t where t.match_id=mid and (t.active or exists(select 1 from public.match_events e
    where e.match_id=mid and 'temp:'||t.id::text in(e.roster_player_key,e.assist_roster_player_key)));
$$;
create function skor_private.post_match_revision(mid uuid) returns text language sql stable set search_path='' as $$
  select md5(jsonb_build_object('events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') from public.match_events e where e.match_id=mid),
    'match',(select jsonb_build_object('updated_at',m.updated_at,'status',m.status) from public.matches m where m.id=mid),
    'clock',(select jsonb_build_object('updated_at',s.clock_updated_at,'phase',s.clock_phase,'running',s.clock_running) from public.game_day_sessions s where s.match_id=mid))::text);
$$;
create function public.get_post_match_editor(p_match_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not coalesce(public.is_skor_captain(),false) then raise exception 'Captain access required.' using errcode='42501';end if;
  if not exists(select 1 from public.matches where id=p_match_id) then raise exception 'Match not found.';end if;
  return jsonb_build_object('revision',skor_private.post_match_revision(p_match_id),
    'match',(select jsonb_build_object('id',m.id,'home_team',m.home_team,'away_team',m.away_team,'kickoff',m.kickoff,'status',m.status) from public.matches m where m.id=p_match_id),
    'participants',(select coalesce(jsonb_agg(to_jsonb(p) order by p.is_temp,p.number nulls last,p.name),'[]') from skor_private.post_match_people(p_match_id) p),
    'events',(select coalesce(jsonb_agg(to_jsonb(e)-'created_by' order by e.sequence,e.id),'[]') from public.match_events e where e.match_id=p_match_id));
end $$;

create function public.save_post_match_events(p_match_id uuid,p_request_id uuid,p_revision text,
  p_upserts jsonb,p_delete_ids jsonb,p_mark_final boolean default true) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor_id uuid:=auth.uid();payload jsonb;prior skor_private.post_match_saves;item jsonb;
  old_event public.match_events;scorer record;assister record;event_id uuid;kind text;period text;assist_kind text;
  result jsonb;added integer:=0;changed integer:=0;removed integer:=0;finish boolean:=coalesce(p_mark_final,false);
begin
  if actor_id is null or not coalesce(public.is_skor_captain(),false) then raise exception 'Captain access required.' using errcode='42501';end if;
  if p_match_id is null or p_request_id is null then raise exception 'Match and request IDs are required.';end if;
  if jsonb_typeof(p_upserts) is distinct from 'array' or jsonb_typeof(p_delete_ids) is distinct from 'array'
    or jsonb_array_length(p_upserts)+jsonb_array_length(p_delete_ids)>200
    or octet_length(coalesce(p_upserts::text,'')||coalesce(p_delete_ids::text,''))>150000 then raise exception 'Choose at most 200 event changes per save.';end if;
  payload:=jsonb_build_object('revision',p_revision,'upserts',p_upserts,'delete_ids',p_delete_ids,'mark_final',finish);
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select * into prior from skor_private.post_match_saves where request_id=p_request_id;
  if found then
    if prior.actor=actor_id and prior.match_id=p_match_id and prior.payload=payload then return prior.result;end if;
    raise exception 'This save ID belongs to a different submission.';
  end if;
  -- Same session→match order as clock control. No clock/session is created here.
  perform 1 from public.game_day_sessions s where s.match_id=p_match_id for update;
  perform 1 from public.matches m where m.id=p_match_id for update;
  if not found then raise exception 'Match not found.';end if;
  if exists(select 1 from public.matches where id=p_match_id and kickoff>now()) then raise exception 'Post-match entry is available after kickoff.';end if;
  if p_revision is distinct from skor_private.post_match_revision(p_match_id) then raise exception 'Match changed. Reload and review before saving.' using errcode='40001';end if;
  if (select count(distinct x->>'id') from jsonb_array_elements(p_upserts) x)<>jsonb_array_length(p_upserts)
    or (select count(distinct x) from jsonb_array_elements_text(p_delete_ids) x)<>jsonb_array_length(p_delete_ids)
    or exists(select 1 from jsonb_array_elements(p_upserts) u join jsonb_array_elements_text(p_delete_ids) d on u->>'id'=d)
    then raise exception 'Choose each event once.';end if;
  if exists(select 1 from jsonb_array_elements_text(p_delete_ids) d where not exists(select 1 from public.match_events e
    where e.id=d::uuid and e.match_id=p_match_id and (e.event_type='opponent_goal' or (e.event_type in ('skor_goal','skor_yellow_card','skor_red_card')
      and exists(select 1 from skor_private.post_match_people(p_match_id) p where p.player_key=e.roster_player_key)))))
    then raise exception 'Only supported events from this match can be removed. Review other entries in the event log.';end if;

  for item in select value from jsonb_array_elements(p_upserts) loop
    event_id:=(item->>'id')::uuid;kind:=item->>'event_type';period:=item->>'half';assist_kind:=item->>'assist_status';
    if event_id is null or kind is null or kind not in ('skor_goal','opponent_goal','skor_yellow_card','skor_red_card') or period is null or period not in ('first','second') then raise exception 'Check event type, half and identity.';end if;
    select * into old_event from public.match_events where id=event_id;
    if found and (old_event.match_id<>p_match_id or old_event.event_type not in ('skor_goal','opponent_goal','skor_yellow_card','skor_red_card')) then raise exception 'This event belongs to another match or needs individual review.';end if;
    select * into scorer from skor_private.post_match_people(p_match_id) where player_key=item->>'player_key';
    if kind<>'opponent_goal' and scorer.player_key is null then raise exception 'Choose a roster player or this game’s guest/TEMP identity.';end if;
    if kind='opponent_goal' and item->>'player_key' is not null then raise exception 'Opponent totals do not identify a SKOR player.';end if;
    select * into assister from skor_private.post_match_people(p_match_id) where player_key=item->>'assist_key';
    if kind='skor_goal' then
      if assist_kind is null or assist_kind not in ('known','none','unknown') then raise exception 'Choose an assist, No assist or Unknown.';end if;
      if assist_kind='known' and (assister.player_key is null or assister.player_key=scorer.player_key) then raise exception 'Choose a different valid player for the assist.';end if;
      if assist_kind<>'known' and item->>'assist_key' is not null then raise exception 'Clear the assist player for No assist or Unknown.';end if;
    elsif item->>'assist_key' is not null or assist_kind is not null then raise exception 'Only a SKOR goal can have an assist.';end if;

    if old_event.id is null then
      insert into public.match_events(id,match_id,event_type,half,player_name,player_number,roster_player_number,roster_player_key,
        assist_player_name,assist_player_number,assist_roster_player_number,assist_roster_player_key,assist_status,entry_source,created_by)
      values(event_id,p_match_id,kind,period,case when kind<>'opponent_goal' then scorer.name end,
        case when kind<>'opponent_goal' then scorer.number::text end,case when kind<>'opponent_goal' then scorer.number::text end,
        case when kind<>'opponent_goal' then scorer.player_key end,case when assist_kind='known' then assister.name end,
        case when assist_kind='known' then assister.number::text end,case when assist_kind='known' then assister.number::text end,
        case when assist_kind='known' then assister.player_key end,assist_kind,'post_match',actor_id);
      added:=added+1;
    else
      -- Original timestamp, source, sequence, creation actor and date remain intact.
      update public.match_events set event_type=kind,half=period,
        player_name=case when kind<>'opponent_goal' then case when old_event.roster_player_key=scorer.player_key then old_event.player_name else scorer.name end end,
        player_number=case when kind<>'opponent_goal' then case when old_event.roster_player_key=scorer.player_key then old_event.player_number else scorer.number::text end end,
        roster_player_number=case when kind<>'opponent_goal' then case when old_event.roster_player_key=scorer.player_key then old_event.roster_player_number else scorer.number::text end end,roster_player_key=case when kind<>'opponent_goal' then scorer.player_key end,
        assist_player_name=case when assist_kind='known' then case when old_event.assist_roster_player_key=assister.player_key then old_event.assist_player_name else assister.name end end,
        assist_player_number=case when assist_kind='known' then case when old_event.assist_roster_player_key=assister.player_key then old_event.assist_player_number else assister.number::text end end,
        assist_roster_player_number=case when assist_kind='known' then case when old_event.assist_roster_player_key=assister.player_key then old_event.assist_roster_player_number else assister.number::text end end,assist_roster_player_key=case when assist_kind='known' then assister.player_key end,
        assist_status=assist_kind where id=event_id;
      changed:=changed+1;
    end if;
  end loop;
  delete from public.match_events e where e.match_id=p_match_id and e.id in(select value::uuid from jsonb_array_elements_text(p_delete_ids));
  get diagnostics removed=row_count;
  if finish then
    update public.matches set status='final',current_half='second',updated_at=now() where id=p_match_id and status<>'final';
    update public.game_day_sessions s set clock_elapsed_seconds=greatest(0,s.clock_elapsed_seconds+
      case when s.clock_running and s.clock_started_at is not null then floor(extract(epoch from(now()-s.clock_started_at)))::integer else 0 end),
      clock_phase='full_time',clock_running=false,clock_started_at=null,clock_phase_started_at=now(),clock_updated_at=now(),clock_updated_by=actor_id,updated_at=now()
      where s.match_id=p_match_id and (s.clock_phase<>'full_time' or s.clock_running);
  end if;
  result:=jsonb_build_object('ok',true,'added',added,'updated',changed,'removed',removed,'mark_final',finish,'revision',skor_private.post_match_revision(p_match_id));
  insert into skor_private.post_match_saves(request_id,match_id,actor,payload,result) values(p_request_id,p_match_id,actor_id,payload,result);
  return result;
end $$;
revoke all on function skor_private.lock_official_event_match(),skor_private.post_match_people(uuid),skor_private.post_match_revision(uuid) from public,anon,authenticated;
revoke all on function public.get_post_match_editor(uuid),public.save_post_match_events(uuid,uuid,text,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.get_post_match_editor(uuid),public.save_post_match_events(uuid,uuid,text,jsonb,jsonb,boolean) to authenticated;
