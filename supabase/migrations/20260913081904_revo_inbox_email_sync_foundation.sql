begin;

-- Provider identifiers make inbound import idempotent and preserve provider
-- threading without putting raw provider payloads in the shared inbox tables.
alter table public.revo_inbox_conversations
  add column provider_key text,
  add column provider_thread_id text;

create unique index revo_inbox_conversations_provider_thread_key
  on public.revo_inbox_conversations (organisation_id, channel_id, provider_key, provider_thread_id)
  where provider_key is not null and provider_thread_id is not null;

create table public.revo_inbox_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  connection_id uuid not null references public.revo_inbox_provider_connections(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  status text not null check (status in ('running', 'completed', 'failed')),
  imported_count integer not null default 0 check (imported_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index revo_inbox_sync_runs_connection_created_at_idx
  on public.revo_inbox_sync_runs (connection_id, created_at desc);

alter table public.revo_inbox_sync_runs enable row level security;
grant select on public.revo_inbox_sync_runs to authenticated;
create policy revo_inbox_sync_runs_member_read
on public.revo_inbox_sync_runs for select to authenticated
using (
  organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid
  and public.bridge_is_active_member(organisation_id)
);

comment on table public.revo_inbox_sync_runs is
  'Revo-only audit summary for server-side inbound provider syncs. No raw provider payload or OAuth credential is stored.';

commit;
