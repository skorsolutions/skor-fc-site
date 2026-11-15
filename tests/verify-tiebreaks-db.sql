-- Disposable CI fixture only. Never run on production.
\set ON_ERROR_STOP on
insert into public.matches(id,slug,kickoff,home_team,away_team) values
 ('10000000-0000-4000-8000-000000000001','fixture-overtime',now()-interval '1 day','SKOR FC','Fixture FC'),
 ('10000000-0000-4000-8000-000000000002','fixture-normal-overtime',now()-interval '1 day','SKOR FC','Fixture FC');
create trigger fixture_stamp before insert on public.match_events for each row execute function public.stamp_match_event_clock();
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000001","email":"captain@fixture.invalid"}',false);
set role authenticated;
select public.control_match_clock('10000000-0000-4000-8000-000000000001','start_first_half',45::smallint,15::smallint);
select public.control_match_clock('10000000-0000-4000-8000-000000000001','halftime');
select public.control_match_clock('10000000-0000-4000-8000-000000000001','start_second_half');
select public.control_match_clock('10000000-0000-4000-8000-000000000001','end_regulation');
select public.control_match_clock('10000000-0000-4000-8000-000000000001','start_extra_first_half');
reset role;
do $$begin
  if not exists(select 1 from public.game_day_sessions where match_id='10000000-0000-4000-8000-000000000001' and clock_phase='extra_first_half' and clock_running and clock_elapsed_seconds=5400) then raise exception 'Overtime did not start at regulation anchor';end if;
end $$;
insert into public.match_events(match_id,event_type,half,player_name,roster_player_key) values('10000000-0000-4000-8000-000000000001','skor_goal','first','Fixture Player','fixture-player');
do $$begin
  if not exists(select 1 from public.match_events where half='extra_first' and clock_period='extra_first_half' and clock_elapsed_seconds>=5400) then raise exception 'Overtime goal did not receive its period/time';end if;
end $$;
set role authenticated;
do $$begin
  begin perform public.control_match_clock('10000000-0000-4000-8000-000000000001','extra_halftime');raise exception 'Expected golden-goal guard';
  exception when others then if sqlerrm='Expected golden-goal guard' then raise;end if;end;
end $$;
select public.control_match_clock('10000000-0000-4000-8000-000000000001','full_time');
select public.save_match_tiebreak('10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',0,
 '{"extra_minutes":7,"golden_goal":false,"initial_kicks":1,"first_team":"skor","shots":[],"completed":false}');
select public.control_match_clock('10000000-0000-4000-8000-000000000002','start_first_half');
select public.control_match_clock('10000000-0000-4000-8000-000000000002','halftime');
select public.control_match_clock('10000000-0000-4000-8000-000000000002','start_second_half');
select public.control_match_clock('10000000-0000-4000-8000-000000000002','end_regulation');
select public.control_match_clock('10000000-0000-4000-8000-000000000002','start_extra_first_half');
reset role;
insert into public.match_events(match_id,event_type,half,player_name,roster_player_key) values('10000000-0000-4000-8000-000000000002','skor_goal','first','Fixture Player','fixture-player');
set role authenticated;
select public.control_match_clock('10000000-0000-4000-8000-000000000002','extra_halftime');
select public.control_match_clock('10000000-0000-4000-8000-000000000002','start_extra_second_half');
reset role;
do $$begin if not exists(select 1 from public.game_day_sessions where match_id='10000000-0000-4000-8000-000000000002' and clock_elapsed_seconds=5820 and clock_phase='extra_second_half') then raise exception 'Configured seven-minute halves failed';end if;end $$;
insert into public.match_events(match_id,event_type,half) values('10000000-0000-4000-8000-000000000002','opponent_goal','first');
set role authenticated;
select public.control_match_clock('10000000-0000-4000-8000-000000000002','start_shootout');
-- Exact retries are safe even after the revision changes.
select public.save_match_tiebreak('10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',0,
 '{"extra_minutes":7,"golden_goal":false,"initial_kicks":1,"first_team":"skor","shots":[],"completed":false}');
select public.save_match_tiebreak('10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002',1,
 '{"extra_minutes":7,"golden_goal":false,"initial_kicks":1,"first_team":"skor","shots":[{"id":"1","team":"skor","outcome":"scored"},{"id":"2","team":"opponent","outcome":"missed"}],"completed":true}');
do $$begin
  begin perform public.save_match_tiebreak('10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000003',0,'{}');raise exception 'Expected stale revision';
  exception when serialization_failure then null;end;
end $$;
reset role;
do $$begin
  if (select count(*) from public.match_events)<>3 then raise exception 'Penalty kicks leaked into match/player goal events';end if;
  if (select revision from skor_private.match_tiebreaks where match_id='10000000-0000-4000-8000-000000000002')<>2 then raise exception 'Retry changed revision';end if;
  if (select status from public.matches where id='10000000-0000-4000-8000-000000000002')<>'final' then raise exception 'Completed shootout did not finalize match';end if;
end $$;
select set_config('request.jwt.claims','{}',false);
set role anon;
do $$begin
  begin perform public.get_match_tiebreak('10000000-0000-4000-8000-000000000001');raise exception 'Anonymous read allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"20000000-0000-4000-8000-000000000003","email":"player@fixture.invalid"}',false);
set role authenticated;
do $$begin
  begin perform public.get_match_tiebreak('10000000-0000-4000-8000-000000000001');raise exception 'Player read allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'Overtime live stamping, golden-goal guard, settings, shootout finalization, exact receipts, conflicts, no goal inflation and role denials passed.';
