-- Pending explicit migration approval. USD integer cents; external payment records only.
create table skor_private.dues_settings (
  singleton boolean primary key default true check(singleton),
  instructions text not null default '' check(length(instructions)<=4000)
);
insert into skor_private.dues_settings default values;
create table skor_private.dues_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(name) between 1 and 100),
  tag text not null check(length(tag) between 1 and 60),
  kind text not null check(kind in ('season','event')),
  description text not null default '' check(length(description)<=2000),
  due_on date,
  instructions text check(length(instructions)<=4000),
  is_current boolean not null default false,
  opening_paid boolean not null default false,
  revision integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index dues_groups_tag on skor_private.dues_groups(lower(tag));
create unique index dues_current_season on skor_private.dues_groups(is_current) where is_current;
create table skor_private.dues_members (
  group_id uuid not null references skor_private.dues_groups(id),
  player_id uuid not null references public.team_roster(id),
  active boolean not null default true,
  opening_paid boolean not null default false,
  primary key(group_id,player_id)
);
create index dues_members_player on skor_private.dues_members(player_id,group_id);
create table skor_private.dues_matches (
  group_id uuid not null references skor_private.dues_groups(id),
  match_id uuid not null references public.matches(id),
  primary key(group_id,match_id)
);
create index dues_matches_match on skor_private.dues_matches(match_id);
create table skor_private.dues_scenarios (
  id uuid primary key,
  group_id uuid not null references skor_private.dues_groups(id),
  name text not null check(length(name) between 1 and 100),
  base_revision integer not null,
  plan jsonb not null,
  preview jsonb not null,
  applied_revision integer,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
create index dues_scenarios_group on skor_private.dues_scenarios(group_id,created_at);
create table skor_private.dues_assessments (
  scenario_id uuid not null references skor_private.dues_scenarios(id),
  group_id uuid not null,
  player_id uuid not null,
  delta_cents bigint not null,
  primary key(scenario_id,player_id),
  foreign key(group_id,player_id) references skor_private.dues_members(group_id,player_id)
);
create index dues_assessments_member on skor_private.dues_assessments(group_id,player_id);
create table skor_private.dues_payments (
  id uuid primary key,
  group_id uuid not null,
  player_id uuid not null,
  amount_cents bigint not null check(amount_cents between 1 and 100000000),
  kind text not null check(kind in ('receipt','refund')),
  method text not null check(method in ('Venmo','Zelle','Cash App','Cash','Check')),
  received_on date not null,
  reference text not null default '' check(length(reference)<=200),
  note text not null default '' check(length(note)<=1000),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  foreign key(group_id,player_id) references skor_private.dues_members(group_id,player_id)
);
create index dues_payments_member on skor_private.dues_payments(group_id,player_id);
create table skor_private.dues_voids (
  payment_id uuid primary key references skor_private.dues_payments(id),
  reason text not null check(length(reason) between 1 and 1000),
  created_by uuid not null,
  created_at timestamptz not null default now()
);
create table skor_private.dues_strategy_shares (
  group_id uuid not null,
  match_id uuid not null,
  strategy_id uuid not null references public.match_strategies(id),
  source_revision timestamptz not null,
  animation jsonb not null,
  created_by uuid not null,
  primary key(group_id,strategy_id),
  foreign key(group_id,match_id) references skor_private.dues_matches(group_id,match_id) on delete cascade
);
create index dues_strategy_source on skor_private.dues_strategy_shares(strategy_id);
create table skor_private.dues_audit (
  id bigint generated always as identity primary key,
  actor uuid not null,
  action text not null,
  group_id uuid references skor_private.dues_groups(id),
  detail jsonb not null,
  created_at timestamptz not null default now()
);
create index dues_audit_group on skor_private.dues_audit(group_id,created_at);

-- Deterministic largest-remainder allocation. Plan uses integers only, 0..100% discounts.
create function skor_private.dues_allocate(p_plan jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare costs jsonb:=p_plan->'costs'; players jsonb:=p_plan->'players';
  total bigint; contribution bigint; target bigint; weights bigint; result jsonb;
begin
  if jsonb_typeof(costs) is distinct from 'array' or jsonb_array_length(costs) not between 1 and 30
    or jsonb_typeof(players) is distinct from 'array' or jsonb_array_length(players) not between 1 and 200
    then raise exception 'Choose 1–200 players and 1–30 cost lines.' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(costs) c where length(coalesce(c->>'label','')) not between 1 and 100
      or coalesce(c->>'cents','') !~ '^[0-9]{1,9}$' or (c->>'cents')::bigint>100000000)
    or coalesce(p_plan->>'contribution_cents','') !~ '^[0-9]{1,9}$'
    or exists(select 1 from jsonb_array_elements(players) p where coalesce(p->>'player_id','') !~ '^[0-9a-fA-F-]{36}$'
      or coalesce(p->>'discount','') !~ '^[0-9]{1,3}$' or (p->>'discount')::integer>100)
    then raise exception 'Use valid USD cents, roster IDs and whole discount percentages.' using errcode='22023'; end if;
  if (select count(distinct (p->>'player_id')::uuid) from jsonb_array_elements(players) p)<>jsonb_array_length(players)
    then raise exception 'A player may only appear once.' using errcode='22023'; end if;
  select sum((c->>'cents')::bigint) into total from jsonb_array_elements(costs) c;
  contribution:=(p_plan->>'contribution_cents')::bigint;
  if total>100000000 or contribution>total then raise exception 'Contribution must be within the budget (maximum $1,000,000).'; end if;
  target:=total-contribution;
  select sum(100-(p->>'discount')::integer) into weights from jsonb_array_elements(players) p;
  if weights=0 and target>0 then raise exception 'At least one player must have a share above zero.'; end if;
  with raw as (
    select (p->>'player_id')::uuid player_id,(p->>'discount')::integer discount,100-(p->>'discount')::integer weight
    from jsonb_array_elements(players) p
  ), shares as (
    select *,case when weights=0 then 0 else target*weight/weights end cents,
      case when weights=0 then 0 else target*weight%weights end remainder from raw
  ), ranked as (
    select *,row_number() over(order by remainder desc,player_id) rank,
      target-sum(cents) over() extras from shares
  ) select jsonb_agg(jsonb_build_object('player_id',player_id,'discount',discount,
      'cents',cents+case when rank<=extras then 1 else 0 end) order by player_id) into result from ranked;
  return jsonb_build_object('budget_cents',total,'contribution_cents',contribution,'assigned_cents',target,'players',result);
end $$;

-- One balance calculation for all surfaces. Opening settlements never fabricate receipts.
create function skor_private.dues_balances() returns table(
  group_id uuid,player_id uuid,active boolean,opening_paid boolean,assigned_cents bigint,
  paid_cents bigint,balance_cents bigint,status text
) language sql stable set search_path='' as $$
  with a as (select x.group_id,x.player_id,sum(x.delta_cents)::bigint cents from skor_private.dues_assessments x group by 1,2),
  p as (select x.group_id,x.player_id,sum(case x.kind when 'refund' then -x.amount_cents else x.amount_cents end)::bigint cents
    from skor_private.dues_payments x where not exists(select 1 from skor_private.dues_voids v where v.payment_id=x.id) group by 1,2),
  b as (select m.*,coalesce(a.cents,0) due,coalesce(p.cents,0) paid,
    exists(select 1 from skor_private.dues_assessments z where z.group_id=m.group_id and z.player_id=m.player_id) assessed
    from skor_private.dues_members m left join a using(group_id,player_id) left join p using(group_id,player_id))
  select group_id,player_id,active,opening_paid,case when opening_paid or not assessed then null else due end,
    paid,case when opening_paid or not assessed then null else due-paid end,
    case when opening_paid then 'Paid — confirmed by captain' when not assessed then 'Not assigned'
      when due-paid<0 then 'Credit' when due-paid=0 then 'Paid' when paid>0 then 'Partial' else 'Unpaid' end from b;
$$;

-- Narrow frame allowlist: no coaching points, notes, source snapshots, author/email or AI context.
create function skor_private.dues_animation(p_scenes jsonb) returns jsonb
language sql immutable set search_path='' as $$
select coalesce(jsonb_agg(jsonb_build_object('name',left(s->>'name',70),'subScenes',(
  select coalesce(jsonb_agg(jsonb_build_object('name',left(f->>'name',70),
    'home',(select coalesce(jsonb_agg((select jsonb_object_agg(key,value) from jsonb_each(h)
      where key in ('id','name','number','x','y','keeperNumber','keeperLabel'))),'[]') from jsonb_array_elements(coalesce(f->'home','[]')) h),
    'opponents',(select coalesce(jsonb_agg((select jsonb_object_agg(key,value) from jsonb_each(h)
      where key in ('id','label','x','y'))),'[]') from jsonb_array_elements(coalesce(f->'opponents','[]')) h),
    'ball',jsonb_build_object('x',f->'ball'->'x','y',f->'ball'->'y'),
    'drawings',(select coalesce(jsonb_agg((select jsonb_object_agg(key,value) from jsonb_each(d)
      where key in ('type','x','y','x1','y1','x2','y2','text'))),'[]') from jsonb_array_elements(coalesce(f->'drawings','[]')) d)
  ) order by fo),'[]') from jsonb_array_elements(case when jsonb_array_length(coalesce(s->'subScenes','[]'))>0 then s->'subScenes' else jsonb_build_array(s) end) with ordinality t(f,fo)
)) order by so),'[]') from jsonb_array_elements(p_scenes) with ordinality t(s,so);
$$;

create function public.preview_team_dues(p_plan jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_skor_captain() then raise exception 'Captain access required.' using errcode='42501'; end if;
  if exists(select 1 from jsonb_array_elements(p_plan->'players') p where not exists(select 1 from public.team_roster r where r.id=(p->>'player_id')::uuid)) then raise exception 'Roster player no longer exists.'; end if;
  return skor_private.dues_allocate(p_plan);
end $$;

create function public.get_captain_dues() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_skor_captain() then raise exception 'Captain access required.' using errcode='42501'; end if;
  return jsonb_build_object('as_of',now(),
    'instructions',(select instructions from skor_private.dues_settings),
    'roster',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',r.full_name,'number',r.jersey_number,'active',r.active,'player_key',r.player_key,
      'captain',exists(select 1 from public.player_access pa join public.captain_allowlist ca on lower(ca.email)=lower(pa.approved_email) and ca.active and ca.role in ('captain','super_admin') where pa.roster_player_id=r.id and pa.active)) order by r.sort_order,r.full_name),'[]') from public.team_roster r),
    'groups',(select coalesce(jsonb_agg(to_jsonb(g) order by g.is_current desc,g.created_at desc),'[]') from skor_private.dues_groups g),
    'members',(select coalesce(jsonb_agg(to_jsonb(b)),'[]') from skor_private.dues_balances() b),
    'scenarios',(select coalesce(jsonb_agg(to_jsonb(s) order by created_at desc),'[]') from skor_private.dues_scenarios s),
    'payments',(select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('void',to_jsonb(v)) order by p.received_on desc,p.created_at desc),'[]') from skor_private.dues_payments p left join skor_private.dues_voids v on v.payment_id=p.id),
    'matches',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',home_team||' vs '||away_team,'kickoff',kickoff,'published',published) order by kickoff desc),'[]') from public.matches),
    'group_matches',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from skor_private.dues_matches m),
    'strategies',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'match_id',s.match_id,'updated_at',s.updated_at,
      'final',coalesce(v.is_production,false))),'[]') from public.match_strategies s left join public.lineup_variations v on v.id=s.source_lineup_variation_id and v.event_key=s.match_id::text),
    'shares',(select coalesce(jsonb_agg(to_jsonb(s)-'animation'),'[]') from skor_private.dues_strategy_shares s),
    'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by id desc),'[]') from (select * from skor_private.dues_audit order by id desc limit 200) a));
