begin;

set local lock_timeout = '3s';

set local statement_timeout = '10s';

-- Cash deals have no mortgage manager. Unfinished bond drafts may also leave
-- this decision unresolved; the existing readiness rules still require it
-- before bond handoff. Retain the existing value check, default and RLS.
alter table public.transactions
  alter column finance_managed_by drop not null;

commit;
