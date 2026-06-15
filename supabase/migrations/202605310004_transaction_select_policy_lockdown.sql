begin;
drop policy if exists transactions_select_phase5b_scoped on public.transactions;
drop policy if exists transaction_events_select_phase5b_scoped on public.transaction_events;
notify pgrst, 'reload schema';
commit;
