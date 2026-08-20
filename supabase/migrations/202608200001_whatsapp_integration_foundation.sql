begin;

create table if not exists public.organisation_communication_channels (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  provider text not null default 'meta',
  channel_type text not null default 'whatsapp',
  waba_id text not null,
  phone_number_id text not null,
  meta_business_id text,
  display_phone_number text,
  business_display_name text,
  connection_status text not null default 'pending',
  verification_status text,
  is_default boolean not null default false,
  meta_access_token text not null,
  meta_webhook_secret text,
  meta_webhook_verify_token text,
  connected_at timestamptz,
  disconnected_at timestamptz,
  last_error_message text,
  last_checked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisation_communication_channels_provider_check
    check (provider in ('meta')),
  constraint organisation_communication_channels_channel_type_check
    check (channel_type in ('whatsapp')),
  constraint organisation_communication_channels_connection_status_check
    check (connection_status in ('pending', 'connected', 'disconnected', 'error')),
  constraint organisation_communication_channels_verification_status_check
    check (verification_status is null or verification_status in (
      'not_verified',
      'verified',
      'pending',
      'disabled',
      'expired'
    ))
);

create unique index if not exists organisation_communication_channels_default_idx
  on public.organisation_communication_channels (
    organisation_id,
    coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
    is_default
  )
  where provider = 'meta' and channel_type = 'whatsapp' and is_default = true;

create index if not exists organisation_communication_channels_org_idx
  on public.organisation_communication_channels (
    organisation_id,
    branch_id,
    connection_status
  )
  where provider = 'meta' and channel_type = 'whatsapp';

create index if not exists organisation_communication_channels_phone_idx
  on public.organisation_communication_channels (organisation_id, phone_number_id)
  where provider = 'meta' and channel_type = 'whatsapp';

create or replace function public.bridge_organisation_communication_channels_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_organisation_communication_channels_updated_at
  on public.organisation_communication_channels;
create trigger trg_organisation_communication_channels_updated_at
before update on public.organisation_communication_channels
for each row execute function public.bridge_organisation_communication_channels_set_updated_at();

alter table public.organisation_communication_channels enable row level security;

drop policy if exists organisation_communication_channels_select_member on public.organisation_communication_channels;
create policy organisation_communication_channels_select_member
  on public.organisation_communication_channels
  for select
  using (public.bridge_is_active_member(organisation_id));

drop policy if exists organisation_communication_channels_manage_admin on public.organisation_communication_channels;
create policy organisation_communication_channels_manage_admin
  on public.organisation_communication_channels
  for all
  using (public.bridge_is_org_admin(organisation_id))
  with check (public.bridge_is_org_admin(organisation_id));

create table if not exists public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete cascade,
  channel text not null default 'whatsapp',
  provider text not null default 'meta',
  event_key text not null,
  internal_key text not null,
  provider_template_name text not null,
  language_code text not null default 'en_US',
  status text not null default 'active',
  is_default boolean not null default false,
  source text not null default 'admin_console',
  created_by uuid references auth.users(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_templates_channel_check
    check (channel in ('whatsapp')),
  constraint notification_templates_provider_check
    check (provider in ('meta')),
  constraint notification_templates_status_check
    check (status in ('active', 'disabled', 'deprecated'))
);

create unique index if not exists notification_templates_global_key_idx
  on public.notification_templates (
    coalesce(organisation_id, '00000000-0000-0000-0000-000000000000'::uuid),
    internal_key
  )
  where provider = 'meta' and channel = 'whatsapp';

create unique index if not exists notification_templates_global_event_idx
  on public.notification_templates (
    coalesce(organisation_id, '00000000-0000-0000-0000-000000000000'::uuid),
    event_key
  )
  where provider = 'meta' and channel = 'whatsapp';

create index if not exists notification_templates_org_idx
  on public.notification_templates (
    organisation_id,
    channel,
    provider,
    status,
    is_default,
    event_key
  )
  where channel = 'whatsapp';

create or replace function public.bridge_notification_templates_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_notification_templates_updated_at
  on public.notification_templates;
create trigger trg_notification_templates_updated_at
before update on public.notification_templates
for each row execute function public.bridge_notification_templates_set_updated_at();

alter table public.notification_templates enable row level security;

drop policy if exists notification_templates_select_member on public.notification_templates;
create policy notification_templates_select_member
  on public.notification_templates
  for select
  using (public.bridge_is_active_member(organisation_id));

drop policy if exists notification_templates_manage_admin on public.notification_templates;
create policy notification_templates_manage_admin
  on public.notification_templates
  for all
  using (public.bridge_is_org_admin(organisation_id))
  with check (public.bridge_is_org_admin(organisation_id));

alter table public.communication_deliveries
  alter column lead_id drop not null;

alter table public.communication_deliveries
  add column if not exists event_key text,
  add column if not exists template_key text,
  add column if not exists related_entity_type text,
  add column if not exists related_entity_id uuid,
  add column if not exists recipient_phone text,
  add column if not exists read_at timestamptz;

drop constraint if exists communication_deliveries_status_check on public.communication_deliveries;
alter table public.communication_deliveries
  add constraint communication_deliveries_status_check
    check (status in ('prepared', 'queued', 'sent', 'delivered', 'read', 'failed', 'skipped'));

create index if not exists communication_deliveries_provider_message_idx
  on public.communication_deliveries (provider, provider_message_id, updated_at desc)
  where provider_message_id is not null;

alter table public.communication_deliveries enable row level security;

create or replace function public.bridge_set_communication_deliveries_updated_at_phase9()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_communication_deliveries_updated_at on public.communication_deliveries;
create trigger trg_communication_deliveries_updated_at
before update on public.communication_deliveries
for each row execute function public.bridge_set_communication_deliveries_updated_at_phase9();

commit;
