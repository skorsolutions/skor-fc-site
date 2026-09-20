alter table public.captain_notebook_entries
  add column source text not null default 'manual',
  add column attributed_captain_name text,
  add column source_occurred_at timestamp with time zone,
  add column ai_organized boolean not null default false;

alter table public.captain_notebook_entries
  add constraint captain_notebook_entries_source_check
    check (source in ('manual', 'whatsapp', 'ai_pregame')),
  add constraint captain_notebook_entries_attributed_captain_name_check
    check (
      attributed_captain_name is null
      or (
        char_length(btrim(attributed_captain_name)) >= 1
        and char_length(btrim(attributed_captain_name)) <= 160
      )
    ),
  add constraint captain_notebook_entries_whatsapp_attribution_check
    check (
      source <> 'whatsapp'
      or (
        match_id is not null
        and attributed_captain_name is not null
        and source_occurred_at is not null
      )
    );

comment on column public.captain_notebook_entries.source is
  'Origin of the note: manual Captain Notebook entry, WhatsApp import, or saved AI pregame talk.';

comment on column public.captain_notebook_entries.attributed_captain_name is
  'Captain who originally authored an imported message; created_by remains the authenticated importer.';

comment on column public.captain_notebook_entries.source_occurred_at is
  'Original message timestamp for an imported note.';

comment on column public.captain_notebook_entries.ai_organized is
  'True when AI organized the captain-provided text before the authenticated captain reviewed and saved it.';
