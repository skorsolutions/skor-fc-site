-- v58.19 proposed migration. Do not apply without explicit user approval.
-- Equipment reads retain their existing per-user receipts. Feedback gains
-- per-captain versioned receipts; no historical feedback/request is rewritten.
create table skor_private.captain_feedback_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('comment','reaction')),
  source_id text not null,
  revision timestamptz not null,
  read_at timestamptz not null default now(),
  primary key (user_id,kind,source_id)
);
alter table skor_private.captain_feedback_reads enable row level security;
revoke all on skor_private.captain_feedback_reads from public,anon,authenticated;

create function skor_private.captain_notification_items()
returns table (
  kind text,id text,revision timestamptz,title text,body text,
  audience text,match_id uuid,opponent text,kickoff timestamptz,
  loan_id uuid,report_id uuid,is_read boolean
)
language sql stable security invoker set search_path=''
as $function$
  with feedback as (
    select 'comment'::text as kind,c.id::text as id,
      coalesce(c.updated_at,c.created_at) as revision,
      concat('#',r.jersey_number,' ',coalesce(nullif(trim(r.preferred_name),''),split_part(trim(r.full_name),' ',1))) as title,
      c.comment as body,c.visibility as audience,c.match_id
    from public.player_match_comments c
    join public.team_roster r on r.id=c.player_id
    union all
    select 'reaction',concat(rx.match_id,':',rx.player_id),
      coalesce(rx.updated_at,rx.created_at),
      concat('#',r.jersey_number,' ',coalesce(nullif(trim(r.preferred_name),''),split_part(trim(r.full_name),' ',1))),
      concat('Personal: ',coalesce(rx.self_reaction,'Not answered'),' · Team: ',coalesce(rx.team_reaction,'Not answered')),
      'team',rx.match_id
    from public.player_match_reactions rx
    join public.team_roster r on r.id=rx.player_id
    where rx.self_reaction is not null or rx.team_reaction is not null
  )
  select 'equipment'::text,n.id::text,n.created_at,'Equipment update'::text,n.body,n.audience,
    null::uuid,null::text,null::timestamptz,n.loan_id,n.report_id,
    exists(select 1 from skor_equipment.notification_reads er
      where er.notification_id=n.id and er.user_id=auth.uid())
  from skor_equipment.notifications n
  where n.audience in ('team','captains') or (n.audience='user' and n.recipient_user=auth.uid())
  union all
  select f.kind,f.id,f.revision,f.title,f.body,f.audience,f.match_id,
    case when m.home_team='SKOR FC' then m.away_team else m.home_team end,m.kickoff,
    null::uuid,null::uuid,
    exists(select 1 from skor_private.captain_feedback_reads fr
      where fr.user_id=auth.uid() and fr.kind=f.kind and fr.source_id=f.id and fr.revision>=f.revision)
  from feedback f join public.matches m on m.id=f.match_id;
$function$;
revoke all on function skor_private.captain_notification_items() from public,anon,authenticated;

create function public.get_captain_notifications(
  p_limit integer default 10,p_offset integer default 0,p_filter text default 'unread'
) returns jsonb
language plpgsql stable security definer set search_path=''
as $function$
declare v_result jsonb;
begin
  if auth.uid() is null or not coalesce(public.is_skor_captain(),false) then
    raise exception 'Captain access required.' using errcode='42501';
  end if;
  if p_filter is null or p_filter not in ('unread','all') then
    raise exception 'Unknown notification filter.' using errcode='22023';
  end if;
  with items as materialized (select * from skor_private.captain_notification_items()),
  page as (
    select * from items where p_filter='all' or not is_read
    order by is_read,revision desc,kind,id
    limit greatest(1,least(coalesce(p_limit,10),50))
    offset greatest(0,coalesce(p_offset,0))
  )
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(to_jsonb(p) order by p.is_read,p.revision desc,p.kind,p.id) from page p),'[]'::jsonb),
    'unread_equipment',(select count(*) from items where kind='equipment' and not is_read),
    'unread_feedback',(select count(*) from items where kind in ('comment','reaction') and not is_read),
    'total',(select count(*) from items where p_filter='all' or not is_read),
    'as_of',now()
  ) into v_result;
  return v_result;
end;
$function$;
revoke all on function public.get_captain_notifications(integer,integer,text) from public,anon,authenticated;
grant execute on function public.get_captain_notifications(integer,integer,text) to authenticated;

create function public.mark_captain_notification_read(p_kind text,p_id text,p_revision timestamptz)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_item record;
begin
  if auth.uid() is null or not coalesce(public.is_skor_captain(),false) then
    raise exception 'Captain access required.' using errcode='42501';
  end if;
  select * into v_item from skor_private.captain_notification_items() n
    where n.kind=p_kind and n.id=p_id;
  if not found then raise exception 'Notification unavailable.' using errcode='42501'; end if;
  if p_revision is distinct from v_item.revision then
    raise exception 'This feedback changed. Refresh and review the latest version.' using errcode='22023';
  end if;
  if p_kind='equipment' then
    insert into skor_equipment.notification_reads(notification_id,user_id)
      values (v_item.id::uuid,auth.uid()) on conflict do nothing;
  else
    insert into skor_private.captain_feedback_reads as receipts(user_id,kind,source_id,revision)
      values (auth.uid(),v_item.kind,v_item.id,v_item.revision)
      on conflict (user_id,kind,source_id) do update
      set revision=greatest(receipts.revision,excluded.revision),read_at=now();
  end if;
  return jsonb_build_object('ok',true);
end;
$function$;
revoke all on function public.mark_captain_notification_read(text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.mark_captain_notification_read(text,text,timestamptz) to authenticated;
