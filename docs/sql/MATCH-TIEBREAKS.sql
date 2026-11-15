-- Proposed overtime/shootout migration. DO NOT APPLY without explicit approval.
-- No existing event, attendance, lineup, score or clock anchor is rewritten.
create table skor_private.match_tiebreaks (
  match_id uuid primary key references public.matches(id) on delete cascade,
  revision integer not null default 1 check(revision>0),
  extra_minutes smallint not null default 5 check(extra_minutes between 1 and 30),
  golden_goal boolean not null default true,
  initial_kicks smallint not null default 5 check(initial_kicks between 1 and 20),
  first_team text not null default 'skor' check(first_team in ('skor','opponent')),
  shots jsonb not null default '[]' check(jsonb_typeof(shots)='array'),
  completed boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table skor_private.match_tiebreaks enable row level security;
revoke all on skor_private.match_tiebreaks from public,anon,authenticated;
create table skor_private.tiebreak_saves (
  request_id uuid primary key, actor uuid not null, match_id uuid not null references public.matches(id) on delete cascade,
  payload jsonb not null,result jsonb not null,created_at timestamptz not null default now()
);
create index tiebreak_saves_match_idx on skor_private.tiebreak_saves(match_id);
alter table skor_private.tiebreak_saves enable row level security;
revoke all on skor_private.tiebreak_saves from public,anon,authenticated;
alter table public.match_events drop constraint match_events_half_check;
alter table public.match_events add constraint match_events_half_check check(half in ('first','second','extra_first','extra_second'));
alter table public.match_events drop constraint match_events_clock_period_check;
alter table public.match_events add constraint match_events_clock_period_check check(clock_period is null or clock_period in ('first_half','second_half','extra_first_half','extra_second_half'));
alter table public.game_day_crowd_events drop constraint game_day_crowd_events_half_check;
alter table public.game_day_crowd_events add constraint game_day_crowd_events_half_check check(half in ('first','second','extra_first','extra_second'));
alter table public.game_day_crowd_events drop constraint game_day_crowd_events_clock_period_check;
alter table public.game_day_crowd_events add constraint game_day_crowd_events_clock_period_check check(clock_period is null or clock_period in ('first_half','second_half','extra_first_half','extra_second_half'));
alter table public.game_day_ref_decisions drop constraint game_day_ref_decisions_half_check;
alter table public.game_day_ref_decisions add constraint game_day_ref_decisions_half_check check(half in ('first','second','extra_first','extra_second'));
alter table public.game_day_ref_decisions drop constraint game_day_ref_decisions_clock_period_check;
alter table public.game_day_ref_decisions add constraint game_day_ref_decisions_clock_period_check check(clock_period is null or clock_period in ('first_half','second_half','extra_first_half','extra_second_half'));
alter table public.game_day_sessions drop constraint game_day_sessions_clock_phase_check;
alter table public.game_day_sessions add constraint game_day_sessions_clock_phase_check check(clock_phase in ('not_started','first_half','halftime','second_half','extra_break','extra_first_half','extra_halftime','extra_second_half','shootout','full_time'));
alter table public.game_day_sessions drop constraint game_day_sessions_clock_running_check;
alter table public.game_day_sessions add constraint game_day_sessions_clock_running_check check(not clock_running or (clock_phase in ('first_half','second_half','extra_first_half','extra_second_half') and clock_started_at is not null));
alter table public.matches drop constraint matches_current_half_check;
alter table public.matches add constraint matches_current_half_check check(current_half in ('first','second','extra_first','extra_second'));
alter table public.matches drop constraint matches_status_check;
alter table public.matches add constraint matches_status_check check(status in ('scheduled','first_half','halftime','second_half','extra_time','shootout','final'));
CREATE OR REPLACE FUNCTION public.report_ref_decision(p_session_id uuid, p_half text, p_decision_type text, p_description text, p_vote text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_match uuid;
  v_decision uuid;
  v_clock_phase text;
  v_clock_running boolean;
  v_clock_anchor integer;
  v_clock_started_at timestamptz;
  v_clock_seconds integer;
  v_clock_recorded_at timestamptz;
  v_half text := p_half;
  v_now timestamptz := now();
begin
  if auth.uid() is null or not public.can_score_game_day(p_session_id) then
    raise exception 'This Game Day session is not open for you.';
  end if;
  if p_vote not in ('agree','disagree','unsure') then
    raise exception 'Invalid referee vote.';
  end if;
  if p_half not in ('first','second','extra_first','extra_second') then
    raise exception 'Choose first or second half.';
  end if;

  select s.match_id, s.clock_phase, s.clock_running,
         s.clock_elapsed_seconds, s.clock_started_at
    into v_match, v_clock_phase, v_clock_running,
         v_clock_anchor, v_clock_started_at
  from public.game_day_sessions s
  where s.id = p_session_id and s.ref_review_open = true;

  if v_match is null then
    raise exception 'Referee review is closed.';
  end if;

  if v_clock_phase in ('first_half','second_half','extra_first_half','extra_second_half') then
    v_half := case v_clock_phase when 'extra_first_half' then 'extra_first' when 'extra_second_half' then 'extra_second' when 'second_half' then 'second' else 'first' end;
    v_clock_seconds := greatest(0, v_clock_anchor +
      case
        when v_clock_running and v_clock_started_at is not null
          then floor(extract(epoch from (v_now - v_clock_started_at)))::integer
        else 0
      end
    );
    v_clock_recorded_at := v_now;
  else
    v_clock_phase := null;
  end if;

  select d.id into v_decision
  from public.game_day_ref_decisions d
  where d.session_id = p_session_id
    and d.active = true
    and d.half = v_half
    and lower(d.decision_type) = lower(p_decision_type)
    and d.created_at > v_now - interval '90 seconds'
  order by d.created_at desc
  limit 1;

  if v_decision is null then
    insert into public.game_day_ref_decisions(
      session_id,match_id,half,decision_type,description,created_by,
      clock_period,clock_elapsed_seconds,clock_recorded_at
    )
    values(
      p_session_id,v_match,v_half,p_decision_type,nullif(trim(p_description),''),auth.uid(),
      v_clock_phase,v_clock_seconds,v_clock_recorded_at
    )
    returning id into v_decision;
  end if;

  insert into public.game_day_ref_votes(decision_id,session_id,user_id,vote)
  values(v_decision,p_session_id,auth.uid(),p_vote)
  on conflict(decision_id,user_id)
  do update set vote = excluded.vote, updated_at = v_now;

  return v_decision;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.report_game_day_event(p_session_id uuid, p_event_type text, p_half text, p_player_key text DEFAULT NULL::text, p_player_name text DEFAULT NULL::text, p_player_number integer DEFAULT NULL::integer, p_assist_player_key text DEFAULT NULL::text, p_assist_player_name text DEFAULT NULL::text, p_assist_player_number integer DEFAULT NULL::integer, p_opponent_player_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_match uuid;
  v_event uuid;
  v_active integer;
  v_threshold integer;
  v_clock_phase text;
  v_clock_running boolean;
  v_clock_anchor integer;
  v_clock_started_at timestamptz;
  v_clock_seconds integer;
  v_clock_recorded_at timestamptz;
  v_half text := p_half;
  v_now timestamptz := now();
begin
  if auth.uid() is null or not public.can_score_game_day(p_session_id) then
    raise exception 'This Game Day session is not open for you.';
  end if;

  if p_event_type not in (
    'skor_goal','opponent_goal','opponent_own_goal','skor_own_goal',
    'skor_yellow_card','skor_red_card','opponent_yellow_card','opponent_red_card'
  ) then
    raise exception 'Unsupported event type.';
  end if;

  if p_half not in ('first','second','extra_first','extra_second') then
    raise exception 'Choose first or second half.';
  end if;

  update public.game_day_participants
  set last_seen_at = v_now
  where session_id = p_session_id and user_id = auth.uid();

  select greatest(1,count(*)::integer)
    into v_active
  from public.game_day_participants
  where session_id = p_session_id
    and last_seen_at >= v_now - interval '5 minutes';

  v_threshold := public.game_day_consensus_threshold(v_active);

  select s.match_id, s.clock_phase, s.clock_running,
         s.clock_elapsed_seconds, s.clock_started_at
    into v_match, v_clock_phase, v_clock_running,
         v_clock_anchor, v_clock_started_at
  from public.game_day_sessions s
  where s.id = p_session_id;

  if v_clock_phase in ('first_half','second_half','extra_first_half','extra_second_half') then
    v_half := case v_clock_phase when 'extra_first_half' then 'extra_first' when 'extra_second_half' then 'extra_second' when 'second_half' then 'second' else 'first' end;
    v_clock_seconds := greatest(0, v_clock_anchor +
      case
        when v_clock_running and v_clock_started_at is not null
          then floor(extract(epoch from (v_now - v_clock_started_at)))::integer
        else 0
      end
    );
    v_clock_recorded_at := v_now;
  else
    v_clock_phase := null;
  end if;

  select e.id into v_event
  from public.game_day_crowd_events e
  where e.session_id = p_session_id
    and e.active = true
    and e.event_type = p_event_type
    and e.half = v_half
    and e.created_at > v_now - interval '75 seconds'
    and coalesce(e.player_key,'') = coalesce(p_player_key,'')
  order by e.created_at desc
  limit 1;

  if v_event is null then
    insert into public.game_day_crowd_events(
      session_id,match_id,event_type,half,
      player_key,player_name,player_number,
      assist_player_key,assist_player_name,assist_player_number,
      opponent_player_name,created_by,
      participant_count_snapshot,consensus_threshold,
      clock_period,clock_elapsed_seconds,clock_recorded_at
    )
    values(
      p_session_id,v_match,p_event_type,v_half,
      p_player_key,p_player_name,p_player_number,
      p_assist_player_key,p_assist_player_name,p_assist_player_number,
      p_opponent_player_name,auth.uid(),
      v_active,v_threshold,
      v_clock_phase,v_clock_seconds,v_clock_recorded_at
    )
    returning id into v_event;
  else
    update public.game_day_crowd_events
    set participant_count_snapshot = greatest(participant_count_snapshot,v_active),
        consensus_threshold = greatest(consensus_threshold,v_threshold)
    where id = v_event;
  end if;

  insert into public.game_day_event_reports(
    event_id,session_id,user_id,verdict,
    player_key,player_name,player_number,
    assist_player_key,assist_player_name,assist_player_number,
    opponent_player_name
  )
  values(
    v_event,p_session_id,auth.uid(),'confirm',
    p_player_key,p_player_name,p_player_number,
    p_assist_player_key,p_assist_player_name,p_assist_player_number,
    p_opponent_player_name
  )
  on conflict(event_id,user_id)
  do update set
    verdict = 'confirm',
    player_key = excluded.player_key,
    player_name = excluded.player_name,
    player_number = excluded.player_number,
    assist_player_key = excluded.assist_player_key,
    assist_player_name = excluded.assist_player_name,
    assist_player_number = excluded.assist_player_number,
    opponent_player_name = excluded.opponent_player_name,
    updated_at = v_now;

  return v_event;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.stamp_match_event_clock()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_session public.game_day_sessions%rowtype;v_now timestamptz:=now();
begin
  if new.entry_source='post_match' then
    new.clock_period:=null;new.clock_elapsed_seconds:=null;new.clock_recorded_at:=null;
    return new;
  end if;
  select * into v_session from public.game_day_sessions s where s.match_id=new.match_id;
  if found and v_session.clock_phase in ('first_half','second_half','extra_first_half','extra_second_half') then
    new.clock_period:=v_session.clock_phase;
    new.clock_elapsed_seconds:=greatest(0,v_session.clock_elapsed_seconds+
      case when v_session.clock_running and v_session.clock_started_at is not null
        then floor(extract(epoch from(v_now-v_session.clock_started_at)))::integer else 0 end);
    new.clock_recorded_at:=v_now;
    new.half:=case v_session.clock_phase when 'extra_first_half' then 'extra_first' when 'extra_second_half' then 'extra_second' when 'second_half' then 'second' else 'first' end;
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.save_post_match_events(p_match_id uuid, p_request_id uuid, p_revision text, p_upserts jsonb, p_delete_ids jsonb, p_mark_final boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    if event_id is null or kind is null or kind not in ('skor_goal','opponent_goal','skor_yellow_card','skor_red_card') or period is null or period not in ('first','second','extra_first','extra_second') then raise exception 'Check event type, half and identity.';end if;
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
end $function$
;
CREATE OR REPLACE FUNCTION public.control_match_clock(p_match_id uuid, p_action text, p_half_length_minutes smallint DEFAULT NULL::smallint, p_sub_interval_minutes smallint DEFAULT NULL::smallint)
 RETURNS TABLE(session_id uuid, match_id uuid, clock_phase text, clock_running boolean, clock_elapsed_seconds integer, clock_started_at timestamp with time zone, clock_phase_started_at timestamp with time zone, half_length_minutes smallint, sub_interval_minutes smallint, clock_updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_session public.game_day_sessions%rowtype;
  v_now timestamptz := now();
  v_elapsed integer;
  v_extra integer;
  v_phase text;
  v_half text;
  v_anchor integer;
  v_action text := lower(trim(coalesce(p_action,'')));
begin
  if auth.uid() is null or not public.is_skor_captain() then
    raise exception 'Captain access required.';
  end if;

  if p_match_id is null or not exists (
    select 1 from public.matches m where m.id = p_match_id
  ) then
    raise exception 'Choose a valid match.';
  end if;

  if p_half_length_minutes is not null and p_half_length_minutes not in (40,45) then
    raise exception 'Half length must be 40 or 45 minutes.';
  end if;

  if p_sub_interval_minutes is not null and p_sub_interval_minutes not in (10,15) then
    raise exception 'Substitution interval must be 10 or 15 minutes.';
  end if;

  insert into public.game_day_sessions(
    match_id, active, motm_voting_open, ref_review_open, created_by, updated_at,
    clock_updated_at, clock_updated_by
  )
  values(
    p_match_id, false, false, true, auth.uid(), v_now,
    v_now, auth.uid()
  )
  on conflict on constraint game_day_sessions_match_id_key do nothing;

  select * into v_session
  from public.game_day_sessions s
  where s.match_id = p_match_id
  for update;

  v_elapsed := greatest(0, v_session.clock_elapsed_seconds +
    case
      when v_session.clock_running and v_session.clock_started_at is not null
        then floor(extract(epoch from (v_now - v_session.clock_started_at)))::integer
      else 0
    end
  );

  if v_action = 'configure' then
    if p_half_length_minutes is not null
       and v_session.clock_phase <> 'not_started'
       and p_half_length_minutes <> v_session.half_length_minutes then
      raise exception 'Half length cannot change after the first half starts. Reset the clock first.';
    end if;

    update public.game_day_sessions s
    set half_length_minutes = coalesce(p_half_length_minutes, s.half_length_minutes),
        sub_interval_minutes = coalesce(p_sub_interval_minutes, s.sub_interval_minutes),
        clock_updated_at = v_now,
        clock_updated_by = auth.uid(),
        updated_at = v_now
    where s.id = v_session.id;

  elsif v_action = 'start_first_half' then
    if v_session.clock_phase <> 'not_started' then
      raise exception 'Reset the clock before starting a new first half.';
    end if;

    update public.game_day_sessions s
    set half_length_minutes = coalesce(p_half_length_minutes, s.half_length_minutes),
        sub_interval_minutes = coalesce(p_sub_interval_minutes, s.sub_interval_minutes),
        clock_phase = 'first_half',
        clock_running = true,
        clock_elapsed_seconds = 0,
        clock_started_at = v_now,
        clock_phase_started_at = v_now,
        clock_updated_at = v_now,
        clock_updated_by = auth.uid(),
        updated_at = v_now
    where s.id = v_session.id;

    update public.matches
    set status = 'first_half', current_half = 'first', updated_at = v_now
    where id = p_match_id;

  elsif v_action = 'pause' then
    if v_session.clock_phase not in ('first_half','second_half','extra_first_half','extra_second_half') or not v_session.clock_running then
      raise exception 'The match clock is not running.';
    end if;

    update public.game_day_sessions s
    set clock_running = false,
        clock_elapsed_seconds = v_elapsed,
        clock_started_at = null,
        clock_updated_at = v_now,
        clock_updated_by = auth.uid(),
        updated_at = v_now
    where s.id = v_session.id;

  elsif v_action = 'resume' then
    if v_session.clock_phase not in ('first_half','second_half','extra_first_half','extra_second_half') or v_session.clock_running then
      raise exception 'The match clock is not paused in a playable half.';
    end if;

    update public.game_day_sessions s
    set clock_running = true,
        clock_started_at = v_now,
        clock_updated_at = v_now,
        clock_updated_by = auth.uid(),
        updated_at = v_now
    where s.id = v_session.id;

  elsif v_action = 'halftime' then
    if v_session.clock_phase <> 'first_half' then
      raise exception 'Halftime can only start from the first half.';
    end if;

    update public.game_day_sessions s
    set clock_phase = 'halftime',
        clock_running = false,
        clock_elapsed_seconds = s.half_length_minutes * 60,
        clock_started_at = null,
        clock_phase_started_at = v_now,
        clock_updated_at = v_now,
        clock_updated_by = auth.uid(),
        updated_at = v_now
    where s.id = v_session.id;

    update public.matches
    set status = 'halftime', current_half = 'first', updated_at = v_now
    where id = p_match_id;

  elsif v_action = 'start_second_half' then
    if v_session.clock_phase <> 'halftime' then
      raise exception 'Start the second half from halftime.';
    end if;

    update public.game_day_sessions s
    set clock_phase = 'second_half',
        clock_running = true,
        clock_elapsed_seconds = s.half_length_minutes * 60,
        clock_started_at = v_now,
        clock_phase_started_at = v_now,
        clock_updated_at = v_now,
        clock_updated_by = auth.uid(),
        updated_at = v_now
    where s.id = v_session.id;

    update public.matches
    set status = 'second_half', current_half = 'second', updated_at = v_now
    where id = p_match_id;

  elsif v_action = 'full_time' then
    if v_session.clock_phase not in ('second_half','extra_first_half','extra_halftime','extra_second_half') then
      raise exception 'Full time can only be recorded from the second half.';
    end if;

    update public.game_day_sessions s
    set clock_phase = 'full_time',
        clock_running = false,
        clock_elapsed_seconds = v_elapsed,
        clock_started_at = null,
        clock_phase_started_at = v_now,
        clock_updated_at = v_now,
        clock_updated_by = auth.uid(),
        updated_at = v_now
    where s.id = v_session.id;

    update public.matches
    set status = 'final', current_half = 'second', updated_at = v_now
    where id = p_match_id;

  elsif v_action in ('end_regulation','start_extra_first_half','extra_halftime','start_extra_second_half','start_shootout') then
    select t.extra_minutes into v_extra from skor_private.match_tiebreaks t where t.match_id=p_match_id;
    v_extra:=coalesce(v_extra,5);
    if v_action='end_regulation' and v_session.clock_phase='second_half' then
      v_phase:='extra_break';v_half:='second';v_anchor:=v_elapsed;
    elsif v_action='start_extra_first_half' and v_session.clock_phase in ('extra_break','full_time') then
      v_phase:='extra_first_half';v_half:='extra_first';v_anchor:=v_session.half_length_minutes*120;
    elsif v_action='extra_halftime' and v_session.clock_phase='extra_first_half' then
      v_phase:='extra_halftime';v_half:='extra_first';v_anchor:=v_session.half_length_minutes*120+v_extra*60;
    elsif v_action='start_extra_second_half' and v_session.clock_phase='extra_halftime' then
      v_phase:='extra_second_half';v_half:='extra_second';v_anchor:=v_session.half_length_minutes*120+v_extra*60;
    elsif v_action='start_shootout' and v_session.clock_phase in ('second_half','extra_break','extra_second_half','full_time') then
      v_phase:='shootout';v_half:=coalesce((select m.current_half from public.matches m where m.id=p_match_id),'second');v_anchor:=v_elapsed;
    else raise exception 'That period cannot start from the current clock phase.';end if;
    if (v_action in ('end_regulation','start_extra_first_half','start_shootout') or (v_action in ('extra_halftime','start_extra_second_half') and coalesce((select t.golden_goal from skor_private.match_tiebreaks t where t.match_id=p_match_id),true))) and
      (select count(*) filter(where e.event_type in ('skor_goal','opponent_own_goal')) <> count(*) filter(where e.event_type in ('opponent_goal','skor_own_goal')) from public.match_events e where e.match_id=p_match_id)
    then raise exception 'Review the tied match score before starting another tie-break period.';end if;
    update public.game_day_sessions s set clock_phase=v_phase,clock_running=v_phase in ('extra_first_half','extra_second_half'),
      clock_elapsed_seconds=v_anchor,clock_started_at=case when v_phase in ('extra_first_half','extra_second_half') then v_now end,
      clock_phase_started_at=v_now,clock_updated_at=v_now,clock_updated_by=auth.uid(),updated_at=v_now where s.id=v_session.id;
    update public.matches set status=case when v_phase='shootout' then 'shootout' else 'extra_time' end,current_half=v_half,updated_at=v_now where id=p_match_id;
  elsif v_action = 'reset' then
    update public.game_day_sessions s
    set clock_phase = 'not_started',
        clock_running = false,
        clock_elapsed_seconds = 0,
        clock_started_at = null,
        clock_phase_started_at = null,
        clock_updated_at = v_now,
        clock_updated_by = auth.uid(),
        updated_at = v_now
    where s.id = v_session.id;

    update public.matches
    set status = 'scheduled', current_half = null, updated_at = v_now
    where id = p_match_id;

  else
    raise exception 'Unsupported clock action.';
  end if;

  return query
  select s.id, s.match_id, s.clock_phase, s.clock_running,
         s.clock_elapsed_seconds, s.clock_started_at, s.clock_phase_started_at,
         s.half_length_minutes, s.sub_interval_minutes, s.clock_updated_at
  from public.game_day_sessions s
  where s.match_id = p_match_id;
end;
$function$
;
create function skor_private.shootout_summary(shots jsonb,initial_kicks integer,first_team text)
returns jsonb language plpgsql immutable set search_path='' as $$
declare shot jsonb;idx integer:=0;ns integer:=0;no integer:=0;gs integer:=0;go integer:=0;winner text;team text;
begin
  if initial_kicks is null or initial_kicks not between 1 and 20 or first_team is null or first_team not in ('skor','opponent')
    or jsonb_typeof(shots) is distinct from 'array' or jsonb_array_length(shots)>200 then raise exception 'Check shootout settings and kicks.';end if;
  if (select count(distinct x->>'id') from jsonb_array_elements(shots) x)<>jsonb_array_length(shots) then raise exception 'Each kick needs a unique ID.';end if;
  for shot in select value from jsonb_array_elements(shots) loop
    if winner is not null then raise exception 'No more kicks can follow a decided shootout. Review the last kick.';end if;
    team:=case when idx%2=0 then first_team when first_team='skor' then 'opponent' else 'skor' end;
    if shot->>'team' is distinct from team or shot->>'outcome' is null or shot->>'outcome' not in ('scored','missed') or length(coalesce(shot->>'id',''))>80 then raise exception 'Kicks must alternate teams and be marked scored or missed.';end if;
    if team='skor' then ns:=ns+1;if shot->>'outcome'='scored' then gs:=gs+1;end if;
    else no:=no+1;if shot->>'outcome'='scored' then go:=go+1;end if;end if;
    if ns<=initial_kicks and no<=initial_kicks then
      if gs>go+initial_kicks-no then winner:='skor';elsif go>gs+initial_kicks-ns then winner:='opponent';end if;
    elsif ns=no and gs<>go then winner:=case when gs>go then 'skor' else 'opponent' end;
    end if;
    idx:=idx+1;
  end loop;
  return jsonb_build_object('skor',gs,'opponent',go,'skor_taken',ns,'opponent_taken',no,'winner',winner,
    'next_team',case when idx%2=0 then first_team when first_team='skor' then 'opponent' else 'skor' end,
    'sudden_death',ns>=initial_kicks and no>=initial_kicks and winner is null);
end $$;
revoke all on function skor_private.shootout_summary(jsonb,integer,text) from public,anon,authenticated;

create function public.get_match_tiebreak(p_match_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare t skor_private.match_tiebreaks%rowtype;
begin
  if auth.uid() is null or not coalesce(public.is_skor_captain(),false) then raise exception 'Captain access required.' using errcode='42501';end if;
  if not exists(select 1 from public.matches where id=p_match_id) then raise exception 'Match not found.';end if;
  select * into t from skor_private.match_tiebreaks where match_id=p_match_id;
  return jsonb_build_object('match_id',p_match_id,'revision',coalesce(t.revision,0),'extra_minutes',coalesce(t.extra_minutes,5),'golden_goal',coalesce(t.golden_goal,true),
    'initial_kicks',coalesce(t.initial_kicks,5),'first_team',coalesce(t.first_team,'skor'),'shots',coalesce(t.shots,'[]'::jsonb),'completed',coalesce(t.completed,false),
    'participants',(select coalesce(jsonb_agg(to_jsonb(p)),'[]') from skor_private.post_match_people(p_match_id) p));
end $$;
revoke all on function public.get_match_tiebreak(uuid) from public,anon;
grant execute on function public.get_match_tiebreak(uuid) to authenticated;

create function public.save_match_tiebreak(p_match_id uuid,p_request_id uuid,p_revision integer,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t skor_private.match_tiebreaks%rowtype;prior skor_private.tiebreak_saves%rowtype;summary jsonb;shot jsonb;
  mins smallint;kicks smallint;golden boolean;finished boolean;first_team text;shots jsonb;result jsonb;actor uuid:=auth.uid();
begin
  if actor is null or not coalesce(public.is_skor_captain(),false) then raise exception 'Captain access required.' using errcode='42501';end if;
  if p_match_id is null or p_request_id is null or p_revision is null or jsonb_typeof(p_payload) is distinct from 'object'
    or octet_length(p_payload::text)>100000 then raise exception 'Check match, revision and shootout payload.';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select * into prior from skor_private.tiebreak_saves where request_id=p_request_id;
  if found then
    if prior.actor=actor and prior.match_id=p_match_id and prior.payload=jsonb_build_object('revision',p_revision,'body',p_payload) then return prior.result;end if;
    raise exception 'This save ID belongs to another submission.';end if;
  perform 1 from public.game_day_sessions where match_id=p_match_id for update;
  perform 1 from public.matches where id=p_match_id for update;
  if not found then raise exception 'Match not found.';end if;
  select * into t from skor_private.match_tiebreaks where match_id=p_match_id for update;
  if coalesce(t.revision,0)<>p_revision then raise exception 'Shootout changed. Reload and review.' using errcode='40001';end if;
  mins:=(p_payload->>'extra_minutes')::smallint;kicks:=(p_payload->>'initial_kicks')::smallint;golden:=(p_payload->>'golden_goal')::boolean;
  finished:=(p_payload->>'completed')::boolean;first_team:=p_payload->>'first_team';shots:=p_payload->'shots';
  if mins is null or mins not between 1 and 30 or golden is null or finished is null then raise exception 'Choose overtime minutes and golden-goal rule.';end if;
  if exists(select 1 from public.game_day_sessions s where s.match_id=p_match_id and s.clock_phase in ('extra_first_half','extra_halftime','extra_second_half','shootout'))
    and (mins<>coalesce(t.extra_minutes,5) or golden<>coalesce(t.golden_goal,true)) then raise exception 'Overtime settings cannot change after overtime starts.';end if;
  summary:=skor_private.shootout_summary(shots,kicks,first_team);
  if jsonb_array_length(shots)>0 then
    if exists(select 1 from public.matches where id=p_match_id and kickoff>now()) then raise exception 'Record kicks only after kickoff.';end if;
    if (select count(*) filter(where e.event_type in ('skor_goal','opponent_own_goal'))<>count(*) filter(where e.event_type in ('opponent_goal','skor_own_goal')) from public.match_events e where e.match_id=p_match_id) then raise exception 'A shootout requires a tied match score. Review match goals first.';end if;
    for shot in select value from jsonb_array_elements(shots) loop
      if shot->>'player_key' is not null and (shot->>'team'<>'skor' or not exists(select 1 from skor_private.post_match_people(p_match_id) p where p.player_key=shot->>'player_key')) then raise exception 'Choose this match’s player or leave the kicker unknown.';end if;
    end loop;
  end if;
  if finished and summary->>'winner' is null then raise exception 'The shootout is not decided yet. Record the remaining kicks.';end if;
  insert into skor_private.match_tiebreaks as target(match_id,extra_minutes,golden_goal,initial_kicks,first_team,shots,completed)
    values(p_match_id,mins,golden,kicks,first_team,shots,finished)
  on conflict(match_id) do update set revision=target.revision+1,extra_minutes=excluded.extra_minutes,golden_goal=excluded.golden_goal,
    initial_kicks=excluded.initial_kicks,first_team=excluded.first_team,shots=excluded.shots,completed=excluded.completed,updated_at=now();
  update public.matches set updated_at=now(),status=case when finished then 'final' else status end where id=p_match_id;
  if finished then
    update public.game_day_sessions s set clock_elapsed_seconds=greatest(0,s.clock_elapsed_seconds+case when s.clock_running and s.clock_started_at is not null then floor(extract(epoch from(now()-s.clock_started_at)))::integer else 0 end),
      clock_phase='full_time',clock_running=false,clock_started_at=null,clock_phase_started_at=now(),clock_updated_at=now(),clock_updated_by=actor,updated_at=now() where s.match_id=p_match_id;
  end if;
  result:=jsonb_build_object('ok',true,'revision',coalesce(t.revision,0)+1,'summary',summary);
  insert into skor_private.tiebreak_saves(request_id,actor,match_id,payload,result) values(p_request_id,actor,p_match_id,jsonb_build_object('revision',p_revision,'body',p_payload),result);
  return result;
end $$;
revoke all on function public.save_match_tiebreak(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.save_match_tiebreak(uuid,uuid,integer,jsonb) to authenticated;

revoke all on function public.control_match_clock(uuid,text,smallint,smallint), public.save_post_match_events(uuid,uuid,text,jsonb,jsonb,boolean), public.report_ref_decision(uuid,text,text,text,text), public.report_game_day_event(uuid,text,text,text,text,integer,text,text,integer,text) from public,anon;
grant execute on function public.control_match_clock(uuid,text,smallint,smallint), public.save_post_match_events(uuid,uuid,text,jsonb,jsonb,boolean), public.report_ref_decision(uuid,text,text,text,text), public.report_game_day_event(uuid,text,text,text,text,integer,text,text,integer,text) to authenticated;
