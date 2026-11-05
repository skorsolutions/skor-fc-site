-- v58.37: additive captain-only opponent scouting and strategy snapshots.
-- Authorized as part of the requested complete Opponents/Strategy/AI deployment.
-- Existing fixtures and plans are not rewritten; only exact opponent identities
-- and links are derived from SKOR fixtures. No scouting observations are seeded.
create table skor_private.opponents (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(trim(name)) between 1 and 100),
  name_key text generated always as (lower(regexp_replace(trim(name),'\s+',' ','g'))) stored unique,
  details jsonb not null default '{}' check(jsonb_typeof(details)='object'),
  ai_enabled boolean not null default true,
  revision integer not null default 1,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
create table skor_private.opponent_aliases (
  name_key text primary key,
  opponent_id uuid not null references skor_private.opponents(id) on delete cascade
);
create index opponent_aliases_opponent on skor_private.opponent_aliases(opponent_id);
create table skor_private.opponent_games (
  match_id uuid primary key references public.matches(id) on delete cascade,
  opponent_id uuid not null references skor_private.opponents(id)
);
create index opponent_games_opponent on skor_private.opponent_games(opponent_id);
create table skor_private.opponent_observations (
  id uuid primary key,
  opponent_id uuid not null references skor_private.opponents(id),
  match_id uuid not null references public.matches(id) on delete cascade,
  kind text not null check(kind in('expected','observed')),
  phase text not null check(phase in('pregame','first_half','second_half')),
  formation text not null check(formation in('Unknown','4-2-3-1','4-3-3','4-4-2','4-5-1','3-5-2','3-2-3-2','3-4-3','5-3-2','Custom / Freeform')),
  details jsonb not null default '{}' check(jsonb_typeof(details)='object'),
  revision integer not null default 1,
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  unique(opponent_id,match_id,kind,phase)
);
create index opponent_observations_match on skor_private.opponent_observations(match_id);
create index opponent_observations_history on skor_private.opponent_observations(opponent_id,updated_at desc);
alter table skor_private.opponents enable row level security;
alter table skor_private.opponent_aliases enable row level security;
alter table skor_private.opponent_games enable row level security;
alter table skor_private.opponent_observations enable row level security;
revoke all on skor_private.opponents,skor_private.opponent_aliases,skor_private.opponent_games,skor_private.opponent_observations from public,anon,authenticated;

