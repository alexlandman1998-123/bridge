create table if not exists public.communication_deliveries (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  lead_id uuid not null references public.leads(lead_id) on delete cascade,
  listing_id uuid references public.private_listings(id) on delete set null,
  communication_type text not null,
  channel text not null,
  recipient text not null,
  subject text,
  message_preview text,
  status text not null default 'prepared',
  provider text not null default 'internal',
  provider_message_id text,
  error_message text,
  prepared_by uuid,
  sent_by uuid,
  prepared_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint communication_deliveries_channel_check
    check (channel in ('email', 'whatsapp')),
  constraint communication_deliveries_status_check
    check (status in ('prepared', 'queued', 'sent', 'delivered', 'failed')),
  constraint communication_deliveries_provider_check
    check (provider in ('sendgrid', 'mailgun', 'twilio', 'meta', 'internal')),
  constraint communication_deliveries_recipient_check
    check (length(trim(recipient)) > 0)
);

create index if not exists communication_deliveries_org_idx
  on public.communication_deliveries (organisation_id, created_at desc);

create index if not exists communication_deliveries_lead_idx
  on public.communication_deliveries (organisation_id, lead_id, created_at desc);

create index if not exists communication_deliveries_branch_idx
  on public.communication_deliveries (organisation_id, branch_id, created_at desc);

create index if not exists communication_deliveries_listing_idx
  on public.communication_deliveries (organisation_id, listing_id, created_at desc);

create index if not exists communication_deliveries_status_idx
  on public.communication_deliveries (organisation_id, status, created_at desc);

create index if not exists communication_deliveries_channel_idx
  on public.communication_deliveries (organisation_id, channel, created_at desc);

create table if not exists public.lead_communication_preferences (
  lead_id uuid primary key references public.leads(lead_id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  email_enabled boolean not null default true,
  whatsapp_enabled boolean not null default false,
  marketing_opt_in boolean not null default false,
  property_alerts_enabled boolean not null default true,
  preferred_channel text not null default 'email',
  frequency text not null default 'immediate',
  unsubscribe_token text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_communication_preferences_channel_check
    check (preferred_channel in ('email', 'whatsapp')),
  constraint lead_communication_preferences_frequency_check
    check (frequency in ('immediate', 'daily', 'weekly', 'monthly')),
  constraint lead_communication_preferences_unsubscribe_token_unique
    unique (unsubscribe_token)
);

create index if not exists lead_communication_preferences_org_idx
  on public.lead_communication_preferences (organisation_id, updated_at desc);

create index if not exists lead_communication_preferences_channel_idx
  on public.lead_communication_preferences (organisation_id, preferred_channel);

create or replace function public.bridge_communication_delivery_set_updated_at()
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
for each row execute function public.bridge_communication_delivery_set_updated_at();

drop trigger if exists trg_lead_communication_preferences_updated_at on public.lead_communication_preferences;
create trigger trg_lead_communication_preferences_updated_at
before update on public.lead_communication_preferences
for each row execute function public.bridge_communication_delivery_set_updated_at();

alter table public.communication_deliveries enable row level security;
alter table public.lead_communication_preferences enable row level security;

drop policy if exists communication_deliveries_select_member on public.communication_deliveries;
create policy communication_deliveries_select_member
  on public.communication_deliveries
  for select
  using (
    public.bridge_is_active_member(organisation_id)
    and public.bridge_can_access_workspace_record(organisation_id, branch_id, coalesce(sent_by, prepared_by))
  );

drop policy if exists communication_deliveries_insert_member on public.communication_deliveries;
create policy communication_deliveries_insert_member
  on public.communication_deliveries
  for insert
  with check (
    public.bridge_is_active_member(organisation_id)
    and exists (
      select 1
      from public.leads l
      where l.lead_id = communication_deliveries.lead_id
        and l.organisation_id = communication_deliveries.organisation_id
        and (
          communication_deliveries.branch_id is null
          or l.branch_id = communication_deliveries.branch_id
        )
    )
    and (
      communication_deliveries.branch_id is null
      or exists (
        select 1
        from public.organisation_branches ob
        where ob.id = communication_deliveries.branch_id
          and ob.organisation_id = communication_deliveries.organisation_id
      )
    )
    and (
      communication_deliveries.listing_id is null
      or exists (
        select 1
        from public.private_listings pl
        where pl.id = communication_deliveries.listing_id
          and pl.organisation_id = communication_deliveries.organisation_id
      )
    )
  );

drop policy if exists communication_deliveries_update_member on public.communication_deliveries;
create policy communication_deliveries_update_member
  on public.communication_deliveries
  for update
  using (public.bridge_is_active_member(organisation_id))
  with check (
    public.bridge_is_active_member(organisation_id)
    and public.bridge_can_access_workspace_record(organisation_id, branch_id, coalesce(sent_by, prepared_by))
    and exists (
      select 1
      from public.leads l
      where l.lead_id = communication_deliveries.lead_id
        and l.organisation_id = communication_deliveries.organisation_id
    )
  );

drop policy if exists lead_communication_preferences_select_member on public.lead_communication_preferences;
create policy lead_communication_preferences_select_member
  on public.lead_communication_preferences
  for select
  using (
    public.bridge_is_active_member(organisation_id)
    and exists (
      select 1
      from public.leads l
      where l.lead_id = lead_communication_preferences.lead_id
        and l.organisation_id = lead_communication_preferences.organisation_id
        and public.bridge_can_access_workspace_record(l.organisation_id, l.branch_id, l.assigned_user_id)
    )
  );

drop policy if exists lead_communication_preferences_insert_member on public.lead_communication_preferences;
create policy lead_communication_preferences_insert_member
  on public.lead_communication_preferences
  for insert
  with check (
    public.bridge_is_active_member(organisation_id)
    and exists (
      select 1
      from public.leads l
      where l.lead_id = lead_communication_preferences.lead_id
        and l.organisation_id = lead_communication_preferences.organisation_id
        and public.bridge_can_access_workspace_record(l.organisation_id, l.branch_id, l.assigned_user_id)
    )
  );

drop policy if exists lead_communication_preferences_update_member on public.lead_communication_preferences;
create policy lead_communication_preferences_update_member
  on public.lead_communication_preferences
  for update
  using (public.bridge_is_active_member(organisation_id))
  with check (
    public.bridge_is_active_member(organisation_id)
    and exists (
      select 1
      from public.leads l
      where l.lead_id = lead_communication_preferences.lead_id
        and l.organisation_id = lead_communication_preferences.organisation_id
        and public.bridge_can_access_workspace_record(l.organisation_id, l.branch_id, l.assigned_user_id)
    )
  );
