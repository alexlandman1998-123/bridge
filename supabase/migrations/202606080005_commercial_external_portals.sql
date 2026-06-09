create table if not exists public.commercial_portal_contacts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  commercial_transaction_id text,
  portal_role text not null default 'tenant',
  entity_type text,
  entity_id uuid,
  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  company_name text,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_portal_contacts_role_check check (portal_role in ('tenant', 'landlord', 'property_manager', 'corporate_contact')),
  constraint commercial_portal_contacts_status_check check (status in ('active', 'inactive', 'archived'))
);

create table if not exists public.commercial_portal_access (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  contact_id uuid references public.commercial_portal_contacts(id) on delete cascade,
  commercial_transaction_id text not null,
  portal_role text not null default 'tenant',
  token text not null unique,
  status text not null default 'active',
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  last_opened_at timestamptz,
  invitation_sent_at timestamptz,
  visibility jsonb not null default '{"documents": true, "timeline": true, "messages": true, "lease": true}'::jsonb,
  deal_id uuid,
  heads_of_terms_id uuid,
  lease_id uuid,
  requirement_id uuid,
  tenant_id uuid,
  landlord_id uuid,
  property_id uuid,
  vacancy_id uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_portal_access_role_check check (portal_role in ('tenant', 'landlord', 'property_manager', 'corporate_contact')),
  constraint commercial_portal_access_status_check check (status in ('active', 'revoked', 'expired', 'disabled'))
);

create table if not exists public.commercial_portal_messages (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  access_id uuid references public.commercial_portal_access(id) on delete set null,
  commercial_transaction_id text not null,
  portal_role text not null default 'tenant',
  sender_role text not null default 'external',
  sender_name text,
  sender_email text,
  message_body text not null,
  status text not null default 'open',
  visibility text not null default 'broker_visible',
  linked_entity_type text,
  linked_entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_portal_messages_role_check check (portal_role in ('tenant', 'landlord', 'property_manager', 'corporate_contact')),
  constraint commercial_portal_messages_sender_role_check check (sender_role in ('external', 'broker', 'system')),
  constraint commercial_portal_messages_status_check check (status in ('open', 'read', 'responded', 'archived')),
  constraint commercial_portal_messages_visibility_check check (visibility in ('client_visible', 'broker_visible', 'internal_only'))
);

create table if not exists public.commercial_portal_notifications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  access_id uuid references public.commercial_portal_access(id) on delete cascade,
  commercial_transaction_id text not null,
  portal_role text not null default 'tenant',
  notification_type text not null default 'update',
  title text not null,
  description text,
  status text not null default 'unread',
  priority text not null default 'normal',
  action_route text,
  related_entity_type text,
  related_entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_portal_notifications_role_check check (portal_role in ('tenant', 'landlord', 'property_manager', 'corporate_contact')),
  constraint commercial_portal_notifications_status_check check (status in ('unread', 'read', 'dismissed')),
  constraint commercial_portal_notifications_priority_check check (priority in ('urgent', 'high', 'normal', 'low', 'informational'))
);

create index if not exists commercial_portal_contacts_org_tx_idx
  on public.commercial_portal_contacts (organisation_id, commercial_transaction_id, portal_role);

create index if not exists commercial_portal_access_token_idx
  on public.commercial_portal_access (token);

create index if not exists commercial_portal_access_org_tx_idx
  on public.commercial_portal_access (organisation_id, commercial_transaction_id, portal_role, status);

create index if not exists commercial_portal_messages_access_idx
  on public.commercial_portal_messages (access_id, created_at desc);

create index if not exists commercial_portal_notifications_access_idx
  on public.commercial_portal_notifications (access_id, status, created_at desc);

alter table public.commercial_portal_contacts enable row level security;
alter table public.commercial_portal_access enable row level security;
alter table public.commercial_portal_messages enable row level security;
alter table public.commercial_portal_notifications enable row level security;

drop policy if exists commercial_portal_contacts_internal_manage on public.commercial_portal_contacts;
create policy commercial_portal_contacts_internal_manage
  on public.commercial_portal_contacts
  for all to authenticated
  using (exists (select 1 from public.bridge_commercial_user_scope(organisation_id)))
  with check (exists (select 1 from public.bridge_commercial_user_scope(organisation_id)));

