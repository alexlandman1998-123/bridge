-- The transaction workspace selects this canonical workflow field for every
-- transaction. Some production environments predate the workflow migration,
-- which causes the entire core-data request to fail at the PostgREST layer.
alter table public.transactions
  add column if not exists current_detailed_stage text;

-- Make the repaired column visible to the Data API immediately.
notify pgrst, 'reload schema';
