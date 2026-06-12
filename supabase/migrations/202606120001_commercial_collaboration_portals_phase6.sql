begin;

create extension if not exists "pgcrypto";

alter table if exists public.commercial_portal_contacts
  add column if not exists company_id uuid references public.commercial_companies(id) on delete set null,
  add column if not exists commercial_contact_id uuid references public.commercial_contacts(id) on delete set null,
  add column if not exists invitation_status text not null default 'invited',
  add column if not exists accepted_at timestamptz,
  add column if not exists password_set_at timestamptz,
  add column if not exists last_login_at timestamptz,
  add column if not exists disabled_at timestamptz,
  add column if not exists disabled_by uuid references auth.users(id) on delete set null;

alter table if exists public.commercial_portal_access
  add column if not exists company_id uuid references public.commercial_companies(id) on delete set null,
  add column if not exists commercial_contact_id uuid references public.commercial_contacts(id) on delete set null,
  add column if not exists listing_id uuid references public.commercial_listings(id) on delete set null,
  add column if not exists accepted_at timestamptz,
  add column if not exists password_set_at timestamptz,
  add column if not exists disabled_at timestamptz,
  add column if not exists disabled_by uuid references auth.users(id) on delete set null,
  add column if not exists last_activity_at timestamptz,
  add column if not exists email_last_sent_at timestamptz,
  add column if not exists email_delivery_status text;

alter table if exists public.commercial_portal_messages
  add column if not exists company_id uuid references public.commercial_companies(id) on delete set null,
  add column if not exists commercial_contact_id uuid references public.commercial_contacts(id) on delete set null,
  add column if not exists requirement_id uuid references public.commercial_requirements(id) on delete set null,
  add column if not exists deal_id uuid references public.commercial_deals(id) on delete set null,
  add column if not exists transaction_id uuid references public.commercial_transactions(id) on delete set null;

alter table if exists public.commercial_portal_notifications
  add column if not exists company_id uuid references public.commercial_companies(id) on delete set null,
  add column if not exists commercial_contact_id uuid references public.commercial_contacts(id) on delete set null,
  add column if not exists email_status text,
  add column if not exists emailed_at timestamptz;

alter table if exists public.commercial_portal_contacts
  drop constraint if exists commercial_portal_contacts_role_check;
alter table if exists public.commercial_portal_contacts
  add constraint commercial_portal_contacts_role_check
  check (portal_role in ('tenant', 'landlord', 'buyer', 'seller', 'investor', 'property_manager', 'corporate_contact'));

alter table if exists public.commercial_portal_access
  drop constraint if exists commercial_portal_access_role_check;
alter table if exists public.commercial_portal_access
  add constraint commercial_portal_access_role_check
  check (portal_role in ('tenant', 'landlord', 'buyer', 'seller', 'investor', 'property_manager', 'corporate_contact'));

alter table if exists public.commercial_portal_messages
  drop constraint if exists commercial_portal_messages_role_check;
alter table if exists public.commercial_portal_messages
  add constraint commercial_portal_messages_role_check
  check (portal_role in ('tenant', 'landlord', 'buyer', 'seller', 'investor', 'property_manager', 'corporate_contact'));

alter table if exists public.commercial_portal_notifications
  drop constraint if exists commercial_portal_notifications_role_check;
alter table if exists public.commercial_portal_notifications
  add constraint commercial_portal_notifications_role_check
  check (portal_role in ('tenant', 'landlord', 'buyer', 'seller', 'investor', 'property_manager', 'corporate_contact'));

alter table if exists public.commercial_portal_contacts
  drop constraint if exists commercial_portal_contacts_invitation_status_check;
alter table if exists public.commercial_portal_contacts
  add constraint commercial_portal_contacts_invitation_status_check
  check (invitation_status in ('invited', 'accepted', 'disabled', 'revoked', 'expired'));

alter table if exists public.commercial_portal_access
  drop constraint if exists commercial_portal_access_email_delivery_status_check;
alter table if exists public.commercial_portal_access
  add constraint commercial_portal_access_email_delivery_status_check
  check (email_delivery_status is null or email_delivery_status in ('pending', 'sent', 'failed', 'skipped'));

