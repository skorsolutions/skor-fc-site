alter table public.captain_match_debriefs
  add column improvements_since_last_game text;

alter table public.captain_match_debriefs
  add constraint captain_match_debriefs_improvements_since_last_game_check
  check (
    improvements_since_last_game is null
    or char_length(improvements_since_last_game) <= 3000
  );

comment on column public.captain_match_debriefs.improvements_since_last_game is
  'Captain reflection on progress since the previous match and what contributed to it.';