drop policy if exists commercial_portal_access_internal_manage on public.commercial_portal_access;
create policy commercial_portal_access_internal_manage
  on public.commercial_portal_access
  for all to authenticated
  using (exists (select 1 from public.bridge_commercial_user_scope(organisation_id)))
  with check (exists (select 1 from public.bridge_commercial_user_scope(organisation_id)));

drop policy if exists commercial_portal_messages_internal_manage on public.commercial_portal_messages;
create policy commercial_portal_messages_internal_manage
  on public.commercial_portal_messages
  for all to authenticated
  using (exists (select 1 from public.bridge_commercial_user_scope(organisation_id)))
  with check (exists (select 1 from public.bridge_commercial_user_scope(organisation_id)));

drop policy if exists commercial_portal_notifications_internal_manage on public.commercial_portal_notifications;
create policy commercial_portal_notifications_internal_manage
  on public.commercial_portal_notifications
  for all to authenticated
  using (exists (select 1 from public.bridge_commercial_user_scope(organisation_id)))
  with check (exists (select 1 from public.bridge_commercial_user_scope(organisation_id)));

drop policy if exists commercial_portal_access_token_select on public.commercial_portal_access;
create policy commercial_portal_access_token_select
  on public.commercial_portal_access
  for select to anon, authenticated
  using (
    token = current_setting('request.headers', true)::jsonb ->> 'x-bridge-commercial-portal-token'
    and status = 'active'
    and (expires_at is null or expires_at > now())
  );

drop policy if exists commercial_portal_contacts_token_select on public.commercial_portal_contacts;
create policy commercial_portal_contacts_token_select
  on public.commercial_portal_contacts
  for select to anon, authenticated
  using (
    exists (
      select 1
      from public.commercial_portal_access cpa
      where cpa.contact_id = commercial_portal_contacts.id
        and cpa.token = current_setting('request.headers', true)::jsonb ->> 'x-bridge-commercial-portal-token'
        and cpa.status = 'active'
        and (cpa.expires_at is null or cpa.expires_at > now())
    )
  );

drop policy if exists commercial_portal_messages_token_insert on public.commercial_portal_messages;
create policy commercial_portal_messages_token_insert
  on public.commercial_portal_messages
  for insert to anon, authenticated
  with check (
    exists (
      select 1
      from public.commercial_portal_access cpa
      where cpa.id = access_id
        and cpa.token = current_setting('request.headers', true)::jsonb ->> 'x-bridge-commercial-portal-token'
        and cpa.status = 'active'
        and (cpa.expires_at is null or cpa.expires_at > now())
    )
  );

drop policy if exists commercial_portal_messages_token_select on public.commercial_portal_messages;
create policy commercial_portal_messages_token_select
  on public.commercial_portal_messages
  for select to anon, authenticated
  using (
    (visibility = 'client_visible' or sender_role = 'external')
    and exists (
      select 1
      from public.commercial_portal_access cpa
      where cpa.id = access_id
        and cpa.token = current_setting('request.headers', true)::jsonb ->> 'x-bridge-commercial-portal-token'
        and cpa.status = 'active'
        and (cpa.expires_at is null or cpa.expires_at > now())
    )
  );

drop policy if exists commercial_portal_notifications_token_select on public.commercial_portal_notifications;
create policy commercial_portal_notifications_token_select
  on public.commercial_portal_notifications
  for select to anon, authenticated
  using (
    exists (
      select 1
      from public.commercial_portal_access cpa
      where cpa.id = access_id
        and cpa.token = current_setting('request.headers', true)::jsonb ->> 'x-bridge-commercial-portal-token'
        and cpa.status = 'active'
        and (cpa.expires_at is null or cpa.expires_at > now())
    )
  );

drop policy if exists commercial_deals_portal_select on public.commercial_deals;
create policy commercial_deals_portal_select on public.commercial_deals
for select to anon, authenticated
using (
  exists (
    select 1 from public.commercial_portal_access cpa
    where cpa.deal_id = commercial_deals.id
      and cpa.token = current_setting('request.headers', true)::jsonb ->> 'x-bridge-commercial-portal-token'
      and cpa.status = 'active'
      and (cpa.expires_at is null or cpa.expires_at > now())
  )
);

