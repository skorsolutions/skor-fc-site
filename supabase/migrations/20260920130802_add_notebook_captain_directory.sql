create or replace function public.get_notebook_captain_directory()
returns table(display_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_skor_captain() then
    raise exception 'Captain access required.' using errcode = '42501';
  end if;

  return query
  select btrim(ca.display_name)
  from public.captain_allowlist ca
  where ca.active = true
    and ca.role in ('captain', 'super_admin')
    and nullif(btrim(ca.display_name), '') is not null
  order by lower(btrim(ca.display_name));
end;
$$;

revoke all on function public.get_notebook_captain_directory() from public, anon;
grant execute on function public.get_notebook_captain_directory() to authenticated;

comment on function public.get_notebook_captain_directory() is
  'Returns active captain and super-admin display names to an authenticated SKOR captain. Emails and roles are not exposed.';
