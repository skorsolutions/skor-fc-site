create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema skor_private;
create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;

create function public.is_skor_captain() returns boolean language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'email','') in ('captain@fixture.invalid','other-captain@fixture.invalid')$$;
grant usage on schema public,auth to anon,authenticated;
grant execute on function auth.uid(),public.is_skor_captain() to anon,authenticated;
create table public.matches(id uuid primary key,home_team text,away_team text,kickoff timestamptz,status text);
create table public.match_strategies(id uuid primary key);
create table public.strategy_scene_bundles(id uuid primary key);
insert into public.matches values('10000000-0000-4000-8000-000000000001','SKOR FC','Fixture Wolves',now()-interval '10 days','final');
insert into public.matches values('10000000-0000-4000-8000-000000000002','Fixture Wolves','SKOR FC',now()+interval '10 days','scheduled');

create table public.team_roster(id uuid primary key,player_key text,preferred_name text,full_name text,jersey_number integer,position text,active boolean,is_guest boolean);
create table public.player_playing_status(player_id uuid,playing_status text);
create table public.player_match_availability(player_id uuid,match_id uuid,status text);
create table public.player_match_attendance(player_id uuid,match_id uuid,status text);
create table public.match_temp_players(id uuid primary key,match_id uuid,display_name text,jersey_number integer,active boolean);
create table skor_private.guest_match_links(temp_id uuid,match_id uuid,player_id uuid,active boolean);
