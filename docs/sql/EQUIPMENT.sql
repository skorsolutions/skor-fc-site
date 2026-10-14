-- v58.5 explicitly approved and applied on 2026-10-14.
-- Supabase migration 20261014011026 add_equipment_and_lost_found.
-- Execution SHA-256: c068ec79bffe8e5c520adc2c788108054c4a7014efbda227357695ae9b1c5d11.
-- Only this audit header differs from the exact approved/executed script.
-- Existing inventory, player, announcement, match and jersey records are untouched.
begin;

create schema skor_equipment;
revoke all on schema skor_equipment from public, anon, authenticated;
grant usage on schema skor_equipment to authenticated;

create table skor_equipment.items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 100),
  category text not null check (category in ('ball_bag','ball','cone_set','cone','other')),
  description text not null default '' check (length(description)<=1000),
  quantity integer not null check (quantity between 1 and 500),
  missing integer not null default 0 check (missing between 0 and quantity),
  parent_id uuid references skor_equipment.items(id),
  holder_key text not null,
  holder_name text not null,
  photo_path text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_id is null or parent_id<>id),
  check (category not in ('ball_bag','cone_set') or quantity=1)
);
create index equipment_parent on skor_equipment.items(parent_id);

create table skor_equipment.loans (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references skor_equipment.items(id),
  quantity integer not null check (quantity between 1 and 500),
  borrower_user uuid not null references auth.users(id),
  borrower_key text not null,
  borrower_name text not null,
  due_date date not null,
  note text not null default '' check (length(note)<=500),
  status text not null default 'pending' check (status in ('pending','approved','borrowed','return_pending','returned','declined','cancelled')),
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  picked_up_at timestamptz,
  returned_at timestamptz,
  decided_by uuid references auth.users(id),
  return_condition text check (length(return_condition)<=500)
);
create index equipment_loans_borrower on skor_equipment.loans(borrower_user,requested_at desc);
create table skor_equipment.allocations (
  loan_id uuid not null references skor_equipment.loans(id),
  item_id uuid not null references skor_equipment.items(id),
  quantity integer not null check (quantity>0),
  primary key (loan_id,item_id)
);
create index equipment_allocation_item on skor_equipment.allocations(item_id,loan_id);

create table skor_equipment.reports (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('missing','found')),
  title text not null check (length(title) between 1 and 100),
  description text not null check (length(description) between 1 and 1500),
  location text not null check (length(location) between 1 and 160),
  seen_date date not null,
  reporter_user uuid not null references auth.users(id),
  reporter_key text not null,
  reporter_name text not null,
  owner_key text,
  owner_name text,
  item_id uuid references skor_equipment.items(id),
  quantity integer check (quantity between 1 and 500),
  stock_missing boolean not null default false,
  photo_path text,
  status text not null check (status in ('missing','unclaimed','found','returned')),
  announced_at timestamptz,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (not stock_missing or (item_id is not null and quantity is not null))
);
create index equipment_reports_item on skor_equipment.reports(item_id) where stock_missing;

