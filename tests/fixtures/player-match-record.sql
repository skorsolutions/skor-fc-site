-- Read-only test fixtures. These CTEs never touch application rows.
with fixture_roster(id,player_key,created_at) as (
  values ('00000000-0000-0000-0000-000000000001'::uuid,'player-a',now()-interval '30 days'),
         ('00000000-0000-0000-0000-000000000002'::uuid,'player-b',now()-interval '3 days')
), fixture_matches as (
  select ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid as id,
    case when n in (6,7) then now()+interval '7 days' when n=10 then now()-interval '60 days' else now()-n*interval '2 days' end as kickoff,
    'SKOR FC'::text as home_team,'Fixture Opponent'::text as away_team,'Field'::text as location,
    case when n in (5,6) then 'scheduled' when n=8 then 'cancelled' else 'final' end as status,
    n<>9 as published,case when n=1 then 'player-a' else null end::text as man_of_match_player_key,
    now() as updated_at
  from generate_series(1,10) n
), fixture_attendance(player_id,match_id,status,updated_at) as (
  select '00000000-0000-0000-0000-000000000001'::uuid,
    ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
    case when n=2 or n=5 then 'absent' when n=3 then 'excused' else 'present' end::text,now()
  from unnest(array[1,2,3,5,6,7,10]) n
), event_data(n,event_type,roster_player_key,assist_roster_player_key,player_number) as (
  values (1,'skor_goal','player-a','player-b','30'),
    (1,'skor_goal','player-b','player-a','12'),
    (1,'skor_goal',null,null,'12'), -- A matching jersey without identity must not credit a player.
    (1,'skor_yellow_card','player-a',null,'30'),
    (1,'opponent_goal',null,null,'9'),
    (5,'skor_goal','player-a',null,'30'),
    (6,'skor_goal','player-a',null,'30'),
    (8,'skor_red_card','player-a',null,'30'),
    (9,'skor_goal','player-a',null,'30')
), fixture_events as (
  select ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid as match_id,
    event_type,roster_player_key,assist_roster_player_key,player_number,now() as updated_at from event_data
), records_a(match_id,kickoff,home_team,away_team,location,status,attendance_status,skor_score,opponent_score,my_goals,my_assists,my_yellow_cards,my_red_cards,my_motm,record_updated_at) as (
  /* PLAYER_A_QUERY */
), records_b(match_id,kickoff,home_team,away_team,location,status,attendance_status,skor_score,opponent_score,my_goals,my_assists,my_yellow_cards,my_red_cards,my_motm,record_updated_at) as (
  /* PLAYER_B_QUERY */
), completed_attendance as (
  /* ATTENDANCE_QUERY */
)
select jsonb_build_object('player_a',(select jsonb_build_object(
  'matches',count(*),'present',count(*) filter(where attendance_status='present'),
  'absent',count(*) filter(where attendance_status='absent'),'excused',count(*) filter(where attendance_status='excused'),
  'unmarked',count(*) filter(where attendance_status='unmarked'),'goals',sum(my_goals),'assists',sum(my_assists),
  'yellow',sum(my_yellow_cards),'red',sum(my_red_cards),'motm',count(*) filter(where my_motm),
  'score',max(skor_score),'attendance_rate',round(100.0*count(*) filter(where attendance_status='present')/nullif(count(*) filter(where attendance_status in ('present','absent')),0),1)
  ) from records_a),'player_b',(select jsonb_build_object('matches',count(*),'goals',sum(my_goals),'assists',sum(my_assists),'unmarked',count(*) filter(where attendance_status='unmarked')) from records_b),
  'team_completed_marked',(select count(*) from completed_attendance),
  'only_completed',not exists(select 1 from records_a r join fixture_matches m on m.id=r.match_id where m.status<>'final' or m.kickoff>now() or not m.published)) as verification;
