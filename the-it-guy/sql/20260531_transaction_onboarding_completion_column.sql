begin;

alter table if exists public.transactions
  add column if not exists onboarding_completed_at timestamptz;

notify pgrst, 'reload schema';

commit;
