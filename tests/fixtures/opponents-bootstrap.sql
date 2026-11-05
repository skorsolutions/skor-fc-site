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
