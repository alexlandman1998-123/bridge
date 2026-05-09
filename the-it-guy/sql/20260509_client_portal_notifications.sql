create extension if not exists "pgcrypto";

create table if not exists public.client_portal_notifications (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  client_portal_token text,
  client_role text not null default 'buyer',
  notification_type text not null,
  title text not null,
  description text,
  priority text not null default 'normal',
  status text not null default 'unread',
  related_entity_type text,
  related_entity_id uuid,
  action_label text,
  action_route text,
  visibility text not null default 'client_visible',
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  read_at timestamptz,
  dismissed_at timestamptz,
  constraint client_portal_notifications_client_role_check
    check (client_role in ('buyer', 'seller', 'shared', 'both')),
  constraint client_portal_notifications_priority_check
    check (priority in ('urgent', 'high', 'normal', 'low', 'informational')),
  constraint client_portal_notifications_status_check
    check (status in ('unread', 'read', 'dismissed')),
  constraint client_portal_notifications_visibility_check
    check (visibility in ('client_visible', 'shared_role_players', 'internal_only'))
);

create index if not exists client_portal_notifications_transaction_idx
  on public.client_portal_notifications (transaction_id, client_role, created_at desc);

create index if not exists client_portal_notifications_status_idx
  on public.client_portal_notifications (status, created_at desc);

create unique index if not exists client_portal_notifications_dedupe_unique_idx
  on public.client_portal_notifications (
    transaction_id,
    client_role,
    notification_type,
    dedupe_key
  );

alter table public.client_portal_notifications enable row level security;

drop policy if exists client_portal_notifications_select_token_scoped on public.client_portal_notifications;
create policy client_portal_notifications_select_token_scoped on public.client_portal_notifications
for select to anon, authenticated
using (
  visibility = 'client_visible'
  and public.bridge_has_client_portal_token_transaction_access(transaction_id)
  and (
    coalesce(client_portal_token, '') = ''
    or coalesce(client_portal_token, '') = public.bridge_client_portal_request_token()
  )
);

drop policy if exists client_portal_notifications_insert_token_scoped on public.client_portal_notifications;
create policy client_portal_notifications_insert_token_scoped on public.client_portal_notifications
for insert to anon, authenticated
with check (
  public.bridge_has_client_portal_token_transaction_access(transaction_id)
  and (
    coalesce(client_portal_token, '') = ''
    or coalesce(client_portal_token, '') = public.bridge_client_portal_request_token()
  )
);

drop policy if exists client_portal_notifications_update_token_scoped on public.client_portal_notifications;
create policy client_portal_notifications_update_token_scoped on public.client_portal_notifications
for update to anon, authenticated
using (
  public.bridge_has_client_portal_token_transaction_access(transaction_id)
  and (
    coalesce(client_portal_token, '') = ''
    or coalesce(client_portal_token, '') = public.bridge_client_portal_request_token()
  )
)
with check (
  public.bridge_has_client_portal_token_transaction_access(transaction_id)
  and (
    coalesce(client_portal_token, '') = ''
    or coalesce(client_portal_token, '') = public.bridge_client_portal_request_token()
  )
);