create table skor_equipment.messages (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references skor_equipment.reports(id),
  author_user uuid not null references auth.users(id),
  recipient_user uuid not null references auth.users(id),
  author_key text not null,
  author_name text not null,
  recipient_key text not null,
  recipient_name text not null,
  body text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index equipment_message_report on skor_equipment.messages(report_id,created_at);
create table skor_equipment.notifications (
  id uuid primary key default gen_random_uuid(),
  audience text not null check (audience in ('team','captains','user')),
  recipient_user uuid references auth.users(id),
  report_id uuid references skor_equipment.reports(id),
  loan_id uuid references skor_equipment.loans(id),
  body text not null,
  created_at timestamptz not null default now(),
  check (audience<>'user' or recipient_user is not null)
);
create index equipment_notification_target on skor_equipment.notifications(recipient_user,created_at desc);
create table skor_equipment.notification_reads (
  notification_id uuid not null references skor_equipment.notifications(id),
  user_id uuid not null references auth.users(id),
  primary key(notification_id,user_id)
);
create table skor_equipment.history (
  id bigint generated always as identity primary key,
  actor_name text not null,
  action text not null,
  summary text not null,
  created_at timestamptz not null default now()
);
create table skor_equipment.operations (
  request_id uuid not null,
  user_id uuid not null references auth.users(id),
  action text not null,
  payload_signature text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(user_id,request_id)
);

-- No browser role has direct table access. Only the guarded APIs below may write.
do $$ declare t text; begin
  foreach t in array array['items','loans','allocations','reports','messages','notifications','notification_reads','history','operations'] loop
    execute format('alter table skor_equipment.%I enable row level security',t);
    execute format('revoke all on skor_equipment.%I from public, anon, authenticated',t);
  end loop;
end $$;

create function skor_equipment.is_member() returns boolean
language sql stable security definer set search_path=''
as $$ select auth.uid() is not null and (public.is_skor_captain() or public.current_player_id() is not null) $$;

-- Opaque captain keys prevent email addresses from entering the team directory.
create function skor_equipment.people() returns table(key text,name text,kind text)
language sql stable security definer set search_path=''
as $$
  select 'captain:'||md5(lower(c.email)),coalesce(nullif(trim(c.display_name),''),'Captain'),'captain'
  from public.captain_allowlist c where c.active and c.role in ('captain','super_admin')
  union all
  select 'player:'||r.id::text,r.full_name,'player' from public.team_roster r where r.active
$$;

create function skor_equipment.actor_key() returns text
language sql stable security definer set search_path=''
as $$ select case when public.is_skor_captain() then 'captain:'||md5(lower(auth.jwt()->>'email'))
  when public.current_player_id() is not null then 'player:'||public.current_player_id()::text end $$;

create function skor_equipment.recipient_user(p_key text) returns uuid
language sql stable security definer set search_path=''
as $$
  select u.id from auth.users u join public.captain_allowlist c on lower(c.email)=lower(u.email)
  where p_key='captain:'||md5(lower(c.email)) and c.active and c.role in ('captain','super_admin')
  union all
  select pa.auth_user_id from public.player_access pa join public.team_roster r on r.id=pa.roster_player_id
  where p_key='player:'||r.id::text and pa.active and r.active and r.portal_enabled and pa.auth_user_id is not null
  limit 1
$$;

create function skor_equipment.free_quantity(p_id uuid) returns integer
language sql stable security definer set search_path=''
as $$
  select greatest(0,i.quantity-i.missing-coalesce((
    select sum(a.quantity)::integer from skor_equipment.allocations a join skor_equipment.loans l on l.id=a.loan_id
    where a.item_id=i.id and l.status in ('approved','borrowed','return_pending')
  ),0)) from skor_equipment.items i where i.id=p_id
$$;

create function skor_equipment.available_quantity(p_id uuid) returns integer
language sql stable security definer set search_path=''
as $$
  select case when not i.active or exists(select 1 from skor_equipment.items p where p.id=i.parent_id and (not p.active or p.missing>0)) then 0
    when i.category in ('ball_bag','cone_set') and exists(
      select 1 from skor_equipment.items ch where ch.parent_id=i.id
      and (not ch.active or ch.missing>0 or skor_equipment.free_quantity(ch.id)<ch.quantity)
    ) then 0 else skor_equipment.free_quantity(i.id) end
  from skor_equipment.items i where i.id=p_id
$$;

create function skor_equipment.check_photo(p_path text) returns void
language plpgsql security definer set search_path=''
as $$ begin
  if p_path is null or p_path='' then return; end if;
  if split_part(p_path,'/',1)<>auth.uid()::text or not exists(
    select 1 from storage.objects where bucket_id='skor-equipment' and name=p_path
  ) then raise exception 'Upload your own equipment photo first.'; end if;
end $$;

create function skor_equipment.snapshot() returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare v_manage boolean:=coalesce(public.is_skor_captain(),false); v_actor text:=skor_equipment.actor_key(); v_result jsonb;
begin
  if auth.uid() is null or not (skor_equipment.is_member() or coalesce(public.is_approved_captain(),false)) then
    raise exception 'Approved team access required.' using errcode='42501';
  end if;
  select jsonb_build_object(
    'actor_key',v_actor,'can_manage',v_manage,'can_request',skor_equipment.is_member(),
    'people',coalesce((select jsonb_agg(to_jsonb(p) order by p.kind,p.name) from skor_equipment.people() p),'[]'::jsonb),
    'items',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('available',skor_equipment.available_quantity(i.id),'reserved',coalesce((
      select sum(a.quantity) from skor_equipment.allocations a join skor_equipment.loans l on l.id=a.loan_id where a.item_id=i.id and l.status in ('approved','borrowed','return_pending')
    ),0)) order by i.created_at) from skor_equipment.items i),'[]'::jsonb),
    'loans',coalesce((select jsonb_agg((to_jsonb(l)-'borrower_user'-'decided_by')||jsonb_build_object(
      'item_name',i.name,'is_mine',l.borrower_user=auth.uid(),'allocations',(
        select jsonb_agg(jsonb_build_object('item_id',a.item_id,'name',it.name,'quantity',a.quantity))
        from skor_equipment.allocations a join skor_equipment.items it on it.id=a.item_id where a.loan_id=l.id
      )) order by l.requested_at desc)
      from skor_equipment.loans l join skor_equipment.items i on i.id=l.item_id where v_manage or l.borrower_user=auth.uid()),'[]'::jsonb),
    'reports',coalesce((select jsonb_agg((to_jsonb(r)-'reporter_user')||jsonb_build_object('is_mine',r.reporter_user=auth.uid() or r.owner_key=v_actor) order by r.created_at desc) from skor_equipment.reports r),'[]'::jsonb),
    'messages',coalesce((select jsonb_agg(to_jsonb(m)-'author_user'-'recipient_user' order by m.created_at) from skor_equipment.messages m
      where v_manage or m.author_user=auth.uid() or m.recipient_user=auth.uid()),'[]'::jsonb),
    'notifications',coalesce((select jsonb_agg(to_jsonb(n)-'recipient_user'||jsonb_build_object('read',exists(
      select 1 from skor_equipment.notification_reads rd where rd.notification_id=n.id and rd.user_id=auth.uid())) order by n.created_at desc)
      from (select * from skor_equipment.notifications nt where nt.audience='team' or (nt.audience='captains' and v_manage)
        or (nt.audience='user' and nt.recipient_user=auth.uid()) order by nt.created_at desc limit 100) n),'[]'::jsonb),
    'history',case when v_manage then coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc) from (
      select * from skor_equipment.history order by created_at desc limit 100) h),'[]'::jsonb) else '[]'::jsonb end
  ) into v_result;
  return v_result;
