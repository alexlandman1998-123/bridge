begin;

create extension if not exists "pgcrypto";

create table if not exists public.lead_capture_aliases (
  alias_id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  branch_id uuid references public.organisation_branches(id) on delete set null,
  agent_user_id uuid references public.profiles(id) on delete set null,
  listing_id uuid references public.private_listings(id) on delete set null,
  source text not null default 'General',
  routing_level text not null default 'agency',
  alias_local_part text not null,
  alias_domain text not null default 'leads.arch9.co.za',
  email_address text not null,
  status text not null default 'active',
  metadata_json jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_capture_aliases_routing_level_check check (
    routing_level in ('agency', 'branch', 'agent', 'agent_source', 'listing', 'listing_source')
  ),
  constraint lead_capture_aliases_status_check check (
    status in ('active', 'paused', 'disabled')
  ),
  constraint lead_capture_aliases_email_not_blank check (length(trim(email_address)) > 3)
);

create unique index if not exists lead_capture_aliases_email_unique_idx
  on public.lead_capture_aliases (lower(email_address));
create index if not exists lead_capture_aliases_org_idx
  on public.lead_capture_aliases (organisation_id, status);
create index if not exists lead_capture_aliases_agent_idx
  on public.lead_capture_aliases (organisation_id, agent_user_id)
  where agent_user_id is not null;
create index if not exists lead_capture_aliases_listing_idx
  on public.lead_capture_aliases (organisation_id, listing_id)
  where listing_id is not null;
create index if not exists lead_capture_aliases_source_idx
  on public.lead_capture_aliases (organisation_id, lower(source));

create table if not exists public.inbound_lead_emails (
  email_id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete set null,
  capture_alias_id uuid references public.lead_capture_aliases(alias_id) on delete set null,
  provider text not null default 'unknown',
  provider_message_id text,
  from_email text,
  from_name text,
  reply_to_email text,
  to_addresses text[] not null default '{}'::text[],
  cc_addresses text[] not null default '{}'::text[],
  subject text,
  text_body text,
  html_body text,
  source text,
  external_reference text,
  status text not null default 'received',
  lead_id uuid references public.leads(lead_id) on delete set null,
  contact_id uuid references public.contacts(contact_id) on delete set null,
  error text,
  raw_payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  parsed_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint inbound_lead_emails_status_check check (
    status in ('received', 'parsed', 'processed', 'duplicate', 'failed', 'unmatched')
  )
);

create unique index if not exists inbound_lead_emails_provider_message_unique_idx
  on public.inbound_lead_emails (lower(provider), provider_message_id)
  where provider_message_id is not null and length(trim(provider_message_id)) > 0;
create index if not exists inbound_lead_emails_org_idx
  on public.inbound_lead_emails (organisation_id, received_at desc);
create index if not exists inbound_lead_emails_alias_idx
  on public.inbound_lead_emails (capture_alias_id, received_at desc);
create index if not exists inbound_lead_emails_status_idx
  on public.inbound_lead_emails (status, received_at desc);
create index if not exists inbound_lead_emails_lead_idx
  on public.inbound_lead_emails (lead_id)
  where lead_id is not null;

create table if not exists public.lead_parse_failures (
  failure_id uuid primary key default gen_random_uuid(),
  inbound_email_id uuid references public.inbound_lead_emails(email_id) on delete cascade,
  organisation_id uuid references public.organisations(id) on delete set null,
  capture_alias_id uuid references public.lead_capture_aliases(alias_id) on delete set null,
  source text,
  reason text not null,
  status text not null default 'open',
  payload jsonb not null default '{}'::jsonb,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint lead_parse_failures_status_check check (
    status in ('open', 'resolved', 'ignored')
  )
);

create index if not exists lead_parse_failures_org_idx
  on public.lead_parse_failures (organisation_id, status, created_at desc);
create index if not exists lead_parse_failures_inbound_email_idx
  on public.lead_parse_failures (inbound_email_id);

alter table public.lead_capture_aliases enable row level security;
alter table public.inbound_lead_emails enable row level security;
alter table public.lead_parse_failures enable row level security;

drop policy if exists lead_capture_aliases_select_member on public.lead_capture_aliases;
create policy lead_capture_aliases_select_member
on public.lead_capture_aliases
for select
to authenticated
using (public.bridge_is_active_member(organisation_id));

drop policy if exists lead_capture_aliases_insert_member_or_admin on public.lead_capture_aliases;
create policy lead_capture_aliases_insert_member_or_admin
on public.lead_capture_aliases
for insert
to authenticated
with check (
  public.bridge_is_org_admin(organisation_id)
  or (
    public.bridge_is_active_member(organisation_id)
    and (agent_user_id is null or agent_user_id = auth.uid())
  )
);

drop policy if exists lead_capture_aliases_update_admin_or_owner on public.lead_capture_aliases;
create policy lead_capture_aliases_update_admin_or_owner
on public.lead_capture_aliases
for update
to authenticated
using (
  public.bridge_is_org_admin(organisation_id)
  or (
    public.bridge_is_active_member(organisation_id)
    and agent_user_id = auth.uid()
  )
)
with check (
  public.bridge_is_org_admin(organisation_id)
  or (
    public.bridge_is_active_member(organisation_id)
    and agent_user_id = auth.uid()
  )
);

drop policy if exists lead_capture_aliases_delete_admin on public.lead_capture_aliases;
create policy lead_capture_aliases_delete_admin
on public.lead_capture_aliases
for delete
to authenticated
using (public.bridge_is_org_admin(organisation_id));

