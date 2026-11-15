-- Additional disposable CI schema adapters only.
create function public.is_approved_captain() returns boolean language sql stable as $$select public.is_skor_captain()$$;
create function public.current_player_id() returns uuid language sql stable as $$select case when (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'email')='player@fixture.invalid' then '20000000-0000-4000-8000-000000000003'::uuid end$$;
create function skor_private.canonical_participant_key(uuid,text) returns text language sql stable as $$select $2$$;
create table public.public_roster(player_key text,jersey_number integer,display_name text);
alter table public.match_events enable row level security;
create policy fixture_existing_read on public.match_events for select to public using(true);
grant select on public.match_events to anon,authenticated;
