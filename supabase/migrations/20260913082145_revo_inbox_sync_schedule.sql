begin;

-- Scheduling state is metadata only: provider credentials remain in Vault and
-- scheduled execution is enabled only after an explicit deployment decision.
alter table public.revo_inbox_provider_connections
  add column sync_interval_minutes integer not null default 15
    check (sync_interval_minutes between 5 and 1440),
  add column next_sync_at timestamptz,
  add column sync_locked_until timestamptz;

create index revo_inbox_provider_connections_due_sync_idx
  on public.revo_inbox_provider_connections (next_sync_at asc)
  where status = 'connected';

comment on column public.revo_inbox_provider_connections.next_sync_at is
  'Next eligible automated inbox sync. A server-only scheduler claims this work with a bounded lease.';
comment on column public.revo_inbox_provider_connections.sync_locked_until is
  'Short server-only sync lease preventing overlapping provider imports.';

commit;
