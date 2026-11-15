-- Disposable CI database only; fictional identities, no production data.
create role anon nologin;create role authenticated nologin;
create schema auth;create schema skor_private;
create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
create function public.is_skor_captain() returns boolean language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'email','')='captain@fixture.invalid'$$;
grant usage on schema public,auth to anon,authenticated;
create sequence public.match_events_sequence_seq;
create table public.game_day_crowd_events("id" uuid default gen_random_uuid() not null,
"session_id" uuid not null,
"match_id" uuid not null,
"event_type" text not null,
"half" text not null,
"player_key" text,
"player_name" text,
"player_number" integer,
"assist_player_key" text,
"assist_player_name" text,
"assist_player_number" integer,
"opponent_player_name" text,
"created_by" uuid not null,
"active" boolean default true not null,
"created_at" timestamp with time zone default now() not null,
"participant_count_snapshot" integer default 1 not null,
"consensus_threshold" integer default 1 not null,
"clock_period" text,
"clock_elapsed_seconds" integer,
"clock_recorded_at" timestamp with time zone,
primary key(id));
create table public.game_day_ref_decisions("id" uuid default gen_random_uuid() not null,
"session_id" uuid not null,
"match_id" uuid not null,
"half" text not null,
"decision_type" text not null,
"description" text,
"created_by" uuid not null,
"active" boolean default true not null,
"created_at" timestamp with time zone default now() not null,
"clock_period" text,
"clock_elapsed_seconds" integer,
"clock_recorded_at" timestamp with time zone,
primary key(id));
create table public.game_day_sessions("id" uuid default gen_random_uuid() not null,
"match_id" uuid not null,
"active" boolean default true not null,
"motm_voting_open" boolean default false not null,
"ref_review_open" boolean default true not null,
"expires_at" timestamp with time zone,
"created_by" uuid,
"created_at" timestamp with time zone default now() not null,
"updated_at" timestamp with time zone default now() not null,
"clock_phase" text default 'not_started'::text not null,
"clock_running" boolean default false not null,
"clock_elapsed_seconds" integer default 0 not null,
"clock_started_at" timestamp with time zone,
"clock_phase_started_at" timestamp with time zone,
"half_length_minutes" smallint default 45 not null,
"sub_interval_minutes" smallint default 15 not null,
"clock_updated_at" timestamp with time zone default now() not null,
"clock_updated_by" uuid,
primary key(id),
constraint game_day_sessions_match_id_key unique(match_id));
create table public.match_events("id" uuid default gen_random_uuid() not null,
"match_id" uuid not null,
"event_type" text not null,
"half" text not null,
"sequence" integer,
"player_name" text,
"player_number" text,
"assist_player_name" text,
"assist_player_number" text,
"created_by" uuid,
"created_at" timestamp with time zone default now() not null,
"updated_at" timestamp with time zone default now() not null,
"roster_player_number" text,
"assist_roster_player_number" text,
"roster_player_key" text,
"assist_roster_player_key" text,
"clock_period" text,
"clock_elapsed_seconds" integer,
"clock_recorded_at" timestamp with time zone,
"entry_source" text default 'live'::text not null,
"assist_status" text,
primary key(id));
create table public.matches("id" uuid default gen_random_uuid() not null,
"slug" text not null,
"kickoff" timestamp with time zone not null,
"arrival_at" timestamp with time zone,
"home_team" text not null,
"away_team" text not null,
"location" text,
"home_logo" text,
"away_logo" text,
"status" text default 'scheduled'::text not null,
"current_half" text,
"published" boolean default true not null,
"man_of_match_player_name" text,
"man_of_match_player_number" text,
"man_of_match_reason" text,
"created_by" uuid,
"created_at" timestamp with time zone default now() not null,
"updated_at" timestamp with time zone default now() not null,
"man_of_match_roster_player_number" text,
"man_of_match_player_key" text,
primary key(id));
create table skor_private.post_match_saves(request_id uuid primary key,match_id uuid,actor uuid,payload jsonb,result jsonb,created_at timestamptz default now());
create function skor_private.post_match_people(mid uuid) returns table(player_key text,name text,number integer,is_temp boolean) language sql stable as $$select 'fixture-player','Fixture Player',7,false union all select 'fixture-assist','Fixture Assist',12,false$$;
CREATE OR REPLACE FUNCTION skor_private.post_match_revision(mid uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select md5(jsonb_build_object('events',(select coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]') from public.match_events e where e.match_id=mid),
    'match',(select jsonb_build_object('updated_at',m.updated_at,'status',m.status) from public.matches m where m.id=mid),
    'clock',(select jsonb_build_object('updated_at',s.clock_updated_at,'phase',s.clock_phase,'running',s.clock_running) from public.game_day_sessions s where s.match_id=mid))::text);
$function$
;
CREATE OR REPLACE FUNCTION public.get_post_match_editor(p_match_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or not coalesce(public.is_skor_captain(),false) then raise exception 'Captain access required.' using errcode='42501';end if;
  if not exists(select 1 from public.matches where id=p_match_id) then raise exception 'Match not found.';end if;
  return jsonb_build_object('revision',skor_private.post_match_revision(p_match_id),
    'match',(select jsonb_build_object('id',m.id,'home_team',m.home_team,'away_team',m.away_team,'kickoff',m.kickoff,'status',m.status) from public.matches m where m.id=p_match_id),
    'participants',(select coalesce(jsonb_agg(to_jsonb(p) order by p.is_temp,p.number nulls last,p.name),'[]') from skor_private.post_match_people(p_match_id) p),
    'events',(select coalesce(jsonb_agg(to_jsonb(e)-'created_by' order by e.sequence,e.id),'[]') from public.match_events e where e.match_id=p_match_id));
end $function$
;
alter table public.matches add constraint matches_current_half_check check(current_half in ('first','second'));
alter table public.matches add constraint matches_status_check check(status in ('scheduled','first_half','halftime','second_half','final'));
alter table public.game_day_sessions add constraint game_day_sessions_clock_phase_check check(clock_phase in ('not_started','first_half','halftime','second_half','full_time'));
alter table public.game_day_sessions add constraint game_day_sessions_clock_running_check check(not clock_running or (clock_phase in ('first_half','second_half') and clock_started_at is not null));
alter table public.match_events add constraint match_events_half_check check(half in ('first','second'));
alter table public.match_events add constraint match_events_clock_period_check check(clock_period in ('first_half','second_half'));
alter table public.game_day_crowd_events add constraint game_day_crowd_events_half_check check(half in ('first','second'));
alter table public.game_day_crowd_events add constraint game_day_crowd_events_clock_period_check check(clock_period in ('first_half','second_half'));
alter table public.game_day_ref_decisions add constraint game_day_ref_decisions_half_check check(half in ('first','second'));
alter table public.game_day_ref_decisions add constraint game_day_ref_decisions_clock_period_check check(clock_period in ('first_half','second_half'));
