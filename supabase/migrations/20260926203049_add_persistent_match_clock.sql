-- Persistent, captain-authoritative Game Day clock.
-- The stored anchor plus clock_started_at lets every client reconstruct the
-- current official time after a refresh or after the app has been closed.

alter table public.game_day_sessions
  add column if not exists clock_phase text not null default 'not_started',
  add column if not exists clock_running boolean not null default false,
  add column if not exists clock_elapsed_seconds integer not null default 0,
  add column if not exists clock_started_at timestamptz,
  add column if not exists clock_phase_started_at timestamptz,
  add column if not exists half_length_minutes smallint not null default 45,
  add column if not exists sub_interval_minutes smallint not null default 15,
  add column if not exists clock_updated_at timestamptz not null default now(),
  add column if not exists clock_updated_by uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'game_day_sessions_clock_phase_check'
      and conrelid = 'public.game_day_sessions'::regclass
  ) then
    alter table public.game_day_sessions
      add constraint game_day_sessions_clock_phase_check
      check (clock_phase in ('not_started','first_half','halftime','second_half','full_time'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'game_day_sessions_clock_elapsed_check'
      and conrelid = 'public.game_day_sessions'::regclass
  ) then
    alter table public.game_day_sessions
      add constraint game_day_sessions_clock_elapsed_check
      check (clock_elapsed_seconds >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'game_day_sessions_half_length_check'
      and conrelid = 'public.game_day_sessions'::regclass
  ) then
    alter table public.game_day_sessions
      add constraint game_day_sessions_half_length_check
      check (half_length_minutes in (40,45));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'game_day_sessions_sub_interval_check'
      and conrelid = 'public.game_day_sessions'::regclass
  ) then
    alter table public.game_day_sessions
      add constraint game_day_sessions_sub_interval_check
      check (sub_interval_minutes in (10,15));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'game_day_sessions_clock_running_check'
      and conrelid = 'public.game_day_sessions'::regclass
  ) then
    alter table public.game_day_sessions
      add constraint game_day_sessions_clock_running_check
      check (
        not clock_running
        or (clock_phase in ('first_half','second_half') and clock_started_at is not null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'game_day_sessions_clock_updated_by_fkey'
      and conrelid = 'public.game_day_sessions'::regclass
  ) then
    alter table public.game_day_sessions
      add constraint game_day_sessions_clock_updated_by_fkey
      foreign key (clock_updated_by) references auth.users(id) on delete set null;
  end if;
end $$;

create index if not exists game_day_sessions_clock_updated_by_idx
  on public.game_day_sessions (clock_updated_by)
  where clock_updated_by is not null;

-- Preserve an existing match phase as a paused clock when the migration lands.
-- No historical wall-clock time is guessed.
update public.game_day_sessions s
set clock_phase = case m.status
    when 'first_half' then 'first_half'
    when 'halftime' then 'halftime'
    when 'second_half' then 'second_half'
    when 'final' then 'full_time'
    else 'not_started'
  end,
  clock_running = false,
  clock_elapsed_seconds = case m.status
    when 'halftime' then 45 * 60
    when 'second_half' then 45 * 60
    when 'final' then 90 * 60
    else 0
  end,
  clock_started_at = null,
  clock_phase_started_at = case when m.status = 'halftime' then s.updated_at else null end,
  clock_updated_at = now()
from public.matches m
where m.id = s.match_id
  and s.clock_phase = 'not_started';

alter table public.match_events
  add column if not exists clock_period text,
  add column if not exists clock_elapsed_seconds integer,
  add column if not exists clock_recorded_at timestamptz;

-- Captain scoring can record ordinary fouls as timestamped, score-neutral
-- match events in addition to goals and cards.
alter table public.match_events
  drop constraint if exists match_events_event_type_check;
alter table public.match_events
  add constraint match_events_event_type_check
  check (event_type in (
    'skor_goal','opponent_goal','opponent_own_goal','skor_own_goal',
    'skor_yellow_card','skor_red_card','opponent_yellow_card','opponent_red_card',
    'skor_foul','opponent_foul'
  ));

alter table public.game_day_crowd_events
  add column if not exists clock_period text,
  add column if not exists clock_elapsed_seconds integer,
  add column if not exists clock_recorded_at timestamptz;

alter table public.game_day_ref_decisions
  add column if not exists clock_period text,
  add column if not exists clock_elapsed_seconds integer,
  add column if not exists clock_recorded_at timestamptz;

do $$
declare
  v_table regclass;
  v_name text;
begin
  foreach v_table in array array[
    'public.match_events'::regclass,
    'public.game_day_crowd_events'::regclass,
    'public.game_day_ref_decisions'::regclass
  ] loop
    v_name := replace(v_table::text, '.', '_') || '_clock_period_check';
    if not exists (
      select 1 from pg_constraint
      where conname = v_name and conrelid = v_table
    ) then
      execute format(
        'alter table %s add constraint %I check (clock_period is null or clock_period in (''first_half'',''second_half''))',
        v_table,
        v_name
      );
    end if;

    v_name := replace(v_table::text, '.', '_') || '_clock_elapsed_check';
    if not exists (
      select 1 from pg_constraint
      where conname = v_name and conrelid = v_table
    ) then
      execute format(
        'alter table %s add constraint %I check (clock_elapsed_seconds is null or clock_elapsed_seconds >= 0)',
        v_table,
        v_name
      );
    end if;
  end loop;
end $$;

comment on column public.game_day_sessions.clock_elapsed_seconds is
  'Official match seconds accumulated at clock_started_at, or the held value while paused/at halftime/full time.';
comment on column public.game_day_sessions.clock_phase_started_at is
  'Wall-clock time when the current phase began; used to show the halftime break timer.';
comment on column public.game_day_sessions.sub_interval_minutes is
  'Default cadence for planned substitution reminders; supported values are 10 and 15 minutes.';
comment on column public.match_events.clock_elapsed_seconds is
  'Captain-authoritative official match time captured when the event was inserted.';
comment on column public.game_day_crowd_events.clock_elapsed_seconds is
  'Captain-authoritative official match time captured when the first matching crowd report created the event.';
comment on column public.game_day_ref_decisions.clock_elapsed_seconds is
  'Captain-authoritative official match time captured when the first matching referee report created the decision.';

create or replace function public.control_match_clock(
  p_match_id uuid,
  p_action text,
  p_half_length_minutes smallint default null,
  p_sub_interval_minutes smallint default null
)
returns table(
  session_id uuid,
  match_id uuid,
  clock_phase text,
  clock_running boolean,
  clock_elapsed_seconds integer,
  clock_started_at timestamptz,
  clock_phase_started_at timestamptz,
  half_length_minutes smallint,
  sub_interval_minutes smallint,
  clock_updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.game_day_sessions%rowtype;
  v_now timestamptz := now();
  v_elapsed integer;
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
    if v_session.clock_phase not in ('first_half','second_half') or not v_session.clock_running then
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
    if v_session.clock_phase not in ('first_half','second_half') or v_session.clock_running then
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
    if v_session.clock_phase <> 'second_half' then
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
$$;

revoke all on function public.control_match_clock(uuid,text,smallint,smallint) from public, anon;
grant execute on function public.control_match_clock(uuid,text,smallint,smallint) to authenticated;

comment on function public.control_match_clock(uuid,text,smallint,smallint) is
  'Captain-only transactional control for the persistent official Game Day clock and matching match status.';

create or replace function public.stamp_match_event_clock()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.game_day_sessions%rowtype;
  v_now timestamptz := now();
begin
  select * into v_session
  from public.game_day_sessions s
  where s.match_id = new.match_id;

  if found and v_session.clock_phase in ('first_half','second_half') then
    new.clock_period := v_session.clock_phase;
    new.clock_elapsed_seconds := greatest(0, v_session.clock_elapsed_seconds +
      case
        when v_session.clock_running and v_session.clock_started_at is not null
          then floor(extract(epoch from (v_now - v_session.clock_started_at)))::integer
        else 0
      end
    );
    new.clock_recorded_at := v_now;
    new.half := case when v_session.clock_phase = 'second_half' then 'second' else 'first' end;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_stamp_match_event_clock on public.match_events;
create trigger trg_stamp_match_event_clock
before insert on public.match_events
for each row execute function public.stamp_match_event_clock();

revoke all on function public.stamp_match_event_clock() from public, anon, authenticated;

create or replace function public.report_game_day_event(
  p_session_id uuid,
  p_event_type text,
  p_half text,
  p_player_key text default null,
  p_player_name text default null,
  p_player_number integer default null,
  p_assist_player_key text default null,
  p_assist_player_name text default null,
  p_assist_player_number integer default null,
  p_opponent_player_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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

  if p_half not in ('first','second') then
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

  if v_clock_phase in ('first_half','second_half') then
    v_half := case when v_clock_phase = 'second_half' then 'second' else 'first' end;
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
$$;

revoke all on function public.report_game_day_event(uuid,text,text,text,text,integer,text,text,integer,text) from public, anon;
grant execute on function public.report_game_day_event(uuid,text,text,text,text,integer,text,text,integer,text) to authenticated;

create or replace function public.report_ref_decision(
  p_session_id uuid,
  p_half text,
  p_decision_type text,
  p_description text,
  p_vote text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
  if p_half not in ('first','second') then
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

  if v_clock_phase in ('first_half','second_half') then
    v_half := case when v_clock_phase = 'second_half' then 'second' else 'first' end;
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
$$;

revoke all on function public.report_ref_decision(uuid,text,text,text,text) from public, anon;
grant execute on function public.report_ref_decision(uuid,text,text,text,text) to authenticated;