end $$;

create function public.get_my_dues() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare pid uuid:=public.current_player_id(); result jsonb;
begin
  if auth.uid() is null or pid is null then raise exception 'Linked player access required.' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'tag',g.tag,'kind',g.kind,'description',g.description,
    'due_on',g.due_on,'is_current',g.is_current,'instructions',coalesce(g.instructions,t.instructions),
    'balance',to_jsonb(b)-'player_id'-'group_id',
    'payments',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'cents',p.amount_cents,'kind',p.kind,'method',p.method,'date',p.received_on,'voided',v.payment_id is not null) order by p.received_on desc),'[]') from skor_private.dues_payments p left join skor_private.dues_voids v on v.payment_id=p.id where p.group_id=g.id and p.player_id=pid),
    'matches',case when not b.active then '[]'::jsonb else (select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'label',m.home_team||' vs '||m.away_team,'kickoff',m.kickoff,
      'lineup',(select to_jsonb(l) from public.get_public_production_lineup(m.id) l),
      'strategies',(select coalesce(jsonb_agg(jsonb_build_object('id',s.strategy_id,'title',ms.title,'scenes',s.animation)),'[]')
        from skor_private.dues_strategy_shares s join public.match_strategies ms on ms.id=s.strategy_id and ms.updated_at=s.source_revision
        join public.lineup_variations lv on lv.id=ms.source_lineup_variation_id and lv.is_production and lv.event_key=m.id::text
        where s.group_id=g.id and s.match_id=m.id)) order by m.kickoff),'[]')
      from skor_private.dues_matches gm join public.matches m on m.id=gm.match_id and m.published where gm.group_id=g.id) end
  ) order by g.is_current desc,g.created_at desc),'[]') into result
  from skor_private.dues_balances() b join skor_private.dues_groups g on g.id=b.group_id cross join skor_private.dues_settings t where b.player_id=pid;
  return jsonb_build_object('as_of',now(),'groups',result,
    'roster',(select coalesce(jsonb_agg(jsonb_build_object('key',player_key,'name',coalesce(preferred_name,split_part(full_name,' ',1)),'number',jersey_number,'position',position)),'[]') from public.team_roster));
