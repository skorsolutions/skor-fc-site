-- Disposable CI fixtures only; no production IDs or real match records.
\set ON_ERROR_STOP on
begin;
insert into public.matches(id,slug,kickoff,home_team,away_team,status,published) values
('30000000-0000-4000-8000-000000000001','result-pens',now()-interval '1 day','SKOR FC','Fixture','final',true),
('30000000-0000-4000-8000-000000000002','result-away',now()-interval '1 day','Fixture','SKOR FC','final',true),
('30000000-0000-4000-8000-000000000003','result-draw',now()-interval '1 day','SKOR FC','Fixture','final',true),
('30000000-0000-4000-8000-000000000004','result-hidden',now()-interval '1 day','SKOR FC','Fixture','final',false),
('30000000-0000-4000-8000-000000000005','result-live',now()-interval '1 day','SKOR FC','Fixture','first_half',true),
('30000000-0000-4000-8000-000000000006','result-future',now()+interval '1 day','SKOR FC','Fixture','final',true),
('30000000-0000-4000-8000-000000000007','result-unconfirmed',now()-interval '1 day','SKOR FC','Fixture','final',true);
insert into public.match_events(match_id,event_type,half,player_name,roster_player_key)
select '30000000-0000-4000-8000-000000000001'::uuid,'skor_goal','first','Fixture','fixture-player' from generate_series(1,3)
union all select '30000000-0000-4000-8000-000000000001','opponent_goal','first',null,null from generate_series(1,3)
union all select '30000000-0000-4000-8000-000000000001','skor_yellow_card','second','Private card name','fixture-player'
union all select '30000000-0000-4000-8000-000000000002','opponent_own_goal','first',null,null;
insert into skor_private.match_tiebreaks(match_id,completed,shots,initial_kicks,first_team)
select mid,true,'[{"id":"1","team":"skor","outcome":"missed"},{"id":"2","team":"opponent","outcome":"missed"},{"id":"3","team":"skor","outcome":"scored"},{"id":"4","team":"opponent","outcome":"missed"},{"id":"5","team":"skor","outcome":"scored"},{"id":"6","team":"opponent","outcome":"scored"},{"id":"7","team":"skor","outcome":"scored"},{"id":"8","team":"opponent","outcome":"scored"},{"id":"9","team":"skor","outcome":"scored"}]'::jsonb,5,'skor'
from (values('30000000-0000-4000-8000-000000000001'::uuid),('30000000-0000-4000-8000-000000000007'::uuid)) v(mid);
update skor_private.match_tiebreaks set completed=false where match_id='30000000-0000-4000-8000-000000000007';
select set_config('request.jwt.claims','{}',true);
set local role anon;
do $$declare r record;stats jsonb;begin
 select * into r from public.get_public_match_results() where match_id='30000000-0000-4000-8000-000000000001';
 if r.home_score<>3 or r.away_score<>3 or r.penalty_skor<>4 or r.penalty_opponent<>2 or not r.on_penalties or r.outcome<>'win' then raise exception '3-3, won 4-2 penalties projection failed';end if;
 select * into r from public.get_public_match_results() where match_id='30000000-0000-4000-8000-000000000002';
 if r.home_score<>0 or r.away_score<>1 or r.skor_score<>1 or r.outcome<>'win' then raise exception 'Away score orientation failed';end if;
 if exists(select 1 from public.get_public_match_results() where match_id in ('30000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000006')) then raise exception 'Hidden/live/future results leaked';end if;
 if exists(select 1 from public.get_public_match_results() where match_id='30000000-0000-4000-8000-000000000007' and (on_penalties or outcome<>'draw')) then raise exception 'Unconfirmed winner exposed';end if;
 if exists(select 1 from public.match_events) then raise exception 'Anonymous event details leaked';end if;
 stats:=public.get_public_player_season_stats();
 if jsonb_path_exists(stats,'$.**.yellow') or jsonb_path_exists(stats,'$.**.red') or stats::text like '%Private card name%' then raise exception 'Public discipline leaked';end if;
 if (stats->'totals'->>'goals')::integer<4 then raise exception 'Goals dropped from public aggregates';end if;
 begin perform * from skor_private.match_tiebreaks;raise exception 'Private kicks readable';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","email":"captain@fixture.invalid"}',true);
set local role authenticated;
do $$begin if not exists(select 1 from public.match_events where player_name='Private card name') then raise exception 'Captain discipline lost';end if;end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000003","email":"player@fixture.invalid"}',true);
set local role authenticated;
do $$begin if not exists(select 1 from public.match_events where player_name='Private card name') then raise exception 'Existing player reads lost';end if;end $$;
reset role;
-- Later goal correction invalidates the old shootout result without rewriting it.
insert into public.match_events(match_id,event_type,half) values('30000000-0000-4000-8000-000000000001','skor_goal','second');
do $$begin if exists(select 1 from public.get_public_match_results() where match_id='30000000-0000-4000-8000-000000000001' and (on_penalties or penalty_skor is not null or skor_score<>4)) then raise exception 'Stale shootout result used after goal correction';end if;end $$;
rollback;
select 'Public final totals, confirmed winner, home/away and own-goal orientation, unpublished/live/future exclusions, private discipline, player/captain reads, existing goal aggregates and stale-result guards pass.';