drop policy if exists commercial_heads_of_terms_portal_select on public.commercial_heads_of_terms;
create policy commercial_heads_of_terms_portal_select on public.commercial_heads_of_terms
for select to anon, authenticated
using (
  exists (
    select 1 from public.commercial_portal_access cpa
    where cpa.heads_of_terms_id = commercial_heads_of_terms.id
      and cpa.token = current_setting('request.headers', true)::jsonb ->> 'x-bridge-commercial-portal-token'
      and cpa.status = 'active'
      and (cpa.expires_at is null or cpa.expires_at > now())
  )
);

drop policy if exists commercial_leases_portal_select on public.commercial_leases;
create policy commercial_leases_portal_select on public.commercial_leases
for select to anon, authenticated
using (
  exists (
    select 1 from public.commercial_portal_access cpa
    where cpa.lease_id = commercial_leases.id
      and cpa.token = current_setting('request.headers', true)::jsonb ->> 'x-bridge-commercial-portal-token'
      and cpa.status = 'active'
      and (cpa.expires_at is null or cpa.expires_at > now())
  )
);

drop policy if exists commercial_requirements_portal_select on public.commercial_requirements;
create policy commercial_requirements_portal_select on public.commercial_requirements
for select to anon, authenticated
using (
  exists (
    select 1 from public.commercial_portal_access cpa
    where cpa.requirement_id = commercial_requirements.id
      and cpa.token = current_setting('request.headers', true)::jsonb ->> 'x-bridge-commercial-portal-token'
      and cpa.status = 'active'
      and (cpa.expires_at is null or cpa.expires_at > now())
  )
);

drop policy if exists commercial_tenants_portal_select on public.commercial_tenants;
create policy commercial_tenants_portal_select on public.commercial_tenants
for select to anon, authenticated
using (
  exists (
    select 1 from public.commercial_portal_access cpa
    where cpa.tenant_id = commercial_tenants.id
      and cpa.token = current_setting('request.headers', true)::jsonb ->> 'x-bridge-commercial-portal-token'
      and cpa.status = 'active'
      and (cpa.expires_at is null or cpa.expires_at > now())
  )
);

drop policy if exists commercial_landlords_portal_select on public.commercial_landlords;
create policy commercial_landlords_portal_select on public.commercial_landlords
for select to anon, authenticated
using (
  exists (
    select 1 from public.commercial_portal_access cpa
    where cpa.landlord_id = commercial_landlords.id
      and cpa.token = current_setting('request.headers', true)::jsonb ->> 'x-bridge-commercial-portal-token'
      and cpa.status = 'active'
      and (cpa.expires_at is null or cpa.expires_at > now())
  )
);

drop policy if exists commercial_properties_portal_select on public.commercial_properties;
create policy commercial_properties_portal_select on public.commercial_properties
for select to anon, authenticated
using (
  exists (
    select 1 from public.commercial_portal_access cpa
    where cpa.property_id = commercial_properties.id
      and cpa.token = current_setting('request.headers', true)::jsonb ->> 'x-bridge-commercial-portal-token'
      and cpa.status = 'active'
      and (cpa.expires_at is null or cpa.expires_at > now())
  )
);

drop policy if exists commercial_vacancies_portal_select on public.commercial_vacancies;
create policy commercial_vacancies_portal_select on public.commercial_vacancies
for select to anon, authenticated
using (
  exists (
    select 1 from public.commercial_portal_access cpa
    where cpa.vacancy_id = commercial_vacancies.id
      and cpa.token = current_setting('request.headers', true)::jsonb ->> 'x-bridge-commercial-portal-token'
      and cpa.status = 'active'
      and (cpa.expires_at is null or cpa.expires_at > now())
  )
);

drop policy if exists commercial_documents_portal_select on public.commercial_documents;
create policy commercial_documents_portal_select on public.commercial_documents
for select to anon, authenticated
using (
  archived_at is null
  and coalesce(status, 'uploaded') not in ('archived', 'superseded')
  and exists (
    select 1 from public.commercial_portal_access cpa
    where cpa.token = current_setting('request.headers', true)::jsonb ->> 'x-bridge-commercial-portal-token'
      and cpa.status = 'active'
      and (cpa.expires_at is null or cpa.expires_at > now())
      and (
        (entity_type = 'commercial_deal' and entity_id = cpa.deal_id)
        or (entity_type = 'commercial_heads_of_terms' and entity_id = cpa.heads_of_terms_id)
        or (entity_type = 'commercial_lease' and entity_id = cpa.lease_id)
        or (entity_type = 'commercial_requirement' and entity_id = cpa.requirement_id)
        or (entity_type = 'commercial_tenant' and entity_id = cpa.tenant_id)
        or (entity_type = 'commercial_landlord' and entity_id = cpa.landlord_id)
        or (entity_type = 'commercial_property' and entity_id = cpa.property_id)
        or (entity_type = 'commercial_vacancy' and entity_id = cpa.vacancy_id)
      )
  )
);

