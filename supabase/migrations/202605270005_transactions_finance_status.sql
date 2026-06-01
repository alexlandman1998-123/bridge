-- Adds transactions.finance_status used by the newer agent dashboard/bond status
-- aggregation code paths that now read this legacy finance-status field.

alter table if exists public.transactions
  add column if not exists finance_status text;