create function skor_private.opponent_name_key(v text) returns text
language sql immutable set search_path='' as $$select lower(regexp_replace(trim(v),'\s+',' ','g'))$$;
create function skor_private.opponent_details(v jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare result jsonb:='{}'; k text; people jsonb:='[]'; person jsonb; cleaned jsonb; value text;
begin
  if v is null or jsonb_typeof(v)<>'object' then raise exception 'Scouting fields must be an object.';end if;
  foreach k in array array['style','strengths','weaknesses','set_pieces','notes'] loop
    value:=trim(coalesce(v->>k,''));
    if length(value)>2000 then raise exception 'Scouting field is too long.';end if;
    result:=result||jsonb_build_object(k,value);
  end loop;
  if jsonb_typeof(coalesce(v->'dangerous_players','[]'))<>'array' or jsonb_array_length(coalesce(v->'dangerous_players','[]'))>20 then raise exception 'Use at most twenty dangerous-player notes.';end if;
  for person in select * from jsonb_array_elements(coalesce(v->'dangerous_players','[]')) loop
    if jsonb_typeof(person)<>'object' then raise exception 'Invalid dangerous-player note.';end if;
    cleaned:='{}';
    foreach k in array array['id','name','number','position','threat','containment'] loop
      value:=trim(coalesce(person->>k,''));
      if length(value)>case when k in('threat','containment') then 600 when k='name' then 80 else 64 end then raise exception 'Dangerous-player field is too long.';end if;
      if k='number' and value<>'' and value !~ '^([0-9]|[1-9][0-9])$' then raise exception 'Opponent shirt number must be 0–99 or blank.';end if;
      cleaned:=cleaned||jsonb_build_object(k,value);
    end loop;
    people:=people||jsonb_build_array(cleaned);
  end loop;
  return result||jsonb_build_object('dangerous_players',people);
end $$;

create function skor_private.sync_opponent_game(mid uuid) returns void
language plpgsql security definer set search_path='' as $$
declare m public.matches%rowtype; opponent_name text; nk text; oid uuid;
begin
  select * into m from public.matches where id=mid;
  if not found then return;end if;
  opponent_name:=case when upper(trim(m.home_team))='SKOR FC' then trim(m.away_team) when upper(trim(m.away_team))='SKOR FC' then trim(m.home_team) end;
  if opponent_name is null or opponent_name='' or upper(opponent_name)='SKOR FC' then delete from skor_private.opponent_games where match_id=mid;return;end if;
  nk:=skor_private.opponent_name_key(opponent_name);
  select opponent_id into oid from skor_private.opponent_aliases where name_key=nk;
  if oid is null then
    insert into skor_private.opponents(name) values(opponent_name) on conflict(name_key) do nothing;
    select id into oid from skor_private.opponents where name_key=nk;
    insert into skor_private.opponent_aliases values(nk,oid) on conflict(name_key) do nothing;
    select opponent_id into oid from skor_private.opponent_aliases where name_key=nk;
  end if;
  insert into skor_private.opponent_games values(mid,oid) on conflict(match_id) do update set opponent_id=excluded.opponent_id;
end $$;
create function skor_private.opponent_fixture_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform skor_private.sync_opponent_game(new.id);return new;end $$;
create trigger opponent_fixture_link after insert or update of home_team,away_team on public.matches
  for each row execute function skor_private.opponent_fixture_changed();
do $$declare m record;begin for m in select id from public.matches loop perform skor_private.sync_opponent_game(m.id);end loop;end$$;

create function public.get_opponents_console(p_opponent_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare oid uuid:=p_opponent_id;
begin
  if auth.uid() is null or not coalesce(public.is_skor_captain(),false) then raise exception 'Captain access required.' using errcode='42501';end if;
  if oid is null then select id into oid from skor_private.opponents order by name limit 1;end if;
  return jsonb_build_object('version',1,
    'opponents',(select coalesce(jsonb_agg(to_jsonb(p) order by p.name),'[]') from (select id,name,revision,updated_at from skor_private.opponents order by name limit 500) p),
    'profile',(select to_jsonb(p)-'name_key'-'updated_by' from skor_private.opponents p where id=oid),
    'matches',(select coalesce(jsonb_agg(to_jsonb(m) order by m.kickoff desc),'[]') from (select m.id,m.kickoff,m.home_team,m.away_team,m.status from public.matches m join skor_private.opponent_games g on g.match_id=m.id where g.opponent_id=oid order by m.kickoff desc limit 100) m),
    'observations',(select coalesce(jsonb_agg(to_jsonb(o)-'updated_by' order by o.kickoff desc,o.updated_at desc),'[]') from (select o.*,m.kickoff,(g.opponent_id=o.opponent_id) as valid_match from skor_private.opponent_observations o join public.matches m on m.id=o.match_id left join skor_private.opponent_games g on g.match_id=o.match_id where o.opponent_id=oid order by m.kickoff desc,o.updated_at desc limit 100) o));
end $$;

create function public.save_opponent_scouting(p_kind text,p_id uuid,p_revision integer,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); p skor_private.opponents%rowtype; o skor_private.opponent_observations%rowtype;
  d jsonb; nm text; enabled boolean; nk text; oid uuid; mid uuid; k text; ph text; f text;
begin
  if actor is null or not coalesce(public.is_skor_captain(),false) then raise exception 'Captain access required.' using errcode='42501';end if;
  if p_id is null or p_revision is null or p_revision<0 or jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid scouting save.';end if;
  d:=skor_private.opponent_details(coalesce(p_payload->'details','{}'));
  if p_kind='profile' then
    nm:=trim(coalesce(p_payload->>'name',''));enabled:=coalesce((p_payload->>'ai_enabled')::boolean,true);nk:=skor_private.opponent_name_key(nm);
    if length(nm) not between 1 and 100 then raise exception 'Enter an opponent name (1–100 characters).';end if;
    select * into p from skor_private.opponents where id=p_id for update;
    if found then
      if p.revision=p_revision+1 and p.updated_by=actor and p.name=nm and p.details=d and p.ai_enabled=enabled then return to_jsonb(p)-'name_key'-'updated_by';end if;
      if p.revision<>p_revision then raise exception 'Scouting changed. Reload and review before saving.' using errcode='40001';end if;
      if exists(select 1 from skor_private.opponent_aliases where name_key=nk and opponent_id<>p_id) then raise exception 'That opponent name already belongs to another profile.';end if;
      update skor_private.opponents set name=nm,details=d,ai_enabled=enabled,revision=revision+1,updated_by=actor,updated_at=clock_timestamp() where id=p_id returning * into p;
    else
      if p_revision<>0 then raise exception 'Opponent profile no longer exists.';end if;
      if exists(select 1 from skor_private.opponent_aliases where name_key=nk) then raise exception 'That opponent already has a profile.';end if;
      insert into skor_private.opponents(id,name,details,ai_enabled,updated_by) values(p_id,nm,d,enabled,actor) returning * into p;
    end if;
    insert into skor_private.opponent_aliases values(nk,p_id) on conflict(name_key) do nothing;
    if not exists(select 1 from skor_private.opponent_aliases where name_key=nk and opponent_id=p_id) then raise exception 'Opponent name conflict. Reload and review.';end if;
    return to_jsonb(p)-'name_key'-'updated_by';
  elsif p_kind='observation' then
    oid:=(p_payload->>'opponent_id')::uuid;mid:=(p_payload->>'match_id')::uuid;
    if not exists(select 1 from skor_private.opponent_games where match_id=mid and opponent_id=oid) then raise exception 'This game is not linked to the selected opponent.';end if;
    k:=p_payload->>'kind';ph:=p_payload->>'phase';f:=p_payload->>'formation';
    select * into o from skor_private.opponent_observations where id=p_id for update;
    if found then
      if o.opponent_id<>oid or o.match_id<>mid then raise exception 'An observation cannot be moved to a different game or opponent.';end if;
      if o.revision=p_revision+1 and o.updated_by=actor and o.details=d and o.kind=k and o.phase=ph and o.formation=f then return to_jsonb(o)-'updated_by';end if;
      if o.revision<>p_revision then raise exception 'Observation changed. Reload and review before saving.' using errcode='40001';end if;
      update skor_private.opponent_observations set kind=k,phase=ph,formation=f,details=d,revision=revision+1,updated_by=actor,updated_at=clock_timestamp() where id=p_id returning * into o;
    else
      if p_revision<>0 then raise exception 'Observation no longer exists.';end if;
      insert into skor_private.opponent_observations(id,opponent_id,match_id,kind,phase,formation,details,updated_by) values(p_id,oid,mid,k,ph,f,d,actor) returning * into o;
    end if;
    return to_jsonb(o)-'updated_by';
  else raise exception 'Unknown scouting save type.';end if;
end $$;

create function public.get_opponent_scouting_for_match(p_match_id uuid,p_for_ai boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p skor_private.opponents%rowtype; target public.matches%rowtype;
begin
  if auth.uid() is null or not coalesce(public.is_skor_captain(),false) then raise exception 'Captain access required.' using errcode='42501';end if;
  select * into target from public.matches where id=p_match_id;
  if not found then raise exception 'Match not found.';end if;
  select op.* into p from skor_private.opponents op join skor_private.opponent_games g on g.opponent_id=op.id where g.match_id=p_match_id;
  if not found then return jsonb_build_object('version',1,'match_id',p_match_id,'profile',null,'observations','[]'::jsonb);end if;
  if p_for_ai and not p.ai_enabled then return jsonb_build_object('version',1,'match_id',p_match_id,'opponent_id',p.id,'ai_enabled',false,'profile',null,'observations','[]'::jsonb);end if;
  return jsonb_build_object('version',1,'captured_at',now(),'match_id',target.id,'kickoff',target.kickoff,'opponent_id',p.id,'ai_enabled',p.ai_enabled,
    'profile',to_jsonb(p)-'name_key'-'updated_by',
    'observations',(select coalesce(jsonb_agg(to_jsonb(o)-'updated_by' order by o.kickoff desc,o.updated_at desc),'[]') from
      (select o.*,m.kickoff,m.status as match_status from skor_private.opponent_observations o join public.matches m on m.id=o.match_id join skor_private.opponent_games g on g.match_id=o.match_id and g.opponent_id=o.opponent_id
        where o.opponent_id=p.id and (m.id=target.id or (m.kickoff<target.kickoff and m.kickoff<=now() and m.status<>'cancelled')) order by m.kickoff desc,o.updated_at desc limit 100) o));
end $$;

alter table public.match_strategies add column scouting_snapshot jsonb check(scouting_snapshot is null or (jsonb_typeof(scouting_snapshot)='object' and octet_length(scouting_snapshot::text)<=100000));
alter table public.strategy_scene_bundles add column scouting_snapshot jsonb check(scouting_snapshot is null or (jsonb_typeof(scouting_snapshot)='object' and octet_length(scouting_snapshot::text)<=100000));
revoke all on function skor_private.opponent_name_key(text),skor_private.opponent_details(jsonb),skor_private.sync_opponent_game(uuid),skor_private.opponent_fixture_changed() from public,anon,authenticated;
revoke all on function public.get_opponents_console(uuid),public.save_opponent_scouting(text,uuid,integer,jsonb),public.get_opponent_scouting_for_match(uuid,boolean) from public,anon,authenticated;
grant execute on function public.get_opponents_console(uuid),public.save_opponent_scouting(text,uuid,integer,jsonb),public.get_opponent_scouting_for_match(uuid,boolean) to authenticated;
notify pgrst,'reload schema';