drop policy if exists commercial_documents_portal_insert on public.commercial_documents;
create policy commercial_documents_portal_insert on public.commercial_documents
for insert to anon, authenticated
with check (
  exists (
    select 1 from public.commercial_portal_access cpa
    where cpa.organisation_id = commercial_documents.organisation_id
      and cpa.token = current_setting('request.headers', true)::jsonb ->> 'x-bridge-commercial-portal-token'
      and cpa.status = 'active'
      and (cpa.expires_at is null or cpa.expires_at > now())
      and (
        (entity_type = 'commercial_deal' and entity_id = cpa.deal_id)
        or (entity_type = 'commercial_heads_of_terms' and entity_id = cpa.heads_of_terms_id)
        or (entity_type = 'commercial_lease' and entity_id = cpa.lease_id)
        or (entity_type = 'commercial_tenant' and entity_id = cpa.tenant_id)
        or (entity_type = 'commercial_landlord' and entity_id = cpa.landlord_id)
        or (entity_type = 'commercial_property' and entity_id = cpa.property_id)
      )
  )
);

drop policy if exists commercial_document_requests_portal_select on public.commercial_document_requests;
create policy commercial_document_requests_portal_select on public.commercial_document_requests
for select to anon, authenticated
using (
  exists (
    select 1 from public.commercial_portal_access cpa
    where cpa.token = current_setting('request.headers', true)::jsonb ->> 'x-bridge-commercial-portal-token'
      and cpa.status = 'active'
      and (cpa.expires_at is null or cpa.expires_at > now())
      and (
        (entity_type = 'commercial_deal' and entity_id = cpa.deal_id)
        or (entity_type = 'commercial_heads_of_terms' and entity_id = cpa.heads_of_terms_id)
        or (entity_type = 'commercial_lease' and entity_id = cpa.lease_id)
        or (entity_type = 'commercial_tenant' and entity_id = cpa.tenant_id)
        or (entity_type = 'commercial_landlord' and entity_id = cpa.landlord_id)
        or (entity_type = 'commercial_property' and entity_id = cpa.property_id)
      )
  )
);

drop policy if exists commercial_document_requests_portal_update on public.commercial_document_requests;
create policy commercial_document_requests_portal_update on public.commercial_document_requests
for update to anon, authenticated
using (
  exists (
    select 1 from public.commercial_portal_access cpa
    where cpa.token = current_setting('request.headers', true)::jsonb ->> 'x-bridge-commercial-portal-token'
      and cpa.status = 'active'
      and (cpa.expires_at is null or cpa.expires_at > now())
      and (
        (entity_type = 'commercial_deal' and entity_id = cpa.deal_id)
        or (entity_type = 'commercial_heads_of_terms' and entity_id = cpa.heads_of_terms_id)
        or (entity_type = 'commercial_lease' and entity_id = cpa.lease_id)
        or (entity_type = 'commercial_tenant' and entity_id = cpa.tenant_id)
        or (entity_type = 'commercial_landlord' and entity_id = cpa.landlord_id)
        or (entity_type = 'commercial_property' and entity_id = cpa.property_id)
      )
  )
)
with check (
  exists (
    select 1 from public.commercial_portal_access cpa
    where cpa.token = current_setting('request.headers', true)::jsonb ->> 'x-bridge-commercial-portal-token'
      and cpa.status = 'active'
      and (cpa.expires_at is null or cpa.expires_at > now())
      and (
        (entity_type = 'commercial_deal' and entity_id = cpa.deal_id)
        or (entity_type = 'commercial_heads_of_terms' and entity_id = cpa.heads_of_terms_id)
        or (entity_type = 'commercial_lease' and entity_id = cpa.lease_id)
        or (entity_type = 'commercial_tenant' and entity_id = cpa.tenant_id)
        or (entity_type = 'commercial_landlord' and entity_id = cpa.landlord_id)
        or (entity_type = 'commercial_property' and entity_id = cpa.property_id)
      )
  )
);