end $$;

create function skor_equipment.action(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_manage boolean:=coalesce(public.is_skor_captain(),false);
  v_actor text:=skor_equipment.actor_key(); v_name text; v_holder text; v_holder_name text;
  v_id uuid; v_item skor_equipment.items%rowtype; v_loan skor_equipment.loans%rowtype; v_report skor_equipment.reports%rowtype;
  v_qty integer; v_due date; v_ids uuid[]; v_n integer; v_to text; v_to_name text; v_user uuid;
  v_photo text:=nullif(p_payload->>'photo_path',''); v_text text; v_summary text;
  v_request uuid; v_signature text; v_previous skor_equipment.operations%rowtype; v_result jsonb;
begin
  if not skor_equipment.is_member() then raise exception 'Active team access required.' using errcode='42501'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid equipment action.'; end if;
  select name into v_name from skor_equipment.people() where key=v_actor;
  -- All equipment writes use the same transaction lock, including bag edits,
  -- approvals, returns and missing-stock changes. No double booking or lock inversion.
  perform pg_advisory_xact_lock(hashtextextended('skor-fc-equipment',0));
  v_request:=(p_payload->>'request_id')::uuid;
  if v_request is null then raise exception 'Reopen the equipment action before saving.'; end if;
  v_signature:=md5((p_payload-'request_id'-'photo_path')::text);
  select * into v_previous from skor_equipment.operations where user_id=auth.uid() and request_id=v_request;
  if found then
    if v_previous.action<>p_action or v_previous.payload_signature<>v_signature then raise exception 'This confirmation already saved different details. Refresh and reopen it.'; end if;
    return v_previous.result;
  end if;
  if p_action in ('save_item','transfer','approve','decline','pickup','confirm_return','link_missing','announce') and not v_manage then
    raise exception 'Captain approval required.' using errcode='42501';
  end if;

  if p_action='save_item' then
    v_id:=nullif(p_payload->>'id','')::uuid;
    v_holder:=p_payload->>'holder_key';
    select name into v_holder_name from skor_equipment.people() where key=v_holder;
    if v_holder_name is null then raise exception 'Choose an active captain or player.'; end if;
    v_qty:=(p_payload->>'quantity')::integer;
    if v_id is not null then
      select * into v_item from skor_equipment.items where id=v_id;
      if not found then raise exception 'Equipment no longer exists.'; end if;
      if exists(select 1 from skor_equipment.allocations a join skor_equipment.loans l on l.id=a.loan_id
        where (a.item_id=v_id or a.item_id in(select id from skor_equipment.items where parent_id=v_id))
        and l.status in ('approved','borrowed','return_pending')) then raise exception 'Return or cancel reserved equipment before editing its stock.'; end if;
      if v_item.missing>v_qty or (v_item.missing>0 and (p_payload->>'active')::boolean=false) then raise exception 'Resolve missing stock before reducing or retiring it.'; end if;
      if (p_payload->>'active')::boolean=false and exists(select 1 from skor_equipment.items where parent_id=v_id and missing>0) then raise exception 'Recover missing contents before retiring the bag.'; end if;
      if (v_item.missing>0 or exists(select 1 from skor_equipment.items where parent_id=v_id and missing>0)) and (
        v_qty is distinct from v_item.quantity or v_holder is distinct from v_item.holder_key
        or nullif(p_payload->>'parent_id','')::uuid is distinct from v_item.parent_id
        or p_payload->>'category' is distinct from v_item.category
        or (p_payload->>'active')::boolean is distinct from v_item.active
      ) then raise exception 'Recover missing stock before changing quantity, group or custody.'; end if;
      if v_item.photo_path is distinct from v_photo then perform skor_equipment.check_photo(v_photo); end if;
    else perform skor_equipment.check_photo(v_photo); end if;
    if nullif(p_payload->>'parent_id','') is not null then
      if (p_payload->>'parent_id')::uuid=v_id then raise exception 'Equipment cannot contain itself.'; end if;
      if not exists(select 1 from skor_equipment.items p where p.id=(p_payload->>'parent_id')::uuid and p.parent_id is null and p.active
        and ((p.category='ball_bag' and p_payload->>'category'='ball') or (p.category='cone_set' and p_payload->>'category'='cone'))
        and p.missing=0 and skor_equipment.free_quantity(p.id)=p.quantity) then raise exception 'Choose an available matching bag or cone set.'; end if;
      select holder_key,holder_name into v_holder,v_holder_name from skor_equipment.items where id=(p_payload->>'parent_id')::uuid;
    end if;
    if v_id is not null and exists(select 1 from skor_equipment.items where parent_id=v_id) and (p_payload->>'category'<>v_item.category or nullif(p_payload->>'parent_id','') is not null) then raise exception 'Keep the container category while it has contents.'; end if;
    if v_id is not null and v_item.parent_id is not null and v_item.parent_id is distinct from nullif(p_payload->>'parent_id','')::uuid
      and (skor_equipment.free_quantity(v_item.parent_id)<1 or exists(select 1 from skor_equipment.items p where p.id=v_item.parent_id and p.missing>0)) then raise exception 'Restore the bag before moving contents.'; end if;
    if v_id is null then
      insert into skor_equipment.items(name,category,description,quantity,parent_id,holder_key,holder_name,photo_path,active)
      values(trim(p_payload->>'name'),p_payload->>'category',coalesce(trim(p_payload->>'description'),''),v_qty,nullif(p_payload->>'parent_id','')::uuid,v_holder,v_holder_name,v_photo,(p_payload->>'active')::boolean) returning id into v_id;
    else
      update skor_equipment.items set name=trim(p_payload->>'name'),category=p_payload->>'category',description=coalesce(trim(p_payload->>'description'),''),
        quantity=v_qty,parent_id=nullif(p_payload->>'parent_id','')::uuid,holder_key=v_holder,holder_name=v_holder_name,photo_path=v_photo,active=(p_payload->>'active')::boolean,updated_at=now() where id=v_id;
      update skor_equipment.items set holder_key=v_holder,holder_name=v_holder_name,updated_at=now() where parent_id=v_id;
    end if;
    v_summary:='Saved equipment: '||trim(p_payload->>'name');

  elsif p_action='transfer' then
    select array_agg(distinct value::uuid) into v_ids from jsonb_array_elements_text(p_payload->'ids');
    if coalesce(cardinality(v_ids),0) not between 1 and 500 then raise exception 'Select equipment to hand off.'; end if;
    if (select count(*) from skor_equipment.items where id=any(v_ids))<>cardinality(v_ids) then raise exception 'Refresh inventory before handing off.'; end if;
    select array_agg(distinct id) into v_ids from skor_equipment.items where id=any(v_ids) or parent_id=any(v_ids);
    if exists(select 1 from skor_equipment.items where id=any(v_ids) and (missing>0 or not active)) then raise exception 'Only available, recovered equipment can be handed off.'; end if;
    if exists(select 1 from skor_equipment.items where id=any(v_ids) and parent_id is not null and not(parent_id=any(v_ids))) then raise exception 'Select the whole bag, or detach individual contents before handing them off.'; end if;
    if exists(select 1 from skor_equipment.allocations a join skor_equipment.loans l on l.id=a.loan_id where a.item_id=any(v_ids) and l.status in ('approved','borrowed','return_pending')) then raise exception 'Reserved or borrowed equipment cannot be reassigned.'; end if;
    v_holder:=p_payload->>'holder_key'; select name into v_holder_name from skor_equipment.people() where key=v_holder;
    if v_holder_name is null then raise exception 'Choose an active captain or player.'; end if;
    update skor_equipment.items set holder_key=v_holder,holder_name=v_holder_name,updated_at=now() where id=any(v_ids);
    v_summary:='Handed off '||cardinality(v_ids)||' inventory entries to '||v_holder_name;

  elsif p_action='request' then
    v_id:=(p_payload->>'item_id')::uuid; v_qty:=(p_payload->>'quantity')::integer; v_due:=(p_payload->>'due_date')::date;
    select * into v_item from skor_equipment.items where id=v_id;
    if not found or v_qty is null or v_qty<1 or v_qty>coalesce(skor_equipment.available_quantity(v_id),0) then raise exception 'This quantity is no longer available.'; end if;
    if v_due is null or v_due<(now() at time zone 'UTC')::date then raise exception 'Choose today or a future return date.'; end if;
    if exists(select 1 from skor_equipment.loans where item_id=v_id and borrower_user=auth.uid() and status in ('pending','approved','borrowed','return_pending')) then raise exception 'You already have an open request for this equipment.'; end if;
    insert into skor_equipment.loans(item_id,quantity,borrower_user,borrower_key,borrower_name,due_date,note)
      values(v_id,v_qty,auth.uid(),v_actor,v_name,v_due,coalesce(trim(p_payload->>'note'),'')) returning * into v_loan;
    insert into skor_equipment.notifications(audience,loan_id,body) values('captains',v_loan.id,v_name||' requested '||v_qty||' × '||v_item.name||'. Captain approval required.');
    v_id:=v_loan.id; v_summary:='Requested '||v_item.name||'; awaiting captain approval';

  elsif p_action in ('approve','decline','pickup','report_return','confirm_return','cancel') then
    v_id:=(p_payload->>'id')::uuid; select * into v_loan from skor_equipment.loans where id=v_id;
    if not found then raise exception 'Request no longer exists.'; end if;
    select * into v_item from skor_equipment.items where id=v_loan.item_id;
    if p_action in ('cancel','report_return') and not(v_manage or v_loan.borrower_user=auth.uid()) then raise exception 'Only your own request can be changed.' using errcode='42501'; end if;
    if p_action='approve' then
      if v_loan.status<>'pending' then raise exception 'This request has already been decided.'; end if;
      if skor_equipment.recipient_user(v_loan.borrower_key) is distinct from v_loan.borrower_user then raise exception 'This borrower no longer has active team access.'; end if;
      if v_loan.due_date<(now() at time zone 'UTC')::date then raise exception 'Return date has passed. Decline this request and ask for a new date.'; end if;
      if v_loan.quantity>skor_equipment.available_quantity(v_item.id) then raise exception 'Equipment was reserved or marked missing. Refresh availability.'; end if;
      insert into skor_equipment.allocations values(v_id,v_item.id,v_loan.quantity);
      if v_item.category in ('ball_bag','cone_set') then
        insert into skor_equipment.allocations select v_id,id,quantity from skor_equipment.items where parent_id=v_item.id and active;
      end if;
      update skor_equipment.loans set status='approved',approved_at=now(),decided_by=auth.uid() where id=v_id;
    elsif p_action='decline' then
      if v_loan.status<>'pending' then raise exception 'Only pending requests can be declined.'; end if;
      update skor_equipment.loans set status='declined',decided_by=auth.uid() where id=v_id;
    elsif p_action='cancel' then
      if v_loan.status not in ('pending','approved') then raise exception 'Only pending requests or uncollected reservations can be cancelled.'; end if;
      update skor_equipment.loans set status='cancelled' where id=v_id;
    elsif p_action='pickup' then
      if v_loan.status<>'approved' then raise exception 'Captain approval is required before handoff.'; end if;
      if skor_equipment.recipient_user(v_loan.borrower_key) is distinct from v_loan.borrower_user then raise exception 'This borrower no longer has active team access. Cancel the reservation.'; end if;
      if exists(select 1 from skor_equipment.allocations a join skor_equipment.items i on i.id=a.item_id where a.loan_id=v_id and (i.missing>0 or not i.active)) then raise exception 'Recover missing equipment before handoff.'; end if;
      update skor_equipment.loans set status='borrowed',picked_up_at=now() where id=v_id;
    elsif p_action='report_return' then
      if v_loan.status<>'borrowed' then raise exception 'Only collected equipment can be returned.'; end if;
      update skor_equipment.loans set status='return_pending' where id=v_id;
    elsif p_action='confirm_return' then
      if v_loan.status<>'return_pending' then raise exception 'A return must be reported before confirming receipt.'; end if;
      if exists(select 1 from skor_equipment.allocations a join skor_equipment.items i on i.id=a.item_id where a.loan_id=v_id and i.missing>0) then raise exception 'Resolve linked missing stock before confirming the complete return.'; end if;
      update skor_equipment.loans set status='returned',returned_at=now(),return_condition=coalesce(trim(p_payload->>'condition'),'Received in good condition') where id=v_id;
    end if;
    v_summary:=replace(p_action,'_',' ')||': '||v_item.name||' for '||v_loan.borrower_name;
    insert into skor_equipment.notifications(audience,recipient_user,loan_id,body) values('user',v_loan.borrower_user,v_id,v_summary);
    if p_action in ('report_return','cancel') then insert into skor_equipment.notifications(audience,loan_id,body) values('captains',v_id,v_summary); end if;

  elsif p_action='report' then
    if p_payload->>'kind' not in ('missing','found') or (p_payload->>'seen_date')::date>(now() at time zone 'UTC')::date then raise exception 'Choose a report type and a past or current date.'; end if;
    v_to:=nullif(p_payload->>'owner_key','');
    if v_to is null and p_payload->>'kind'='missing' then v_to:=v_actor; end if;
    select name into v_to_name from skor_equipment.people() where key=v_to;
    if v_to is not null and v_to_name is null then raise exception 'Choose an active owner, or leave the owner unknown.'; end if;
    perform skor_equipment.check_photo(v_photo);
    insert into skor_equipment.reports(kind,title,description,location,seen_date,reporter_user,reporter_key,reporter_name,owner_key,owner_name,photo_path,status)
      values(p_payload->>'kind',trim(p_payload->>'title'),trim(p_payload->>'description'),trim(p_payload->>'location'),(p_payload->>'seen_date')::date,
        auth.uid(),v_actor,v_name,v_to,v_to_name,v_photo,case when p_payload->>'kind'='missing' then 'missing' when v_to is null then 'unclaimed' else 'found' end) returning id into v_id;
    insert into skor_equipment.notifications(audience,report_id,body) values('captains',v_id,'Review Lost & Found report: '||trim(p_payload->>'title'));
    v_user:=skor_equipment.recipient_user(v_to);
    if v_user is not null and v_user<>auth.uid() then insert into skor_equipment.notifications(audience,recipient_user,report_id,body) values('user',v_user,v_id,v_name||' posted a report about your item: '||trim(p_payload->>'title')); end if;
    v_summary:='Reported '||trim(p_payload->>'title');

  elsif p_action in ('link_missing','announce','found','resolve','message') then
    v_id:=(p_payload->>'id')::uuid; select * into v_report from skor_equipment.reports where id=v_id;
    if not found then raise exception 'Report no longer exists.'; end if;
    if p_action in ('found','resolve') and not(v_manage or v_report.reporter_user=auth.uid() or v_report.owner_key=v_actor) then raise exception 'The reporter, owner or a captain must confirm this change.' using errcode='42501'; end if;
    if p_action<>'message' and v_report.status='returned' then raise exception 'This report is already resolved.'; end if;
    if p_action='link_missing' then
      if v_report.stock_missing or v_report.item_id is not null or v_report.kind<>'missing' then raise exception 'Only an unlinked missing report can mark inventory missing.'; end if;
      v_qty:=(p_payload->>'quantity')::integer; select * into v_item from skor_equipment.items where id=(p_payload->>'item_id')::uuid;
      if not found or not v_item.active or v_qty is null or v_qty<1 or v_qty>v_item.quantity-v_item.missing then raise exception 'Choose a valid missing quantity.'; end if;
      update skor_equipment.items set missing=missing+v_qty,updated_at=now() where id=v_item.id;
      update skor_equipment.reports set item_id=v_item.id,quantity=v_qty,stock_missing=true where id=v_id;
      -- The container is unavailable while any child is missing. Children are
      -- unavailable when the container is missing; no duplicate missing counts.
    elsif p_action='announce' then
      if v_report.announced_at is not null then raise exception 'This report has already been announced to the team.'; end if;
      insert into skor_equipment.notifications(audience,report_id,body) values('team',v_id,
        case when v_report.kind='missing' then 'Have you seen ' else 'Found: ' end||v_report.title||' · '||v_report.location||' · '||v_report.seen_date::text||'. Open Lost & Found to respond.');
      update skor_equipment.reports set announced_at=now() where id=v_id;
    elsif p_action='found' then
      update skor_equipment.reports set status='found' where id=v_id;
    elsif p_action='resolve' then
      if v_report.stock_missing and not v_manage then raise exception 'A captain must verify recovered team equipment.' using errcode='42501'; end if;
      if v_report.stock_missing then update skor_equipment.items set missing=missing-v_report.quantity,updated_at=now() where id=v_report.item_id; end if;
      update skor_equipment.reports set status='returned',stock_missing=false,resolved_at=now() where id=v_id;
    elsif p_action='message' then
      v_to:=coalesce(nullif(p_payload->>'to_key',''),v_report.owner_key,v_report.reporter_key);
      if v_to=v_actor then raise exception 'Choose another person to contact.'; end if;
      if v_to not in (v_report.reporter_key,coalesce(v_report.owner_key,'')) and not exists(
        select 1 from skor_equipment.messages m where m.report_id=v_id and m.author_key=v_to and m.recipient_key=v_actor
      ) then raise exception 'Reply to the owner, reporter or someone who contacted you about this item.'; end if;
      v_user:=skor_equipment.recipient_user(v_to); select name into v_to_name from skor_equipment.people() where key=v_to;
      if v_user is null then raise exception 'This person has no active linked portal. Contact a captain to arrange the return.'; end if;
      v_text:=trim(p_payload->>'body');
      insert into skor_equipment.messages(report_id,author_user,recipient_user,author_key,author_name,recipient_key,recipient_name,body)
        values(v_id,auth.uid(),v_user,v_actor,v_name,v_to,v_to_name,v_text);
      insert into skor_equipment.notifications(audience,recipient_user,report_id,body) values('user',v_user,v_id,v_name||' sent you a Lost & Found message about '||v_report.title||'.');
    end if;
    v_summary:=replace(p_action,'_',' ')||': '||v_report.title;

  elsif p_action='read_notification' then
    v_id:=(p_payload->>'id')::uuid;
    if not exists(select 1 from skor_equipment.notifications n where n.id=v_id and (n.audience='team' or (n.audience='captains' and v_manage) or n.recipient_user=auth.uid())) then raise exception 'Notification not available.'; end if;
    insert into skor_equipment.notification_reads values(v_id,auth.uid()) on conflict do nothing;
    return jsonb_build_object('ok',true,'id',v_id);
  else raise exception 'Unsupported equipment action.';
  end if;
  insert into skor_equipment.history(actor_name,action,summary) values(v_name,p_action,v_summary);
  v_result:=jsonb_build_object('ok',true,'id',v_id,'summary',v_summary,'photo_path',v_photo);
  insert into skor_equipment.operations(request_id,user_id,action,payload_signature,result) values(v_request,auth.uid(),p_action,v_signature,v_result);
  return v_result;
end $$;

-- API wrappers remain invokers; privilege escalation is confined to the private,
-- checked implementation. No authorization from user-editable metadata.
create function public.equipment_snapshot() returns jsonb
language sql security invoker set search_path='' as $$ select skor_equipment.snapshot() $$;
create function public.equipment_action(p_action text,p_payload jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select skor_equipment.action(p_action,p_payload) $$;

revoke all on all functions in schema skor_equipment from public, anon, authenticated;
grant execute on function skor_equipment.is_member(),skor_equipment.snapshot(),skor_equipment.action(text,jsonb) to authenticated;
revoke all on function public.equipment_snapshot(),public.equipment_action(text,jsonb) from public, anon, authenticated;
grant execute on function public.equipment_snapshot(),public.equipment_action(text,jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('skor-equipment','skor-equipment',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy "Equipment photos: team reads" on storage.objects for select to authenticated
using (bucket_id='skor-equipment' and ((select skor_equipment.is_member()) or ((select auth.uid()) is not null and (select public.is_approved_captain()))));
create policy "Equipment photos: own uploads" on storage.objects for insert to authenticated
with check (bucket_id='skor-equipment' and (select skor_equipment.is_member()) and (storage.foldername(name))[1]=(select auth.uid())::text);
-- No overwrite/update policy. Immutable randomized filenames prevent replacing
-- a photo already referenced by another player's report.
create function skor_equipment.photo_unreferenced(p_path text) returns boolean
language sql stable security definer set search_path=''
as $$ select not exists(select 1 from skor_equipment.items where photo_path=p_path)
  and not exists(select 1 from skor_equipment.reports where photo_path=p_path) $$;
revoke all on function skor_equipment.photo_unreferenced(text) from public,anon,authenticated;
grant execute on function skor_equipment.photo_unreferenced(text) to authenticated;
create policy "Equipment photos: unused own cleanup" on storage.objects for delete to authenticated
using (bucket_id='skor-equipment' and (select skor_equipment.is_member()) and (storage.foldername(name))[1]=(select auth.uid())::text
  and skor_equipment.photo_unreferenced(name));

-- Restrictive bucket boundaries preserve privacy even alongside unrelated,
-- permissive Storage policies. Other buckets keep their existing behavior.
create policy "Equipment boundary: anonymous" on storage.objects as restrictive for all to anon
using (bucket_id<>'skor-equipment') with check (bucket_id<>'skor-equipment');
create policy "Equipment boundary: reads" on storage.objects as restrictive for select to authenticated
using (bucket_id<>'skor-equipment' or ((select auth.uid()) is not null and ((select skor_equipment.is_member()) or (select public.is_approved_captain()))));
create policy "Equipment boundary: uploads" on storage.objects as restrictive for insert to authenticated
with check (bucket_id<>'skor-equipment' or ((select skor_equipment.is_member()) and (storage.foldername(name))[1]=(select auth.uid())::text));
create policy "Equipment boundary: immutable" on storage.objects as restrictive for update to authenticated
using (bucket_id<>'skor-equipment') with check (bucket_id<>'skor-equipment');
create policy "Equipment boundary: deletes" on storage.objects as restrictive for delete to authenticated
using (bucket_id<>'skor-equipment' or ((select skor_equipment.is_member()) and (storage.foldername(name))[1]=(select auth.uid())::text and skor_equipment.photo_unreferenced(name)));

commit;