drop policy if exists inbound_lead_emails_select_member on public.inbound_lead_emails;
create policy inbound_lead_emails_select_member
on public.inbound_lead_emails
for select
to authenticated
using (organisation_id is not null and public.bridge_is_active_member(organisation_id));

drop policy if exists inbound_lead_emails_update_member on public.inbound_lead_emails;
create policy inbound_lead_emails_update_member
on public.inbound_lead_emails
for update
to authenticated
using (organisation_id is not null and public.bridge_is_active_member(organisation_id))
with check (organisation_id is not null and public.bridge_is_active_member(organisation_id));

drop policy if exists lead_parse_failures_select_member on public.lead_parse_failures;
create policy lead_parse_failures_select_member
on public.lead_parse_failures
for select
to authenticated
using (organisation_id is not null and public.bridge_is_active_member(organisation_id));

drop policy if exists lead_parse_failures_update_member on public.lead_parse_failures;
create policy lead_parse_failures_update_member
on public.lead_parse_failures
for update
to authenticated
using (organisation_id is not null and public.bridge_is_active_member(organisation_id))
with check (organisation_id is not null and public.bridge_is_active_member(organisation_id));

create or replace function public.bridge_touch_lead_capture_aliases_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_bridge_touch_lead_capture_aliases_updated_at on public.lead_capture_aliases;
create trigger trg_bridge_touch_lead_capture_aliases_updated_at
before update on public.lead_capture_aliases
for each row
execute function public.bridge_touch_lead_capture_aliases_updated_at();

create or replace function public.bridge_normalize_lead_capture_email(p_email text)
returns text
language sql
immutable
as $$
  select lower(trim(regexp_replace(coalesce(p_email, ''), '^.*<([^>]+)>.*$', '\1')));
$$;

create or replace function public.bridge_lead_capture_slug(p_value text, p_fallback text default 'lead')
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(
      regexp_replace(
        regexp_replace(lower(trim(coalesce(p_value, p_fallback, 'lead'))), '[^a-z0-9]+', '-', 'g'),
        '(^-|-$)',
        '',
        'g'
      ),
      ''
    ),
    'lead'
  );
$$;

create or replace function public.bridge_create_lead_capture_alias(
  p_organisation_id uuid,
  p_agent_user_id uuid default null,
  p_branch_id uuid default null,
  p_listing_id uuid default null,
  p_source text default 'General',
  p_routing_level text default 'agency',
  p_alias_domain text default 'leads.arch9.co.za',
  p_metadata jsonb default '{}'::jsonb
)
returns public.lead_capture_aliases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text := coalesce(nullif(trim(p_source), ''), 'General');
  v_routing_level text := coalesce(nullif(trim(p_routing_level), ''), 'agency');
  v_domain text := lower(coalesce(nullif(trim(p_alias_domain), ''), 'leads.arch9.co.za'));
  v_prefix text;
  v_token text;
  v_local_part text;
  v_email text;
  v_existing public.lead_capture_aliases%rowtype;
  v_created public.lead_capture_aliases%rowtype;
begin
  if p_organisation_id is null then
    raise exception 'organisation_id is required';
  end if;

  if v_routing_level not in ('agency', 'branch', 'agent', 'agent_source', 'listing', 'listing_source') then
    raise exception 'unsupported lead capture routing level: %', v_routing_level;
  end if;

  if coalesce(auth.role(), '') <> 'service_role' then
    if not public.bridge_is_active_member(p_organisation_id) then
      raise exception 'not allowed to create lead capture aliases for this organisation';
    end if;

    if p_agent_user_id is not null
      and p_agent_user_id <> auth.uid()
      and not public.bridge_is_org_admin(p_organisation_id) then
      raise exception 'only organisation admins can create aliases for another agent';
    end if;
  end if;

  v_prefix := public.bridge_lead_capture_slug(v_source, v_routing_level);
  v_token := substring(md5(
    p_organisation_id::text
    || coalesce(p_agent_user_id::text, '')
    || coalesce(p_branch_id::text, '')
    || coalesce(p_listing_id::text, '')
    || lower(v_source)
    || lower(v_routing_level)
  ) from 1 for 10);
  v_local_part := left(v_prefix || '-' || v_token, 64);
  v_email := lower(v_local_part || '@' || v_domain);

  select *
  into v_existing
  from public.lead_capture_aliases
  where lower(email_address) = v_email
  limit 1;

  if found then
    return v_existing;
  end if;

  insert into public.lead_capture_aliases (
    organisation_id,
    branch_id,
    agent_user_id,
    listing_id,
    source,
    routing_level,
    alias_local_part,
    alias_domain,
    email_address,
    metadata_json,
    created_by
  )
  values (
    p_organisation_id,
    p_branch_id,
    p_agent_user_id,
    p_listing_id,
    v_source,
    v_routing_level,
    v_local_part,
    v_domain,
    v_email,
    coalesce(p_metadata, '{}'::jsonb),
    auth.uid()
  )
  returning *
  into v_created;

  return v_created;
end;
$$;

grant select, insert, update, delete on public.lead_capture_aliases to authenticated;
grant select, update on public.inbound_lead_emails to authenticated;
grant select, update on public.lead_parse_failures to authenticated;
grant execute on function public.bridge_create_lead_capture_alias(uuid, uuid, uuid, uuid, text, text, text, jsonb) to authenticated;

commit;