create table if not exists public.commercial_portal_audit_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  access_id uuid references public.commercial_portal_access(id) on delete set null,
  contact_id uuid references public.commercial_portal_contacts(id) on delete set null,
  company_id uuid references public.commercial_companies(id) on delete set null,
  commercial_contact_id uuid references public.commercial_contacts(id) on delete set null,
  commercial_transaction_id text,
  portal_role text not null default 'tenant',
  event_type text not null,
  event_title text,
  related_entity_type text,
  related_entity_id uuid,
  actor_type text not null default 'portal_user',
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint commercial_portal_audit_events_role_check
    check (portal_role in ('tenant', 'landlord', 'buyer', 'seller', 'investor', 'property_manager', 'corporate_contact')),
  constraint commercial_portal_audit_events_actor_type_check
    check (actor_type in ('portal_user', 'broker', 'system'))
);

create index if not exists commercial_portal_contacts_company_idx
  on public.commercial_portal_contacts (organisation_id, company_id, commercial_contact_id);
create index if not exists commercial_portal_access_company_idx
  on public.commercial_portal_access (organisation_id, company_id, commercial_contact_id, status);
create index if not exists commercial_portal_access_listing_idx
  on public.commercial_portal_access (organisation_id, listing_id, status);
create index if not exists commercial_portal_access_activity_idx
  on public.commercial_portal_access (organisation_id, status, last_activity_at desc, created_at desc);
create index if not exists commercial_portal_messages_context_idx
  on public.commercial_portal_messages (organisation_id, transaction_id, requirement_id, deal_id, created_at desc);
create index if not exists commercial_portal_notifications_context_idx
  on public.commercial_portal_notifications (organisation_id, access_id, status, created_at desc);
create index if not exists commercial_portal_audit_events_access_idx
  on public.commercial_portal_audit_events (access_id, created_at desc);
create index if not exists commercial_portal_audit_events_org_idx
  on public.commercial_portal_audit_events (organisation_id, created_at desc);

update public.commercial_portal_access cpa
set
  company_id = coalesce(cpa.company_id, ct.company_id),
  commercial_contact_id = coalesce(cpa.commercial_contact_id, ct.contact_id),
  listing_id = coalesce(cpa.listing_id, ct.listing_id)
from public.commercial_transactions ct
where cpa.commercial_transaction_id = ct.id::text;

update public.commercial_portal_contacts cpc
set
  company_id = coalesce(cpc.company_id, cpa.company_id),
  commercial_contact_id = coalesce(cpc.commercial_contact_id, cpa.commercial_contact_id)
from public.commercial_portal_access cpa
where cpc.id = cpa.contact_id;

create or replace function public.bridge_commercial_portal_token()
returns text
language plpgsql
stable
as $$
declare
  v_headers jsonb;
begin
  begin
    v_headers := current_setting('request.headers', true)::jsonb;
  exception when others then
    return null;
  end;

  return nullif(v_headers ->> 'x-bridge-commercial-portal-token', '');
end;
$$;

create or replace function public.bridge_commercial_portal_has_access(
  p_organisation_id uuid,
  p_entity_type text,
  p_entity_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.commercial_portal_access cpa
    where cpa.organisation_id = p_organisation_id
      and cpa.token = public.bridge_commercial_portal_token()
      and cpa.status = 'active'
      and (cpa.expires_at is null or cpa.expires_at > now())
      and (
        (p_entity_type = 'commercial_transaction' and cpa.commercial_transaction_id = p_entity_id::text)
        or (p_entity_type = 'commercial_deal' and cpa.deal_id = p_entity_id)
        or (p_entity_type = 'commercial_heads_of_terms' and cpa.heads_of_terms_id = p_entity_id)
        or (p_entity_type = 'commercial_lease' and cpa.lease_id = p_entity_id)
        or (p_entity_type = 'commercial_requirement' and cpa.requirement_id = p_entity_id)
        or (p_entity_type = 'commercial_tenant' and cpa.tenant_id = p_entity_id)
        or (p_entity_type = 'commercial_landlord' and cpa.landlord_id = p_entity_id)
        or (p_entity_type = 'commercial_property' and cpa.property_id = p_entity_id)
        or (p_entity_type = 'commercial_vacancy' and cpa.vacancy_id = p_entity_id)
        or (p_entity_type = 'commercial_listing' and cpa.listing_id = p_entity_id)
        or (p_entity_type = 'commercial_company' and cpa.company_id = p_entity_id)
        or (p_entity_type = 'commercial_contact' and cpa.commercial_contact_id = p_entity_id)
      )
  );
$$;

