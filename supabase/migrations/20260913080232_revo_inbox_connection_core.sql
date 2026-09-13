begin;

-- Provider-neutral OAuth connection registry. Access and refresh tokens never
-- belong in public tables or browser-visible API responses.
create table public.revo_inbox_provider_connections (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  channel_id uuid not null,
  provider_key text not null check (provider_key in ('microsoft_365', 'google_workspace')),
  connection_kind text not null check (connection_kind in ('individual_mailbox', 'delegated_shared_mailbox')),
  mailbox_address text not null check (char_length(btrim(mailbox_address)) > 0),
  provider_account_id text,
  status text not null default 'draft'
    check (status in ('draft', 'authorizing', 'connected', 'expired', 'error', 'disconnected')),
  granted_scopes text[] not null default '{}'::text[],
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz,
  last_verified_at timestamptz,
  last_sync_at timestamptz,
  last_error_code text,
  disconnected_at timestamptz,
  disconnected_by uuid references public.profiles(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organisation_id),
  unique (channel_id),
  unique (organisation_id, provider_key, mailbox_address),
  foreign key (channel_id, organisation_id)
    references public.revo_inbox_channels (id, organisation_id)
    on delete cascade,
  check ((status = 'connected' and connected_at is not null) or status <> 'connected'),
  check (last_error_code is null or char_length(btrim(last_error_code)) > 0)
);

create index revo_inbox_provider_connections_organisation_status_idx
  on public.revo_inbox_provider_connections (organisation_id, status, updated_at desc);
create index revo_inbox_provider_connections_channel_idx
  on public.revo_inbox_provider_connections (channel_id);

create table public.revo_inbox_connection_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  connection_id uuid not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('authorization_started', 'authorization_completed', 'authorization_failed', 'token_refreshed', 'health_checked', 'disconnected')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (connection_id, organisation_id)
    references public.revo_inbox_provider_connections (id, organisation_id)
    on delete cascade
);

create index revo_inbox_connection_events_connection_created_at_idx
  on public.revo_inbox_connection_events (connection_id, created_at desc);

-- Only server-side connector code may look up the associated Vault secret.
-- The private schema is not exposed through the Supabase Data API.
create schema if not exists private;
create table private.revo_inbox_connection_credentials (
  connection_id uuid primary key references public.revo_inbox_provider_connections(id) on delete cascade,
  vault_secret_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
revoke all on table private.revo_inbox_connection_credentials from public;

create trigger revo_inbox_provider_connections_set_updated_at
before update on public.revo_inbox_provider_connections
for each row execute function public.set_updated_at_timestamp();

alter table public.revo_inbox_provider_connections enable row level security;
alter table public.revo_inbox_connection_events enable row level security;

grant select on public.revo_inbox_provider_connections to authenticated;
grant select on public.revo_inbox_connection_events to authenticated;

create policy revo_inbox_provider_connections_member_read
on public.revo_inbox_provider_connections for select to authenticated
using (
  organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid
  and public.bridge_is_active_member(organisation_id)
);

create policy revo_inbox_connection_events_member_read
on public.revo_inbox_connection_events for select to authenticated
using (
  organisation_id = '322c3853-2d82-4413-97e6-b4cd8bc32a7c'::uuid
  and public.bridge_is_active_member(organisation_id)
);

comment on table public.revo_inbox_provider_connections is
  'Revo-only provider connection metadata. OAuth tokens and secrets are excluded from this public table.';
comment on table public.revo_inbox_connection_events is
  'Revo-only provider connection audit events. Metadata must never contain OAuth codes, tokens, or secrets.';
comment on table private.revo_inbox_connection_credentials is
  'Server-only map from a Revo provider connection to its Supabase Vault secret identifier.';

commit;
