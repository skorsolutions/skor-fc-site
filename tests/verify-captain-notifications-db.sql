-- Run only AFTER migration approval/application. Every write rolls back.
-- No real IDs, emails, messages or request details are returned.
begin;
do $test$
declare
  a record; b record; ordinary record;
  pa jsonb; pb jsonb; after_b jsonb; chosen jsonb; feedback jsonb; ignored jsonb;
begin
  select u.id,u.email into a from auth.users u join public.captain_allowlist c
    on lower(c.email)=lower(u.email) where c.active and c.role in ('captain','super_admin') order by u.id limit 1;
  select u.id,u.email into b from auth.users u join public.captain_allowlist c
    on lower(c.email)=lower(u.email) where c.active and c.role in ('captain','super_admin') and u.id<>a.id order by u.id limit 1;
  if a.id is null or b.id is null then raise exception 'Two captain accounts required for isolation verification.'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',b.id,'email',b.email,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  pb:=public.get_captain_notifications(50,0,'all');
  execute 'reset role';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a.id,'email',a.email,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  pa:=public.get_captain_notifications(50,0,'all');
  for chosen in select value from jsonb_array_elements(pa->'items') where value->>'kind' in ('equipment','comment','reaction') loop
    ignored:=public.mark_captain_notification_read(chosen->>'kind',chosen->>'id',(chosen->>'revision')::timestamptz);
    if ignored->>'ok'<>'true' then raise exception 'Read acknowledgment failed.'; end if;
  end loop;
  pa:=public.get_captain_notifications(50,0,'all');
  if exists(select 1 from jsonb_array_elements(pa->'items') x where not (x->>'is_read')::boolean) then
    raise exception 'First captain receipts were not saved.';
  end if;
  begin
    perform public.mark_captain_notification_read('comment','missing',now());
    raise exception 'Expected unknown source denial.';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from skor_private.captain_feedback_reads;
    raise exception 'Expected private-table denial.';
  exception when insufficient_privilege then null; end;
  begin
    perform * from skor_private.captain_notification_items();
    raise exception 'Expected private-helper denial.';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',b.id,'email',b.email,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  after_b:=public.get_captain_notifications(50,0,'all');
  if after_b->'items' is distinct from pb->'items' or after_b->'unread_feedback' is distinct from pb->'unread_feedback'
    or after_b->'unread_equipment' is distinct from pb->'unread_equipment' then
    raise exception 'One captain changed another captain inbox.';
  end if;
  execute 'reset role';
  select value into feedback from jsonb_array_elements(pa->'items') where value->>'kind'='comment' limit 1;
  if feedback is null then raise exception 'Existing comment required for revision verification.'; end if;
  update public.player_match_comments set updated_at=clock_timestamp()+interval '1 second' where id=(feedback->>'id')::uuid;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a.id,'email',a.email,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  pa:=public.get_captain_notifications(50,0,'all');
  if not exists(select 1 from jsonb_array_elements(pa->'items') x
    where x->>'id'=feedback->>'id' and x->>'kind'='comment' and not (x->>'is_read')::boolean) then
    raise exception 'Edited feedback did not become unread.';
  end if;
  begin
    perform public.mark_captain_notification_read('comment',feedback->>'id',(feedback->>'revision')::timestamptz);
    raise exception 'Expected stale-version denial.';
  exception when invalid_parameter_value then null; end;
  execute 'reset role';
  select u.id,u.email into ordinary from auth.users u join public.player_access p on p.auth_user_id=u.id
    where p.active and not exists(select 1 from public.captain_allowlist c where lower(c.email)=lower(u.email) and c.active and c.role in ('captain','super_admin')) limit 1;
  if ordinary.id is null then raise exception 'Ordinary player required for access verification.'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',ordinary.id,'email',ordinary.email,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  begin
    perform public.get_captain_notifications();raise exception 'Expected player denial.';
  exception when insufficient_privilege then null; end;
  begin
    perform public.mark_captain_notification_read('comment',feedback->>'id',(feedback->>'revision')::timestamptz);raise exception 'Expected player-write denial.';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claims','{}',true);
  execute 'set local role anon';
  begin
    perform public.get_captain_notifications();raise exception 'Expected anonymous denial.';
  exception when insufficient_privilege then null; end;
  begin
    perform public.mark_captain_notification_read('comment',feedback->>'id',(feedback->>'revision')::timestamptz);raise exception 'Expected anonymous-write denial.';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
end;
$test$;
rollback;