grant execute on function public.bridge_commercial_portal_token() to anon, authenticated;
grant execute on function public.bridge_commercial_portal_has_access(uuid, text, uuid) to anon, authenticated;

alter table public.commercial_portal_audit_events enable row level security;

drop policy if exists commercial_portal_audit_events_internal_manage on public.commercial_portal_audit_events;
create policy commercial_portal_audit_events_internal_manage
  on public.commercial_portal_audit_events
  for all to authenticated
  using (exists (select 1 from public.bridge_commercial_user_scope(organisation_id)))
  with check (exists (select 1 from public.bridge_commercial_user_scope(organisation_id)));

drop policy if exists commercial_portal_audit_events_token_insert on public.commercial_portal_audit_events;
create policy commercial_portal_audit_events_token_insert
  on public.commercial_portal_audit_events
  for insert to anon, authenticated
  with check (
    exists (
      select 1
      from public.commercial_portal_access cpa
      where cpa.id = access_id
        and cpa.organisation_id = commercial_portal_audit_events.organisation_id
        and cpa.token = public.bridge_commercial_portal_token()
        and cpa.status = 'active'
        and (cpa.expires_at is null or cpa.expires_at > now())
    )
  );

drop policy if exists commercial_transactions_portal_select on public.commercial_transactions;
create policy commercial_transactions_portal_select on public.commercial_transactions
for select to anon, authenticated
using (public.bridge_commercial_portal_has_access(organisation_id, 'commercial_transaction', id));

drop policy if exists commercial_companies_portal_select on public.commercial_companies;
create policy commercial_companies_portal_select on public.commercial_companies
for select to anon, authenticated
using (public.bridge_commercial_portal_has_access(organisation_id, 'commercial_company', id));

drop policy if exists commercial_contacts_portal_select on public.commercial_contacts;
create policy commercial_contacts_portal_select on public.commercial_contacts
for select to anon, authenticated
using (public.bridge_commercial_portal_has_access(organisation_id, 'commercial_contact', id));

drop policy if exists commercial_listings_portal_select on public.commercial_listings;
create policy commercial_listings_portal_select on public.commercial_listings
for select to anon, authenticated
using (public.bridge_commercial_portal_has_access(organisation_id, 'commercial_listing', id));

drop policy if exists commercial_viewings_portal_select on public.commercial_viewings;
create policy commercial_viewings_portal_select on public.commercial_viewings
for select to anon, authenticated
using (
  public.bridge_commercial_portal_has_access(organisation_id, 'commercial_requirement', requirement_id)
  or public.bridge_commercial_portal_has_access(organisation_id, 'commercial_property', property_id)
  or public.bridge_commercial_portal_has_access(organisation_id, 'commercial_vacancy', vacancy_id)
  or public.bridge_commercial_portal_has_access(organisation_id, 'commercial_listing', listing_id)
  or public.bridge_commercial_portal_has_access(organisation_id, 'commercial_company', company_id)
  or public.bridge_commercial_portal_has_access(organisation_id, 'commercial_contact', contact_id)
);

drop policy if exists commercial_documents_portal_select on public.commercial_documents;
create policy commercial_documents_portal_select on public.commercial_documents
for select to anon, authenticated
using (
  archived_at is null
  and coalesce(status, 'uploaded') not in ('archived', 'superseded')
  and public.bridge_commercial_portal_has_access(organisation_id, entity_type, entity_id)
);

drop policy if exists commercial_documents_portal_insert on public.commercial_documents;
create policy commercial_documents_portal_insert on public.commercial_documents
for insert to anon, authenticated
with check (
  public.bridge_commercial_portal_has_access(organisation_id, entity_type, entity_id)
);

drop policy if exists commercial_document_requests_portal_select on public.commercial_document_requests;
create policy commercial_document_requests_portal_select on public.commercial_document_requests
for select to anon, authenticated
using (public.bridge_commercial_portal_has_access(organisation_id, entity_type, entity_id));

drop policy if exists commercial_document_requests_portal_update on public.commercial_document_requests;
create policy commercial_document_requests_portal_update on public.commercial_document_requests
for update to anon, authenticated
using (public.bridge_commercial_portal_has_access(organisation_id, entity_type, entity_id))
with check (public.bridge_commercial_portal_has_access(organisation_id, entity_type, entity_id));

grant select, insert, update on public.commercial_portal_audit_events to anon, authenticated;

commit;
