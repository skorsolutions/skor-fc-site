create index match_strategies_source_lineup_idx
  on public.match_strategies (source_lineup_variation_id)
  where source_lineup_variation_id is not null;

create index match_strategies_created_by_idx
  on public.match_strategies (created_by);
