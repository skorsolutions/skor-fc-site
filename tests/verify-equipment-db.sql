-- Run ONLY against a disposable, empty local PostgreSQL database as a superuser:
-- psql -X -v ON_ERROR_STOP=1 -d <disposable-db> -f tests/verify-equipment-db.sql
-- This creates minimal Supabase fixtures, applies the exact staged SQL, then
-- exercises actual RPCs/roles/stock transitions. NEVER run against production.
\set ON_ERROR_STOP on
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema storage;
create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$ select (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select current_setting('request.jwt.claims',true)::jsonb $$;
grant usage on schema auth to authenticated,anon;
create table public.captain_allowlist(email text,display_name text,active boolean,role text);
create table public.team_roster(id uuid primary key,full_name text,active boolean,portal_enabled boolean);
create table public.player_access(roster_player_id uuid references public.team_roster,auth_user_id uuid references auth.users,active boolean);
create function public.is_skor_captain() returns boolean language sql stable security definer as $$ select exists(select 1 from public.captain_allowlist where lower(email)=lower(auth.jwt()->>'email') and active and role in ('captain','super_admin')) $$;
create function public.is_approved_captain() returns boolean language sql stable security definer as $$ select exists(select 1 from public.captain_allowlist where lower(email)=lower(auth.jwt()->>'email') and active) $$;
create function public.current_player_id() returns uuid language sql stable security definer as $$ select r.id from public.team_roster r join public.player_access pa on pa.roster_player_id=r.id where pa.auth_user_id=auth.uid() and pa.active and r.active and r.portal_enabled limit 1 $$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets,name text);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
grant usage on schema storage to authenticated,anon;
grant select,insert,update,delete on storage.objects to authenticated;
grant select on storage.objects to anon;
-- Deliberately broad fixtures prove the feature's restrictive bucket boundaries.
create policy fixture_storage_broad on storage.objects for all to authenticated using(true) with check(true);
create policy fixture_storage_anon on storage.objects for select to anon using(true);
insert into auth.users values
 ('00000000-0000-0000-0000-000000000001','captain@example.invalid'),
 ('00000000-0000-0000-0000-000000000002','player@example.invalid'),
 ('00000000-0000-0000-0000-000000000003','other-player@example.invalid'),
 ('00000000-0000-0000-0000-000000000004','viewer@example.invalid'),
 ('00000000-0000-0000-0000-000000000005','unlinked@example.invalid'),
 ('00000000-0000-0000-0000-000000000006','other-captain@example.invalid');
insert into public.captain_allowlist values('captain@example.invalid','Example Captain',true,'captain'),('other-captain@example.invalid','Other Captain',true,'super_admin'),('viewer@example.invalid','Viewer',true,'viewer');
insert into public.team_roster values('10000000-0000-0000-0000-000000000002','Sample Player',true,true),('10000000-0000-0000-0000-000000000003','Other Player',true,true);
insert into public.player_access values('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002',true),('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000003',true);

\ir ../docs/sql/EQUIPMENT.sql

create function public.eq_assert(p_test boolean,p_label text) returns void language plpgsql as $$ begin if p_test is distinct from true then raise exception 'FAILED: %',p_label; end if; end $$;
create function public.eq_reject(p_sql text,p_error text) returns void language plpgsql as $$ declare got text; begin
  begin execute p_sql; exception when others then get stacked diagnostics got=message_text; end;
  if got is null or position(lower(p_error) in lower(got))=0 then raise exception 'FAILED rejection: expected %, got %',p_error,coalesce(got,'success'); end if;
end $$;
create function public.eq_call(p_action text,p_payload jsonb) returns jsonb language sql as $$ select public.equipment_action(p_action,p_payload||jsonb_build_object('request_id',gen_random_uuid())) $$;
create function public.eq_available(p_id text) returns integer language sql as $$ select (i->>'available')::integer from jsonb_array_elements(public.equipment_snapshot()->'items') i where i->>'id'=current_setting(p_id) $$;

