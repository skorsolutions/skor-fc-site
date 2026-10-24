-- Run only after explicit migration approval, as an administrative verification transaction.
-- Uses actual role guards/RPCs; every fixture and receipt is rolled back. No real dues are edited.
begin;
do $test$
declare
  cap uuid; cap_email text; pid uuid; pemail text; pid2 uuid; pid3 uuid; roster_count integer;
  gid uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); sid2 uuid:=gen_random_uuid(); stale_id uuid:=gen_random_uuid(); receipt uuid:=gen_random_uuid(); refund_id uuid:=gen_random_uuid();
  plan jsonb; p jsonb; r jsonb; own jsonb; before_roster text; after_roster text; rejected boolean; due bigint;
begin
  select u.id,u.email into cap,cap_email from auth.users u join public.captain_allowlist c on lower(c.email)=lower(u.email)
    where c.active and c.role in ('captain','super_admin') order by u.id limit 1;
  select pa.roster_player_id,u.email into pid,pemail from public.player_access pa join auth.users u on u.id=pa.auth_user_id
    join public.team_roster tr on tr.id=pa.roster_player_id and tr.active and tr.portal_enabled
    where pa.active and not exists(select 1 from public.captain_allowlist c where lower(c.email)=lower(u.email) and c.active and c.role in ('captain','super_admin')) limit 1;
  select tr.id into pid2 from public.team_roster tr join public.player_access pa on pa.roster_player_id=tr.id and pa.active and pa.auth_user_id is not null where tr.active and tr.portal_enabled and tr.id<>pid order by tr.id limit 1;
  select id into pid3 from public.team_roster where active and id not in(pid,pid2) order by id limit 1;
  if cap is null or pid is null or pid2 is null or pid3 is null then raise exception 'Linked captain and three roster players required for verification.'; end if;
  select count(*),md5(string_agg(to_jsonb(tr)::text,'' order by id)) into roster_count,before_roster from public.team_roster tr where active;
  if (select count(*) from skor_private.dues_members m join skor_private.dues_groups g on g.id=m.group_id where g.opening_paid and m.opening_paid)<>roster_count then raise exception 'Opening snapshot differs from active roster; review new arrivals rather than automatically marking them paid.'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',cap,'email',cap_email,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  r:=public.get_captain_dues();
  if jsonb_array_length(r->'payments')<>0 then raise notice 'Existing receipts present; fixtures do not change them.'; end if;
  perform public.manage_team_dues('create_group',jsonb_build_object('group_id',gid,'name','Verification event','tag','verify-'||gid,'kind','event','players',jsonb_build_array(pid,pid2,pid3),'matches','[]'::jsonb));
  -- Draft membership grants no invented dues.
  r:=public.get_captain_dues();
  if exists(select 1 from jsonb_array_elements(r->'members') m where m->>'group_id'=gid::text and m->>'status'<>'Not assigned') then raise exception 'Draft group has dues.'; end if;
  plan:=jsonb_build_object('costs',jsonb_build_array(jsonb_build_object('label','League','cents',10001)),'contribution_cents',0,
    'players',jsonb_build_array(jsonb_build_object('player_id',pid,'discount',50),jsonb_build_object('player_id',pid2,'discount',0),jsonb_build_object('player_id',pid3,'discount',0)));
  p:=public.preview_team_dues(plan);
  if (select sum((x->>'cents')::bigint) from jsonb_array_elements(p->'players') x)<>10001 then raise exception 'Budget does not reconcile.'; end if;
  select (x->>'cents')::bigint into due from jsonb_array_elements(p->'players') x where x->>'player_id'=pid::text;
  if due<>2000 then raise exception 'Discounted amount mismatch: %',due; end if;
  perform public.manage_team_dues('save_scenario',jsonb_build_object('group_id',gid,'revision',0,'id',sid,'name','Initial','plan',plan));
  perform public.manage_team_dues('save_scenario',jsonb_build_object('group_id',gid,'revision',0,'id',sid,'name','Initial','plan',plan));
  r:=public.get_captain_dues();
  if exists(select 1 from jsonb_array_elements(r->'members') m where m->>'group_id'=gid::text and m->>'status'<>'Not assigned') then raise exception 'Saving a private scenario assigned dues.'; end if;
  perform public.manage_team_dues('save_scenario',jsonb_build_object('group_id',gid,'revision',0,'id',stale_id,'name','Stale draft','plan',plan));
  perform public.manage_team_dues('finalize',jsonb_build_object('group_id',gid,'revision',0,'id',sid));
  rejected:=false;begin perform public.manage_team_dues('finalize',jsonb_build_object('group_id',gid,'revision',1,'id',stale_id));exception when others then rejected:=true;end;
  if not rejected then raise exception 'A stale scenario was assigned.'; end if;
  rejected:=false;begin perform public.manage_team_dues('finalize',jsonb_build_object('group_id',gid,'revision',1,'id',sid));exception when others then rejected:=true;end;
  if not rejected then raise exception 'Applied scenario reapplied.'; end if;
  p:=jsonb_build_object('group_id',gid,'id',receipt,'player_id',pid,'amount_cents',700,'kind','receipt','method','Venmo','received_on',current_date,'reference','verification','note','private captain note');
  perform public.manage_team_dues('payment',p);perform public.manage_team_dues('payment',p);
  rejected:=false;begin perform public.manage_team_dues('payment',p||'{"amount_cents":701}');exception when others then rejected:=true;end;
  if not rejected then raise exception 'Changed retry was accepted.'; end if;
  perform public.manage_team_dues('payment',p||jsonb_build_object('id',gen_random_uuid(),'amount_cents',300,'method','Cash'));
  r:=public.get_captain_dues();
  if not exists(select 1 from jsonb_array_elements(r->'members') m where m->>'group_id'=gid::text and m->>'player_id'=pid::text and (m->>'paid_cents')::bigint=1000 and m->>'status'='Partial') then raise exception 'Mixed partial payments failed.'; end if;
  rejected:=false;begin perform public.manage_team_dues('payment',p||jsonb_build_object('id',gen_random_uuid(),'kind','refund','amount_cents',1001));exception when others then rejected:=true;end;
  if not rejected then raise exception 'Excess refund accepted.'; end if;
  perform public.manage_team_dues('payment',p||jsonb_build_object('id',refund_id,'kind','refund','amount_cents',800));
  rejected:=false;begin perform public.manage_team_dues('void',jsonb_build_object('group_id',gid,'id',receipt,'reason','Would make net negative'));exception when others then rejected:=true;end;
  if not rejected then raise exception 'Receipt void made net receipts negative.'; end if;
  perform public.manage_team_dues('void',jsonb_build_object('group_id',gid,'id',refund_id,'reason','Refund fixture correction'));
  perform public.manage_team_dues('void',jsonb_build_object('group_id',gid,'id',receipt,'reason','Verification correction'));
  perform public.manage_team_dues('payment',p||jsonb_build_object('id',gen_random_uuid(),'player_id',pid2,'amount_cents',411,'method','Zelle'));
  perform public.manage_team_dues('void',jsonb_build_object('group_id',gid,'id',receipt,'reason','Retry'));
  -- Explicit zero-charge adjustment retains the remaining $3 as credit.
  plan:=jsonb_set(plan,'{costs}',jsonb_build_array(jsonb_build_object('label','Covered by sponsor','cents',0)));
  perform public.manage_team_dues('save_scenario',jsonb_build_object('group_id',gid,'revision',1,'id',sid2,'name','Adjustment','plan',plan));
  perform public.manage_team_dues('finalize',jsonb_build_object('group_id',gid,'revision',1,'id',sid2,'excluded_action','retain_credit'));
  r:=public.get_captain_dues();
  if not exists(select 1 from jsonb_array_elements(r->'members') m where m->>'group_id'=gid::text and m->>'player_id'=pid::text and (m->>'balance_cents')::bigint=-300 and m->>'status'='Credit') then raise exception 'Adjustment lost payment credit.'; end if;
  -- Real player sees only their own rows; notes/references and account IDs stay captain-private.
  execute 'reset role';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',(select auth_user_id from public.player_access where roster_player_id=pid),'email',pemail,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  own:=public.get_my_dues();
  if own::text like '%private captain note%' or own::text like '%"created_by"%' or own::text like '%"player_id"%' then raise exception 'Player response exposes captain metadata or roster IDs.'; end if;
  if not exists(select 1 from jsonb_array_elements(own->'groups') x where x->>'id'=gid::text and (x->'balance'->>'balance_cents')::bigint=-300 and jsonb_array_length(x->'payments')=3) then raise exception 'Own balance or private receipt count does not agree.'; end if;
  if exists(select 1 from jsonb_array_elements(own->'groups') x cross join jsonb_array_elements(x->'payments') y where (y->>'cents')::bigint=411) then raise exception 'Another player payment leaked.'; end if;
  rejected:=false;begin perform public.get_captain_dues();exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception 'Player read captain ledger.'; end if;
  rejected:=false;begin perform public.manage_team_dues('payment',p);exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception 'Player wrote ledger.'; end if;
  rejected:=false;begin perform count(*) from skor_private.dues_payments;exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception 'Direct private-table access allowed.'; end if;
  rejected:=false;begin perform skor_private.dues_allocate(plan);exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception 'Private helper callable.'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',(select auth_user_id from public.player_access where roster_player_id=pid2),'role','authenticated')::text,true);
  execute 'set local role authenticated';own:=public.get_my_dues();
  if not exists(select 1 from jsonb_array_elements(own->'groups') x where x->>'id'=gid::text and (x->'balance'->>'balance_cents')::bigint=-411 and jsonb_array_length(x->'payments')=1) then raise exception 'Second player isolation failed.'; end if;
  execute 'reset role';perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);execute 'set local role authenticated';
  rejected:=false;begin perform public.get_my_dues();exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception 'Unlinked login read player dues.'; end if;
  rejected:=false;begin perform public.get_captain_dues();exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception 'Unlinked login read captain dues.'; end if;
  execute 'reset role';perform set_config('request.jwt.claims','{"role":"anon"}',true);execute 'set local role anon';
  rejected:=false;begin perform public.get_my_dues();exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception 'Anonymous ledger access allowed.'; end if;
  execute 'reset role';
  select md5(string_agg(to_jsonb(tr)::text,'' order by id)) into after_roster from public.team_roster tr where active;
  if before_roster<>after_roster then raise exception 'Roster was modified.'; end if;
  if (select count(*) from skor_private.dues_payments where group_id=gid)<>4 then raise exception 'Receipt retry duplicated a payment.'; end if;
  if not exists(select 1 from skor_private.dues_audit where group_id=gid and actor=cap and action='finalize') then raise exception 'Missing audit actor.'; end if;
  raise notice 'PASS: real captain/player/anonymous guards, draft isolation, allocation, assignment, mixed partial receipts, retries, void history, credit adjustments, private metadata and unchanged roster.';
end $test$;
rollback;