end $$;

create function public.manage_team_dues(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); gid uuid; g skor_private.dues_groups; sid uuid; sc skor_private.dues_scenarios;
  val jsonb; item jsonb; plan jsonb; preview jsonb; pid uuid; amount bigint; net bigint; existing skor_private.dues_payments;
  receipt skor_private.dues_payments; ids uuid[]; mid uuid; ms public.match_strategies; result jsonb:='{"ok":true}';
begin
  if actor is null or not public.is_skor_captain() then raise exception 'Captain access required.' using errcode='42501'; end if;
  -- One team ledger lock precedes all row locks, avoiding cross-season lock inversions.
  perform pg_advisory_xact_lock(682401);
  if octet_length(p_payload::text)>1000000 then raise exception 'Ledger request is too large.'; end if;
  if p_action='instructions' then
    update skor_private.dues_settings set instructions=p_payload->>'instructions';
    insert into skor_private.dues_audit(actor,action,detail) values(actor,p_action,'{}');
    return result;
  end if;
  gid:=(p_payload->>'group_id')::uuid;
  if p_action='initialize_fall_2026' then
    -- Called once with the reviewed private roster snapshot, never a dynamic paid default.
    if exists(select 1 from skor_private.dues_groups where opening_paid) then raise exception 'Opening paid snapshot already exists.'; end if;
    select array_agg(value::uuid order by value::uuid) into ids from jsonb_array_elements_text(p_payload->'players');
    if ids is null or ids is distinct from (select array_agg(r.id order by r.id) from public.team_roster r where r.active is true)
      then raise exception 'Roster changed since review. Review the opening paid snapshot again.'; end if;
    update skor_private.dues_groups set is_current=false,revision=revision+1 where is_current;
    insert into skor_private.dues_groups(id,name,tag,kind,is_current,opening_paid,created_by)
      values(gid,'Fall 2026','Fall 2026','season',true,true,actor);
    insert into skor_private.dues_members(group_id,player_id,opening_paid) select gid,u,true from unnest(ids) u;
    update skor_private.dues_settings set instructions=p_payload->>'instructions';
    insert into skor_private.dues_audit(actor,action,group_id,detail) values(actor,p_action,gid,
      jsonb_build_object('basis','Confirmed paid by captain; historical amounts and methods unknown','players',cardinality(ids)));
    return result;
  end if;
  if p_action='create_group' then
    select * into g from skor_private.dues_groups where id=gid;
    if found then
      if g.created_by=actor and g.name=trim(p_payload->>'name') and g.tag=trim(p_payload->>'tag') and g.kind=p_payload->>'kind' then return result; end if;
      raise exception 'This group ID already exists. Refresh before trying again.'; end if;
    if p_payload->>'kind'='season' and coalesce((p_payload->>'is_current')::boolean,false) then
      perform pg_advisory_xact_lock(682401);update skor_private.dues_groups set is_current=false,revision=revision+1 where is_current;
    end if;
    insert into skor_private.dues_groups(id,name,tag,kind,description,due_on,instructions,is_current,created_by)
      values(gid,trim(p_payload->>'name'),trim(p_payload->>'tag'),p_payload->>'kind',coalesce(p_payload->>'description',''),nullif(p_payload->>'due_on','')::date,
        nullif(p_payload->>'instructions',''),coalesce((p_payload->>'is_current')::boolean,false) and p_payload->>'kind'='season',actor);
  else
    select * into g from skor_private.dues_groups where id=gid for update;
    if not found then raise exception 'Fee group not found.'; end if;
    if p_action in ('save_group','finalize','share_strategy','unshare_strategy') and g.revision is distinct from (p_payload->>'revision')::integer
      then raise exception 'This group changed. Refresh and review it again.' using errcode='40001'; end if;
  end if;

  if p_action in ('create_group','save_group') then
    if p_action='save_group' then
      if coalesce((p_payload->>'is_current')::boolean,false) and g.kind='season' then
        perform pg_advisory_xact_lock(682401);update skor_private.dues_groups set is_current=false,revision=revision+1 where is_current and id<>gid;
      end if;
      update skor_private.dues_groups set name=trim(p_payload->>'name'),tag=trim(p_payload->>'tag'),description=coalesce(p_payload->>'description',''),
        due_on=nullif(p_payload->>'due_on','')::date,instructions=nullif(p_payload->>'instructions',''),
        is_current=coalesce((p_payload->>'is_current')::boolean,false) and kind='season',revision=revision+1 where id=gid;
    end if;
    if jsonb_typeof(p_payload->'players') is distinct from 'array' then raise exception 'Select participants.'; end if;
    select coalesce(array_agg(value::uuid),'{}') into ids from jsonb_array_elements_text(p_payload->'players');
    if cardinality(ids)<>(select count(distinct u) from unnest(ids) u) then raise exception 'Choose each participant once.'; end if;
    if cardinality(ids)>200 then raise exception 'Too many participants.'; end if;
    if exists(select 1 from unnest(ids) u where not exists(select 1 from public.team_roster r where r.id=u)) then raise exception 'Unknown roster player.'; end if;
    -- Removal changes event access only; assessments and receipts remain. The review explicitly retains credit/history.
    if exists(select 1 from skor_private.dues_members where group_id=gid and active and not(player_id=any(ids)))
      and coalesce(p_payload->>'removal_action','')<>'retain_history' then raise exception 'Confirm removed players retain balances and payment history.'; end if;
    update skor_private.dues_members set active=player_id=any(ids) where group_id=gid;
    insert into skor_private.dues_members(group_id,player_id) select gid,u from unnest(ids) u on conflict(group_id,player_id) do update set active=true;
    delete from skor_private.dues_matches where group_id=gid and not(match_id in(select value::uuid from jsonb_array_elements_text(coalesce(p_payload->'matches','[]'))));
    insert into skor_private.dues_matches(group_id,match_id) select gid,value::uuid from jsonb_array_elements_text(coalesce(p_payload->'matches','[]')) on conflict do nothing;
  elsif p_action='save_scenario' then
    if g.opening_paid then raise exception 'Fall 2026 is a confirmed-paid opening record. Create another season or event to run numbers.'; end if;
    sid:=(p_payload->>'id')::uuid;plan:=p_payload->'plan';preview:=public.preview_team_dues(plan);
    if g.revision is distinct from (p_payload->>'revision')::integer then raise exception 'Refresh the changed group before saving a scenario.' using errcode='40001'; end if;
    if exists(select 1 from skor_private.dues_scenarios where id=sid) then
      select * into sc from skor_private.dues_scenarios where id=sid;
      if sc.group_id=gid and sc.plan=plan and sc.name=p_payload->>'name' then return result; end if;
      raise exception 'Scenario retry does not match the original.';
    end if;
    insert into skor_private.dues_scenarios(id,group_id,name,base_revision,plan,preview,created_by)
      values(sid,gid,trim(p_payload->>'name'),g.revision,plan,preview,actor);
    result:=result||jsonb_build_object('scenario_id',sid,'preview',preview);
  elsif p_action='finalize' then
    if g.opening_paid then raise exception 'Opening paid records cannot be reassessed.'; end if;
    sid:=(p_payload->>'id')::uuid;select * into sc from skor_private.dues_scenarios where id=sid and group_id=gid;
    if not found then raise exception 'Scenario not found.'; end if;
    if sc.applied_revision is not null then raise exception 'This scenario has already been assigned.'; end if;
    if sc.base_revision<>g.revision then raise exception 'Scenario is stale. Run numbers again and save a fresh scenario.' using errcode='40001'; end if;
    preview:=public.preview_team_dues(sc.plan);
    if preview<>sc.preview then raise exception 'Allocation changed. Save and review a fresh scenario.'; end if;
    if exists(select 1 from skor_private.dues_balances() b where b.group_id=gid and b.assigned_cents is not null
        and not exists(select 1 from jsonb_array_elements(preview->'players') x where (x->>'player_id')::uuid=b.player_id))
      and coalesce(p_payload->>'excluded_action','')<>'retain_credit' then raise exception 'Confirm excluded players have zero dues and retain receipts as credit.'; end if;
    update skor_private.dues_members set active=false where group_id=gid;
    for item in select * from jsonb_array_elements(preview->'players') loop
      pid:=(item->>'player_id')::uuid;
      insert into skor_private.dues_members(group_id,player_id) values(gid,pid) on conflict(group_id,player_id) do update set active=true;
    end loop;
    insert into skor_private.dues_assessments(scenario_id,group_id,player_id,delta_cents)
      select sid,gid,b.player_id,coalesce((x->>'cents')::bigint,0)-coalesce(b.assigned_cents,0)
      from skor_private.dues_balances() b left join jsonb_array_elements(preview->'players') x on (x->>'player_id')::uuid=b.player_id where b.group_id=gid;
    update skor_private.dues_groups set revision=revision+1 where id=gid;
    update skor_private.dues_scenarios set applied_revision=g.revision+1 where id=sid;
    result:=result||jsonb_build_object('revision',g.revision+1);
  elsif p_action='payment' then
    if g.opening_paid then raise exception 'Do not invent receipts for the confirmed-paid opening season.'; end if;
    pid:=(p_payload->>'player_id')::uuid;amount:=(p_payload->>'amount_cents')::bigint;
    select * into existing from skor_private.dues_payments where id=(p_payload->>'id')::uuid;
    if found then
      if existing.group_id=gid and existing.player_id=pid and existing.amount_cents=amount and existing.kind=p_payload->>'kind'
        and existing.method=p_payload->>'method' and existing.received_on=(p_payload->>'received_on')::date
        and existing.reference=coalesce(p_payload->>'reference','') and existing.note=coalesce(p_payload->>'note','') then return result; end if;
      raise exception 'Payment retry differs from the original. Refresh first.';
    end if;
    select paid_cents into net from skor_private.dues_balances() where group_id=gid and player_id=pid and assigned_cents is not null;
    if not found then raise exception 'Assign dues before recording a receipt.'; end if;
    if p_payload->>'kind'='refund' and amount>net then raise exception 'Refund cannot exceed recorded net receipts.'; end if;
    if (p_payload->>'received_on')::date>current_date then raise exception 'Payment date cannot be in the future.'; end if;
    insert into skor_private.dues_payments(id,group_id,player_id,amount_cents,kind,method,received_on,reference,note,created_by)
      values((p_payload->>'id')::uuid,gid,pid,amount,p_payload->>'kind',p_payload->>'method',(p_payload->>'received_on')::date,coalesce(p_payload->>'reference',''),coalesce(p_payload->>'note',''),actor);
  elsif p_action='void' then
    select * into receipt from skor_private.dues_payments where id=(p_payload->>'id')::uuid and group_id=gid;
    if not found then raise exception 'Payment not found.'; end if;
    if exists(select 1 from skor_private.dues_voids where payment_id=receipt.id) then return result; end if;
    select paid_cents into net from skor_private.dues_balances() where group_id=gid and player_id=receipt.player_id;
    if receipt.kind='receipt' and net-receipt.amount_cents<0 then raise exception 'Void related refunds first; net receipts cannot be negative.'; end if;
    insert into skor_private.dues_voids(payment_id,reason,created_by) values(receipt.id,trim(p_payload->>'reason'),actor);
  elsif p_action='share_strategy' then
    select * into ms from public.match_strategies where id=(p_payload->>'id')::uuid;
    if not found or ms.updated_at is distinct from (p_payload->>'source_revision')::timestamptz then raise exception 'Strategy changed. Refresh and review it again.'; end if;
    if not exists(select 1 from skor_private.dues_matches gm join public.matches m on m.id=gm.match_id and m.published
      join public.lineup_variations lv on lv.id=ms.source_lineup_variation_id and lv.event_key=m.id::text and lv.is_production
      where gm.group_id=gid and gm.match_id=ms.match_id) then raise exception 'Choose a strategy based on a Final / Production lineup for a linked published match.'; end if;
    insert into skor_private.dues_strategy_shares(group_id,match_id,strategy_id,source_revision,animation,created_by)
      values(gid,ms.match_id,ms.id,ms.updated_at,skor_private.dues_animation(ms.scenes),actor)
      on conflict(group_id,strategy_id) do update set source_revision=excluded.source_revision,animation=excluded.animation,created_by=actor;
    update skor_private.dues_groups set revision=revision+1 where id=gid;
  elsif p_action='unshare_strategy' then
    delete from skor_private.dues_strategy_shares where group_id=gid and strategy_id=(p_payload->>'id')::uuid;
    update skor_private.dues_groups set revision=revision+1 where id=gid;
  else raise exception 'Unknown ledger action.' using errcode='22023';
  end if;
  insert into skor_private.dues_audit(actor,action,group_id,detail) values(actor,p_action,gid,
    case when p_action in ('payment','void') then jsonb_build_object('id',p_payload->>'id')
      when p_action in ('save_scenario','finalize') then jsonb_build_object('scenario_id',sid)
      else jsonb_build_object('revision',(select revision from skor_private.dues_groups where id=gid)) end);
  return result;
end $$;

-- Fall 2026 and private instructions are initialized separately through the one-time guarded action.
-- No roster identities or payment contact information belong in this public migration.

do $$ declare t text; begin
  foreach t in array array['dues_settings','dues_groups','dues_members','dues_matches','dues_scenarios','dues_assessments','dues_payments','dues_voids','dues_strategy_shares','dues_audit'] loop
    execute format('alter table skor_private.%I enable row level security',t);
    execute format('revoke all on table skor_private.%I from public, anon, authenticated',t);
  end loop;
end $$;
revoke all on sequence skor_private.dues_audit_id_seq from public,anon,authenticated;
revoke all on function skor_private.dues_allocate(jsonb),skor_private.dues_balances(),skor_private.dues_animation(jsonb) from public,anon,authenticated;
revoke all on function public.get_captain_dues(),public.get_my_dues(),public.preview_team_dues(jsonb),public.manage_team_dues(text,jsonb) from public,anon,authenticated;
grant execute on function public.get_captain_dues(),public.get_my_dues(),public.preview_team_dues(jsonb),public.manage_team_dues(text,jsonb) to authenticated;