set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000001","email":"captain@example.invalid"}';
set role authenticated;
select set_config('eq.holder','captain:'||md5('captain@example.invalid'),false);
select set_config('eq.bag',(public.eq_call('save_item',jsonb_build_object('name','Match bag','category','ball_bag','quantity',1,'active',true,'holder_key',current_setting('eq.holder')))->>'id'),false);
select set_config('eq.balls',(public.eq_call('save_item',jsonb_build_object('name','Match balls','category','ball','quantity',3,'active',true,'holder_key',current_setting('eq.holder'),'parent_id',current_setting('eq.bag')))->>'id'),false);
select set_config('eq.cones',(public.eq_call('save_item',jsonb_build_object('name','Cones','category','cone','quantity',12,'active',true,'holder_key',current_setting('eq.holder')))->>'id'),false);
select public.eq_assert(public.eq_available('eq.bag')=1 and public.eq_available('eq.balls')=3,'initial quantities, no double count');
select public.eq_reject('select * from skor_equipment.items','permission denied');
select public.eq_reject('select * from skor_equipment.loans','permission denied');
select public.eq_reject('select skor_equipment.people()','permission denied');

set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000002","email":"player@example.invalid"}';
select set_config('eq.loan',(public.eq_call('request',jsonb_build_object('item_id',current_setting('eq.balls'),'quantity',2,'due_date','2099-01-01'))->>'id'),false);
select public.eq_assert(public.eq_available('eq.balls')=3,'pending request reserves nothing');
select public.eq_reject(format('select public.eq_call(''approve'',jsonb_build_object(''id'',%L))',current_setting('eq.loan')),'Captain approval required');
select public.eq_reject(format('select public.eq_call(''pickup'',jsonb_build_object(''id'',%L))',current_setting('eq.loan')),'Captain approval required');
select public.eq_reject(format('select public.eq_call(''request'',jsonb_build_object(''item_id'',%L,''quantity'',2,''due_date'',''2099-01-01''))',current_setting('eq.balls')),'already have an open request');

set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000003","email":"other-player@example.invalid"}';
select public.eq_assert(jsonb_array_length(public.equipment_snapshot()->'loans')=0,'other player cannot read private loans');
select set_config('eq.competing',(public.eq_call('request',jsonb_build_object('item_id',current_setting('eq.balls'),'quantity',2,'due_date','2099-01-01'))->>'id'),false);
select set_config('eq.bag_loan',(public.eq_call('request',jsonb_build_object('item_id',current_setting('eq.bag'),'quantity',1,'due_date','2099-01-01'))->>'id'),false);
select public.eq_reject(format('select public.eq_call(''cancel'',jsonb_build_object(''id'',%L))',current_setting('eq.loan')),'Only your own request');

set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000001","email":"captain@example.invalid"}';
select public.eq_call('approve',jsonb_build_object('id',current_setting('eq.loan')));
select public.eq_assert(public.eq_available('eq.balls')=1 and public.eq_available('eq.bag')=0,'individual reservation makes full bag unavailable');
select public.eq_reject(format('select public.eq_call(''approve'',jsonb_build_object(''id'',%L))',current_setting('eq.competing')),'Equipment was reserved');
select public.eq_reject(format('select public.eq_call(''approve'',jsonb_build_object(''id'',%L))',current_setting('eq.bag_loan')),'Equipment was reserved');
select public.eq_reject(format('select public.eq_call(''transfer'',jsonb_build_object(''ids'',jsonb_build_array(%L),''holder_key'',%L))',current_setting('eq.bag'),current_setting('eq.holder')),'Reserved or borrowed');
select public.eq_call('pickup',jsonb_build_object('id',current_setting('eq.loan')));
select public.eq_reject(format('select public.eq_call(''confirm_return'',jsonb_build_object(''id'',%L))',current_setting('eq.loan')),'return must be reported');
set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000002","email":"player@example.invalid"}';
select public.eq_call('report_return',jsonb_build_object('id',current_setting('eq.loan')));
select public.eq_assert(public.eq_available('eq.balls')=1,'reported return does not release stock');
set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000001","email":"captain@example.invalid"}';
select public.eq_call('confirm_return',jsonb_build_object('id',current_setting('eq.loan'),'condition','All received'));
select public.eq_assert(public.eq_available('eq.balls')=3 and public.eq_available('eq.bag')=1,'captain receipt releases allocations');
select public.eq_call('approve',jsonb_build_object('id',current_setting('eq.bag_loan')));
select public.eq_assert(public.eq_available('eq.balls')=0 and public.eq_available('eq.bag')=0,'full bag reserves all children');
select set_config('eq.report',(public.eq_call('report',jsonb_build_object('kind','missing','title','Match ball','description','Missing after practice','location','Field 2','seen_date','2026-10-14'))->>'id'),false);
select public.eq_call('link_missing',jsonb_build_object('id',current_setting('eq.report'),'item_id',current_setting('eq.balls'),'quantity',1));
select public.eq_reject(format('select public.eq_call(''pickup'',jsonb_build_object(''id'',%L))',current_setting('eq.bag_loan')),'Recover missing equipment');
select public.eq_call('found',jsonb_build_object('id',current_setting('eq.report')));
select public.eq_assert(exists(select 1 from jsonb_array_elements(public.equipment_snapshot()->'items') i where i->>'id'=current_setting('eq.balls') and (i->>'missing')::integer=1),'sighting does not restore missing stock');
select public.eq_call('announce',jsonb_build_object('id',current_setting('eq.report')));

