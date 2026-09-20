alter table public.captain_notebook_entries
  add column source_batch_id uuid,
  add column source_sequence integer;

alter table public.captain_notebook_entries
  add constraint captain_notebook_entries_source_batch_check
    check (source_batch_id is null or source = 'whatsapp'),
  add constraint captain_notebook_entries_source_sequence_check
    check (source_sequence is null or source_sequence >= 0),
  add constraint captain_notebook_entries_source_order_pair_check
    check ((source_batch_id is null) = (source_sequence is null));

create index captain_notebook_entries_whatsapp_game_thread_idx
  on public.captain_notebook_entries (match_id, source_occurred_at, source_batch_id, source_sequence)
  where source = 'whatsapp';

create unique index captain_notebook_entries_whatsapp_batch_sequence_uidx
  on public.captain_notebook_entries (source_batch_id, source_sequence)
  where source_batch_id is not null;

comment on column public.captain_notebook_entries.source_batch_id is
  'Stable identifier shared by messages imported from the same WhatsApp paste batch.';

comment on column public.captain_notebook_entries.source_sequence is
  'Original zero-based message order within a WhatsApp paste batch.';

create table public.captain_notebook_attachments (
  id uuid primary key default gen_random_uuid(),
  notebook_entry_id uuid not null references public.captain_notebook_entries(id) on delete cascade,
  storage_path text not null unique,
  attachment_type text not null default 'historical_lineup',
  original_file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  created_by uuid not null references auth.users(id),
  created_at timestamp with time zone not null default now(),
  constraint captain_notebook_attachments_type_check
    check (attachment_type in ('historical_lineup')),
  constraint captain_notebook_attachments_file_name_check
    check (char_length(btrim(original_file_name)) between 1 and 255),
  constraint captain_notebook_attachments_mime_check
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')),
  constraint captain_notebook_attachments_size_check
    check (file_size_bytes between 1 and 8388608)
);

create index captain_notebook_attachments_entry_idx
  on public.captain_notebook_attachments (notebook_entry_id);

alter table public.captain_notebook_attachments enable row level security;

revoke all on table public.captain_notebook_attachments from public, anon;
grant select, insert, delete on table public.captain_notebook_attachments to authenticated;

create policy "Captains read allowed notebook attachments"
  on public.captain_notebook_attachments
  for select
  to authenticated
  using (
    (select public.is_skor_captain())
    and exists (
      select 1
      from public.captain_notebook_entries entry
      where entry.id = notebook_entry_id
        and (entry.visibility = 'captains' or entry.created_by = (select auth.uid()))
    )
  );

create policy "Captains attach media to their own notebook entries"
  on public.captain_notebook_attachments
  for insert
  to authenticated
  with check (
    (select public.is_skor_captain())
    and created_by = (select auth.uid())
    and exists (
      select 1
      from public.captain_notebook_entries entry
      where entry.id = notebook_entry_id
        and entry.created_by = (select auth.uid())
    )
  );

create policy "Captains delete their own notebook attachments"
  on public.captain_notebook_attachments
  for delete
  to authenticated
  using (
    (select public.is_skor_captain())
    and created_by = (select auth.uid())
  );

comment on table public.captain_notebook_attachments is
  'Private historical media attached to Captain Notebook entries, including pre-app lineup images.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'captain-notebook-media',
  'captain-notebook-media',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Captains upload their own notebook media"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'captain-notebook-media'
    and (select public.is_skor_captain())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Captains read allowed notebook media"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'captain-notebook-media'
    and (select public.is_skor_captain())
    and exists (
      select 1
      from public.captain_notebook_attachments attachment
      join public.captain_notebook_entries entry
        on entry.id = attachment.notebook_entry_id
      where attachment.storage_path = name
        and (entry.visibility = 'captains' or entry.created_by = (select auth.uid()))
    )
  );

create policy "Captains delete their own notebook media"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'captain-notebook-media'
    and (select public.is_skor_captain())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
