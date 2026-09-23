create table public.team_kits (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color_name text not null,
  color_hex text not null,
  active boolean not null default true,
  sort_order integer not null default 1000,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_kits_name_check
    check (char_length(btrim(name)) between 1 and 80),
  constraint team_kits_color_name_check
    check (char_length(btrim(color_name)) between 1 and 40),
  constraint team_kits_color_hex_check
    check (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  constraint team_kits_sort_order_check
    check (sort_order between 0 and 100000)
);

create unique index team_kits_name_uidx
  on public.team_kits (lower(btrim(name)));

create index team_kits_active_sort_idx
  on public.team_kits (active, sort_order, name);

create table public.jersey_inventory (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid not null references public.team_kits(id) on delete restrict,
  jersey_number integer not null,
  size text not null,
  status text not null default 'on_hand',
  holder_captain_name text,
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jersey_inventory_number_check
    check (jersey_number between 1 and 99),
  constraint jersey_inventory_size_check
    check (char_length(btrim(size)) between 1 and 20),
  constraint jersey_inventory_status_check
    check (status in ('on_hand', 'unavailable', 'retired')),
  constraint jersey_inventory_holder_check
    check (holder_captain_name is null or char_length(btrim(holder_captain_name)) between 1 and 160),
  constraint jersey_inventory_notes_check
    check (notes is null or char_length(notes) <= 500)
);

create unique index jersey_inventory_active_kit_number_uidx
  on public.jersey_inventory (kit_id, jersey_number)
  where status <> 'retired';

create index jersey_inventory_kit_status_idx
  on public.jersey_inventory (kit_id, status, jersey_number);

create index jersey_inventory_holder_idx
  on public.jersey_inventory (holder_captain_name)
  where holder_captain_name is not null;

alter table public.match_temp_players
  add column jersey_inventory_id uuid references public.jersey_inventory(id) on delete set null;

create unique index match_temp_players_active_inventory_uidx
  on public.match_temp_players (match_id, jersey_inventory_id)
  where active = true and jersey_inventory_id is not null;

create index match_temp_players_inventory_idx
  on public.match_temp_players (jersey_inventory_id)
  where jersey_inventory_id is not null;

create or replace function public.set_jersey_inventory_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger team_kits_set_updated_at
before update on public.team_kits
for each row execute function public.set_jersey_inventory_updated_at();

create trigger jersey_inventory_set_updated_at
before update on public.jersey_inventory
for each row execute function public.set_jersey_inventory_updated_at();

create or replace function public.sync_match_temp_player_inventory_jersey()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  selected_number integer;
  selected_status text;
  selected_kit_active boolean;
  assignment_changed boolean := false;
begin
  if new.jersey_inventory_id is null then
    return new;
  end if;

  select inventory.jersey_number, inventory.status, kit.active
    into selected_number, selected_status, selected_kit_active
  from public.jersey_inventory inventory
  join public.team_kits kit on kit.id = inventory.kit_id
  where inventory.id = new.jersey_inventory_id;

  if not found then
    raise exception 'Selected jersey inventory item does not exist.';
  end if;

  if tg_op = 'INSERT' then
    assignment_changed := true;
  elsif tg_op = 'UPDATE' then
    assignment_changed := new.jersey_inventory_id is distinct from old.jersey_inventory_id;
  end if;

  if assignment_changed and (selected_status <> 'on_hand' or selected_kit_active is not true) then
    raise exception 'Selected jersey is not currently available.';
  end if;

  new.jersey_number = selected_number;
  return new;
end;
$$;

create trigger match_temp_players_sync_inventory_jersey
before insert or update of jersey_inventory_id, jersey_number
on public.match_temp_players
for each row execute function public.sync_match_temp_player_inventory_jersey();

create or replace function public.sync_inventory_number_to_temp_players()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.jersey_number is distinct from old.jersey_number then
    update public.match_temp_players
      set jersey_number = new.jersey_number,
          updated_at = now()
    where jersey_inventory_id = new.id;
  end if;
  return new;
end;
$$;

create trigger jersey_inventory_sync_temp_number
after update of jersey_number on public.jersey_inventory
for each row execute function public.sync_inventory_number_to_temp_players();

alter table public.team_kits enable row level security;
alter table public.jersey_inventory enable row level security;

create policy team_kits_select_portal
on public.team_kits
for select
to authenticated
using ((select public.is_approved_captain()));

create policy team_kits_insert_captain
on public.team_kits
for insert
to authenticated
with check (
  (select public.is_skor_captain())
  and (created_by is null or created_by = (select auth.uid()))
);

create policy team_kits_update_captain
on public.team_kits
for update
to authenticated
using ((select public.is_skor_captain()))
with check ((select public.is_skor_captain()));

create policy jersey_inventory_select_portal
on public.jersey_inventory
for select
to authenticated
using ((select public.is_approved_captain()));

create policy jersey_inventory_insert_captain
on public.jersey_inventory
for insert
to authenticated
with check (
  (select public.is_skor_captain())
  and (created_by is null or created_by = (select auth.uid()))
);

create policy jersey_inventory_update_captain
on public.jersey_inventory
for update
to authenticated
using ((select public.is_skor_captain()))
with check ((select public.is_skor_captain()));

revoke all on table public.team_kits from public, anon, authenticated;
revoke all on table public.jersey_inventory from public, anon, authenticated;
grant select, insert, update on table public.team_kits to authenticated;
grant select, insert, update on table public.jersey_inventory to authenticated;

revoke all on function public.set_jersey_inventory_updated_at() from public, anon, authenticated;
revoke all on function public.sync_match_temp_player_inventory_jersey() from public, anon, authenticated;
revoke all on function public.sync_inventory_number_to_temp_players() from public, anon, authenticated;

insert into public.team_kits (name, color_name, color_hex, sort_order, created_by)
select 'Maroon', 'Maroon', '#741F35', 10, null
where not exists (
  select 1 from public.team_kits where lower(btrim(name)) = 'maroon'
);

insert into public.team_kits (name, color_name, color_hex, sort_order, created_by)
select 'White', 'White', '#FFFFFF', 20, null
where not exists (
  select 1 from public.team_kits where lower(btrim(name)) = 'white'
);

comment on table public.team_kits is
  'Captain-managed kit definitions used to group physical jersey inventory. Kits are archived instead of deleted.';

comment on table public.jersey_inventory is
  'Physical temporary/walk-on jersey assets, including kit, number, size, availability, and captain custody.';

comment on column public.jersey_inventory.holder_captain_name is
  'Display name of the captain who physically holds the jersey. This is custody metadata, not an authorization identity.';

comment on column public.match_temp_players.jersey_inventory_id is
  'Optional physical inventory jersey assigned to this TEMP player for this match. The jersey number is synchronized for backward compatibility.';