set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000002","email":"player@example.invalid"}';
select public.eq_assert(exists(select 1 from jsonb_array_elements(public.equipment_snapshot()->'notifications') n where n->>'audience'='team'),'team announcements reach players');
select public.eq_reject(format('select public.eq_call(''resolve'',jsonb_build_object(''id'',%L))',current_setting('eq.report')),'reporter, owner or a captain');
select public.equipment_action('message',jsonb_build_object('id',current_setting('eq.report'),'to_key',current_setting('eq.holder'),'body','I saw it near the bench','request_id','20000000-0000-0000-0000-000000000001'));
select public.equipment_action('message',jsonb_build_object('id',current_setting('eq.report'),'to_key',current_setting('eq.holder'),'body','I saw it near the bench','request_id','20000000-0000-0000-0000-000000000001'));
select public.eq_assert(jsonb_array_length(public.equipment_snapshot()->'messages')=1,'idempotent retry creates one message');
set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000003","email":"other-player@example.invalid"}';
select public.eq_assert(jsonb_array_length(public.equipment_snapshot()->'messages')=0,'private finder thread is not visible to another player');
set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000001","email":"captain@example.invalid"}';
select public.eq_assert(jsonb_array_length(public.equipment_snapshot()->'messages')=1,'captains can assist with return');
select public.eq_call('resolve',jsonb_build_object('id',current_setting('eq.report')));
select public.eq_call('pickup',jsonb_build_object('id',current_setting('eq.bag_loan')));
set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000003","email":"other-player@example.invalid"}';
select public.eq_call('report_return',jsonb_build_object('id',current_setting('eq.bag_loan')));
set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000001","email":"captain@example.invalid"}';
select public.eq_call('confirm_return',jsonb_build_object('id',current_setting('eq.bag_loan')));
select public.eq_call('transfer',jsonb_build_object('ids',jsonb_build_array(current_setting('eq.bag'),current_setting('eq.balls')),'holder_key','captain:'||md5('other-captain@example.invalid')));
select public.eq_assert((select count(*) from jsonb_array_elements(public.equipment_snapshot()->'items') i where i->>'holder_name'='Other Captain')=2,'bag transfer deduplicates children and records custody');

-- An inactive borrower cannot be approved after an account/access reset.
reset role;
update public.player_access set active=false where auth_user_id='00000000-0000-0000-0000-000000000003';
set role authenticated;
select public.eq_reject(format('select public.eq_call(''approve'',jsonb_build_object(''id'',%L))',current_setting('eq.competing')),'no longer has active team access');
insert into storage.objects(bucket_id,name) values('skor-equipment','00000000-0000-0000-0000-000000000001/test.png');
select public.eq_reject('insert into storage.objects(bucket_id,name) values(''skor-equipment'',''other-user/photo.png'')','row-level security');
with changed as (update storage.objects set name='overwritten.png' where bucket_id='skor-equipment' returning id)
select public.eq_assert((select count(*) from changed)=0,'existing broad policy cannot overwrite an equipment photo');
set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000004","email":"viewer@example.invalid"}';
select public.eq_assert((public.equipment_snapshot()->>'can_request')::boolean=false,'viewer is read only');
select public.eq_reject('select public.eq_call(''report'',''{}''::jsonb)','Active team access required');
select public.eq_reject('insert into storage.objects(bucket_id,name) values(''skor-equipment'',''00000000-0000-0000-0000-000000000004/test.png'')','row-level security');
set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000005","email":"unlinked@example.invalid"}';
select public.eq_reject('select public.equipment_snapshot()','Approved team access required');
set role anon;
set request.jwt.claims='{}';
select public.eq_reject('select public.equipment_snapshot()','permission denied');
select public.eq_assert((select count(*) from storage.objects)=0,'anonymous photo access denied');
reset role;
select public.eq_assert((select count(*) from public.team_roster)=2 and (select count(*) from public.captain_allowlist)=3,'existing data unaffected by feature');
select 'Equipment database role / stock / approval / lost-and-found verification passed.' as result;
