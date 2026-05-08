begin;

alter table if exists public.transactions
  add column if not exists gross_commission_percentage numeric(6,3) check (gross_commission_percentage is null or (gross_commission_percentage >= 0 and gross_commission_percentage <= 100));

alter table if exists public.transactions
  add column if not exists gross_commission_amount numeric(14,2);

alter table if exists public.transactions
  add column if not exists agent_split_percentage_snapshot numeric(6,3) check (agent_split_percentage_snapshot is null or (agent_split_percentage_snapshot >= 0 and agent_split_percentage_snapshot <= 100));

alter table if exists public.transactions
  add column if not exists agency_split_percentage_snapshot numeric(6,3) check (agency_split_percentage_snapshot is null or (agency_split_percentage_snapshot >= 0 and agency_split_percentage_snapshot <= 100));

alter table if exists public.transactions
  add column if not exists agent_commission_amount numeric(14,2);

alter table if exists public.transactions
  add column if not exists agency_commission_amount numeric(14,2);

create index if not exists transactions_commission_snapshot_idx
  on public.transactions (gross_commission_amount, agent_commission_amount, agency_commission_amount);

commit;
