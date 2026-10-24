-- Read-only fixture executes the exact proposed item-source query.
with fixture_actor(user_id) as (values ('00000000-0000-0000-0000-000000000001'::uuid)),
fixture_roster(id,jersey_number,preferred_name,full_name) as (
 values ('00000000-0000-0000-0000-000000000010'::uuid,18,'Example','Example Player')
), fixture_matches(id,home_team,away_team,kickoff,published) as (
 values ('00000000-0000-0000-0000-000000000020'::uuid,'SKOR FC','Old Opponent','2024-01-01'::timestamptz,false)
), fixture_comments(id,player_id,match_id,comment,visibility,created_at,updated_at) as (
 values ('00000000-0000-0000-0000-000000000030'::uuid,'00000000-0000-0000-0000-000000000010'::uuid,'00000000-0000-0000-0000-000000000020'::uuid,'Historical feedback','captains','2024-01-01'::timestamptz,'2024-01-02'::timestamptz),
 ('00000000-0000-0000-0000-000000000031'::uuid,'00000000-0000-0000-0000-000000000010'::uuid,'00000000-0000-0000-0000-000000000020'::uuid,'Edited feedback','team','2024-01-01'::timestamptz,'2026-10-24'::timestamptz)
), fixture_reactions(player_id,match_id,self_reaction,team_reaction,created_at,updated_at) as (
 values ('00000000-0000-0000-0000-000000000010'::uuid,'00000000-0000-0000-0000-000000000020'::uuid,'great','good','2024-01-01'::timestamptz,'2024-01-02'::timestamptz)
), fixture_equipment(id,created_at,body,audience,recipient_user,loan_id,report_id) as (
 values ('00000000-0000-0000-0000-000000000040'::uuid,'2026-10-24'::timestamptz,'Captain request','captains',null::uuid,null::uuid,null::uuid),
 ('00000000-0000-0000-0000-000000000041'::uuid,'2026-10-24'::timestamptz,'Private for another person','user','00000000-0000-0000-0000-000000000002'::uuid,null::uuid,null::uuid),
 ('00000000-0000-0000-0000-000000000042'::uuid,'2026-10-24'::timestamptz,'Private for me','user','00000000-0000-0000-0000-000000000001'::uuid,null::uuid,null::uuid),
 ('00000000-0000-0000-0000-000000000043'::uuid,'2026-10-24'::timestamptz,'Team announcement','team',null::uuid,null::uuid,null::uuid)
), fixture_equipment_reads(notification_id,user_id) as (
 values ('00000000-0000-0000-0000-000000000040'::uuid,'00000000-0000-0000-0000-000000000001'::uuid)
), fixture_feedback_reads(user_id,kind,source_id,revision) as (
 values ('00000000-0000-0000-0000-000000000001'::uuid,'comment','00000000-0000-0000-0000-000000000030','2024-01-02'::timestamptz),
 ('00000000-0000-0000-0000-000000000001'::uuid,'comment','00000000-0000-0000-0000-000000000031','2024-01-01'::timestamptz),
 ('00000000-0000-0000-0000-000000000001'::uuid,'reaction','00000000-0000-0000-0000-000000000020:00000000-0000-0000-0000-000000000010','2024-01-02'::timestamptz)
), actual(kind,id,revision,title,body,audience,match_id,opponent,kickoff,loan_id,report_id,is_read) as (
/* ITEMS_QUERY */
)
select count(*)=6 as six_visible,
 count(*) filter(where kind='equipment' and not is_read)=2 as equipment_two_unread,
 count(*) filter(where kind<>'equipment' and not is_read)=1 as edited_comment_unread,
 count(*) filter(where kind<>'equipment' and is_read)=2 as other_feedback_read,
 not exists(select 1 from actual where body='Private for another person') as private_recipient_hidden,
 exists(select 1 from actual where opponent='Old Opponent' and kickoff='2024-01-01'::timestamptz) as historical_unpublished_included
from actual;
