create table if not exists public.transaction_partner_assignments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  agency_organisation_id uuid not null references public.organisations(id) on delete cascade,
  partner_organisation_id uuid references public.organisations(id) on delete set null,
  partner_connection_id uuid,
  partner_service_type text not null,
  partner_role text not null,
  assigned_person_id uuid references auth.users(id) on delete set null,
  assigned_queue_id text,
  delivery_type text not null,
  assignment_status text not null default 'pending_onboarding',
  onboarding_invite_id uuid,
  work_item_id uuid,
  source text not null default 'manual',
  routing_rule_id uuid,
  portal_token text unique default encode(gen_random_bytes(24), 'hex'),
  pending_work_delivery jsonb,
  created_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  activated_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_partner_assignments_status_check
    check (assignment_status in ('pending_onboarding', 'active', 'declined', 'cancelled', 'completed')),
  constraint transaction_partner_assignments_delivery_type_check
    check (delivery_type in ('attorney_instruction', 'bond_application_request', 'development_collaboration', 'manual_external_contact')),
  constraint transaction_partner_assignments_source_check
    check (source in ('routing', 'manual', 'override', 'import', 'fallback'))
);

create index if not exists transaction_partner_assignments_transaction_idx
  on public.transaction_partner_assignments (transaction_id, assignment_status);

create index if not exists transaction_partner_assignments_partner_idx
  on public.transaction_partner_assignments (partner_organisation_id, partner_role, assignment_status);

create index if not exists transaction_partner_assignments_agency_idx
  on public.transaction_partner_assignments (agency_organisation_id, partner_service_type, assignment_status);

create index if not exists transaction_partner_assignments_invite_idx
  on public.transaction_partner_assignments (onboarding_invite_id)
  where onboarding_invite_id is not null;

create table if not exists public.partner_portal_uploads (
  id uuid primary key default gen_random_uuid(),
  transaction_partner_assignment_id uuid not null references public.transaction_partner_assignments(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  partner_id uuid not null references public.organisations(id) on delete cascade,
  bond_application_id uuid,
  application_reference text,
  document_name text not null,
  document_type text,
  storage_path text,
  status text not null default 'received',
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint partner_portal_uploads_status_check
    check (status in ('requested', 'received', 'reviewed', 'approved', 'rejected', 'replaced'))
);

create table if not exists public.partner_portal_document_requests (
  id uuid primary key default gen_random_uuid(),
  transaction_partner_assignment_id uuid not null references public.transaction_partner_assignments(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  partner_id uuid not null references public.organisations(id) on delete cascade,
  bond_application_id uuid,
  application_reference text,
  document_name text not null,
  requested_by uuid references auth.users(id) on delete set null,
  requested_by_name text,
  due_date date,
  status text not null default 'requested',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_portal_document_requests_status_check
    check (status in ('requested', 'uploaded', 'completed', 'unable_to_provide', 'cancelled'))
);

create table if not exists public.partner_portal_comments (
  id uuid primary key default gen_random_uuid(),
  transaction_partner_assignment_id uuid not null references public.transaction_partner_assignments(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  partner_id uuid not null references public.organisations(id) on delete cascade,
  bond_application_id uuid,
  application_reference text,
  author_user_id uuid,
  author_name text,
  author_role text not null default 'Partner',
  message text not null,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.partner_portal_support_tickets (
  id uuid primary key default gen_random_uuid(),
  transaction_partner_assignment_id uuid not null references public.transaction_partner_assignments(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  partner_id uuid not null references public.organisations(id) on delete cascade,
  bond_application_id uuid,
  application_reference text,
  ticket_type text not null,
  subject text not null,
  message text,
  status text not null default 'open',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_portal_support_tickets_status_check
    check (status in ('open', 'pending', 'resolved'))
);

create table if not exists public.partner_portal_audit_logs (
  id uuid primary key default gen_random_uuid(),
  transaction_partner_assignment_id uuid not null references public.transaction_partner_assignments(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  partner_id uuid references public.organisations(id) on delete cascade,
  bond_application_id uuid,
  application_reference text,
  event_type text not null,
  actor_user_id uuid,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.partner_portal_notifications (
  id uuid primary key default gen_random_uuid(),
  transaction_partner_assignment_id uuid not null references public.transaction_partner_assignments(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  partner_id uuid not null references public.organisations(id) on delete cascade,
  bond_application_id uuid,
  application_reference text,
  notification_type text not null,
  channel text not null default 'portal',
  title text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint partner_portal_notifications_channel_check
    check (channel in ('portal', 'email'))
);

create index if not exists partner_portal_uploads_assignment_idx
  on public.partner_portal_uploads (transaction_partner_assignment_id, uploaded_at desc);

create index if not exists partner_portal_document_requests_assignment_idx
  on public.partner_portal_document_requests (transaction_partner_assignment_id, created_at desc);

create index if not exists partner_portal_comments_assignment_idx
  on public.partner_portal_comments (transaction_partner_assignment_id, created_at desc);

create index if not exists partner_portal_support_tickets_assignment_idx
  on public.partner_portal_support_tickets (transaction_partner_assignment_id, created_at desc);

create index if not exists partner_portal_audit_logs_assignment_idx
  on public.partner_portal_audit_logs (transaction_partner_assignment_id, created_at desc);

create index if not exists partner_portal_notifications_assignment_idx
  on public.partner_portal_notifications (transaction_partner_assignment_id, created_at desc);

alter table public.partner_portal_uploads enable row level security;
alter table public.partner_portal_document_requests enable row level security;
alter table public.partner_portal_comments enable row level security;
alter table public.partner_portal_support_tickets enable row level security;
alter table public.partner_portal_audit_logs enable row level security;
alter table public.partner_portal_notifications enable row level security;

drop policy if exists partner_portal_uploads_member_access on public.partner_portal_uploads;
create policy partner_portal_uploads_member_access
on public.partner_portal_uploads for all
using (public.bridge_is_active_member(organisation_id) or public.bridge_is_active_member(partner_id))
with check (public.bridge_is_active_member(organisation_id) or public.bridge_is_active_member(partner_id));

drop policy if exists partner_portal_document_requests_member_access on public.partner_portal_document_requests;
create policy partner_portal_document_requests_member_access
on public.partner_portal_document_requests for all
using (public.bridge_is_active_member(organisation_id) or public.bridge_is_active_member(partner_id))
with check (public.bridge_is_active_member(organisation_id) or public.bridge_is_active_member(partner_id));

drop policy if exists partner_portal_comments_member_access on public.partner_portal_comments;
create policy partner_portal_comments_member_access
on public.partner_portal_comments for all
using (public.bridge_is_active_member(organisation_id) or public.bridge_is_active_member(partner_id))
with check (public.bridge_is_active_member(organisation_id) or public.bridge_is_active_member(partner_id));

drop policy if exists partner_portal_support_tickets_member_access on public.partner_portal_support_tickets;
create policy partner_portal_support_tickets_member_access
on public.partner_portal_support_tickets for all
using (public.bridge_is_active_member(organisation_id) or public.bridge_is_active_member(partner_id))
with check (public.bridge_is_active_member(organisation_id) or public.bridge_is_active_member(partner_id));

drop policy if exists partner_portal_audit_logs_member_access on public.partner_portal_audit_logs;
create policy partner_portal_audit_logs_member_access
on public.partner_portal_audit_logs for all
using (public.bridge_is_active_member(organisation_id) or public.bridge_is_active_member(partner_id))
with check (public.bridge_is_active_member(organisation_id) or public.bridge_is_active_member(partner_id));

drop policy if exists partner_portal_notifications_member_access on public.partner_portal_notifications;
create policy partner_portal_notifications_member_access
on public.partner_portal_notifications for all
using (public.bridge_is_active_member(organisation_id) or public.bridge_is_active_member(partner_id))
with check (public.bridge_is_active_member(organisation_id) or public.bridge_is_active_member(partner_id));

alter table if exists public.bond_partner_portal_documents
  add column if not exists transaction_partner_assignment_id uuid references public.transaction_partner_assignments(id) on delete cascade;

alter table if exists public.bond_partner_portal_document_requests
  add column if not exists transaction_partner_assignment_id uuid references public.transaction_partner_assignments(id) on delete cascade;

alter table if exists public.bond_partner_portal_comments
  add column if not exists transaction_partner_assignment_id uuid references public.transaction_partner_assignments(id) on delete cascade;

alter table if exists public.bond_partner_portal_support_tickets
  add column if not exists transaction_partner_assignment_id uuid references public.transaction_partner_assignments(id) on delete cascade;

alter table if exists public.bond_partner_portal_audit
  add column if not exists transaction_partner_assignment_id uuid references public.transaction_partner_assignments(id) on delete cascade;

alter table if exists public.bond_partner_portal_notifications
  add column if not exists transaction_partner_assignment_id uuid references public.transaction_partner_assignments(id) on delete cascade;

create index if not exists bond_partner_portal_documents_assignment_idx
  on public.bond_partner_portal_documents (transaction_partner_assignment_id, uploaded_at desc);

create index if not exists bond_partner_portal_document_requests_assignment_idx
  on public.bond_partner_portal_document_requests (transaction_partner_assignment_id, created_at desc);

create index if not exists bond_partner_portal_comments_assignment_idx
  on public.bond_partner_portal_comments (transaction_partner_assignment_id, created_at desc);

create index if not exists bond_partner_portal_support_assignment_idx
  on public.bond_partner_portal_support_tickets (transaction_partner_assignment_id, created_at desc);

create index if not exists bond_partner_portal_audit_assignment_idx
  on public.bond_partner_portal_audit (transaction_partner_assignment_id, created_at desc);

create index if not exists bond_partner_portal_notifications_assignment_idx
  on public.bond_partner_portal_notifications (transaction_partner_assignment_id, created_at desc);

alter table public.transaction_partner_assignments enable row level security;

drop policy if exists transaction_partner_assignments_agency_member_access on public.transaction_partner_assignments;
create policy transaction_partner_assignments_agency_member_access
on public.transaction_partner_assignments
for all
using (public.bridge_is_active_member(agency_organisation_id))
with check (public.bridge_is_active_member(agency_organisation_id));

drop policy if exists transaction_partner_assignments_partner_member_access on public.transaction_partner_assignments;
create policy transaction_partner_assignments_partner_member_access
on public.transaction_partner_assignments
for select
using (
  partner_organisation_id is not null
  and public.bridge_is_active_member(partner_organisation_id)
);

create or replace function public.bridge_lookup_partner_portal_by_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text := nullif(trim(coalesce(p_token, '')), '');
  v_assignment public.transaction_partner_assignments%rowtype;
  v_invite public.invites%rowtype;
  v_partner jsonb := null;
  v_user jsonb := null;
  v_transaction jsonb := null;
  v_documents jsonb := '[]'::jsonb;
  v_document_requests jsonb := '[]'::jsonb;
  v_comments jsonb := '[]'::jsonb;
  v_support_tickets jsonb := '[]'::jsonb;
  v_audit jsonb := '[]'::jsonb;
  v_notifications jsonb := '[]'::jsonb;
begin
  if v_token is null then
    return jsonb_build_object('success', false, 'code', 'missing_token');
  end if;

  select *
  into v_assignment
  from public.transaction_partner_assignments
  where portal_token = v_token
  limit 1;

  if v_assignment.id is null then
    select *
    into v_invite
    from public.invites
    where token = v_token
    limit 1;

    if v_invite.id is not null then
      select *
      into v_assignment
      from public.transaction_partner_assignments
      where onboarding_invite_id = v_invite.id
      limit 1;

      if v_assignment.id is null and v_invite.target_transaction_id is not null and nullif(v_invite.target_transaction_role, '') is not null then
        select *
        into v_assignment
        from public.transaction_partner_assignments
        where transaction_id = v_invite.target_transaction_id
          and partner_role = v_invite.target_transaction_role
        order by created_at desc
        limit 1;
      end if;
    end if;
  elsif v_assignment.onboarding_invite_id is not null then
    select *
    into v_invite
    from public.invites
    where id = v_assignment.onboarding_invite_id
    limit 1;
  end if;

  if v_assignment.id is null then
    return jsonb_build_object('success', false, 'code', 'not_found');
  end if;

  if v_assignment.partner_organisation_id is not null then
    select jsonb_build_object(
      'id', o.id,
      'name', o.name,
      'display_name', o.display_name,
      'type', o.type,
      'organisation_type', o.type,
      'status', o.status,
      'email', o.email,
      'phone', o.phone,
      'logo_url', o.logo_url
    )
    into v_partner
    from public.organisations o
    where o.id = v_assignment.partner_organisation_id;
  end if;

  if v_assignment.assigned_person_id is not null then
    select jsonb_build_object(
      'id', p.id,
      'name', p.full_name,
      'full_name', p.full_name,
      'email', p.email,
      'role', p.role,
      'status', 'active'
    )
    into v_user
    from public.profiles p
    where p.id = v_assignment.assigned_person_id;
  end if;

  if v_user is null then
    v_user := jsonb_build_object(
      'id', coalesce(v_invite.id::text, v_assignment.assigned_queue_id, v_assignment.id::text),
      'partner_id', v_assignment.partner_organisation_id,
      'email', coalesce(v_invite.email, v_assignment.pending_work_delivery ->> 'email', ''),
      'name', coalesce(v_assignment.pending_work_delivery ->> 'contactName', v_assignment.pending_work_delivery ->> 'contact_name', v_invite.email, 'Partner User'),
      'role', v_assignment.partner_role,
      'status', case when v_assignment.assignment_status = 'active' then 'active' else 'invited' end
    );
  end if;

  select jsonb_build_object(
    'id', t.id,
    'transaction_reference', t.transaction_reference,
    'matter_number', t.matter_number,
    'property_address_line_1', t.property_address_line_1,
    'property_description', t.property_description,
    'finance_status', t.finance_status,
    'stage', t.stage,
    'current_main_stage', t.current_main_stage,
    'updated_at', t.updated_at,
    'created_at', t.created_at
  )
  into v_transaction
  from public.transactions t
  where t.id = v_assignment.transaction_id;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.uploaded_at desc), '[]'::jsonb)
  into v_documents
  from public.partner_portal_uploads row_data
  where row_data.transaction_partner_assignment_id = v_assignment.id;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc), '[]'::jsonb)
  into v_document_requests
  from public.partner_portal_document_requests row_data
  where row_data.transaction_partner_assignment_id = v_assignment.id;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at asc), '[]'::jsonb)
  into v_comments
  from public.partner_portal_comments row_data
  where row_data.transaction_partner_assignment_id = v_assignment.id;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc), '[]'::jsonb)
  into v_support_tickets
  from public.partner_portal_support_tickets row_data
  where row_data.transaction_partner_assignment_id = v_assignment.id;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc), '[]'::jsonb)
  into v_audit
  from public.partner_portal_audit_logs row_data
  where row_data.transaction_partner_assignment_id = v_assignment.id;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at desc), '[]'::jsonb)
  into v_notifications
  from public.partner_portal_notifications row_data
  where row_data.transaction_partner_assignment_id = v_assignment.id;

  insert into public.partner_portal_audit_logs (
    transaction_partner_assignment_id,
    organisation_id,
    partner_id,
    bond_application_id,
    application_reference,
    event_type,
    actor_user_id,
    new_value
  )
  values (
    v_assignment.id,
    v_assignment.agency_organisation_id,
    v_assignment.partner_organisation_id,
    v_assignment.work_item_id,
    v_assignment.transaction_id::text,
    'PARTNER_LOGIN',
    auth.uid(),
    jsonb_build_object('source', 'partner_portal_token')
  );

  return jsonb_build_object(
    'success', true,
    'assignment', to_jsonb(v_assignment),
    'invite', case when v_invite.id is null then null else to_jsonb(v_invite) end,
    'partner', v_partner,
    'user', v_user,
    'transaction', v_transaction,
    'documents', v_documents,
    'document_requests', v_document_requests,
    'comments', v_comments,
    'support_tickets', v_support_tickets,
    'audit', v_audit,
    'notifications', v_notifications
  );
end;
$$;

create or replace function public.bridge_activate_partner_portal_onboarding(p_token text, p_profile jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lookup jsonb;
  v_assignment_id uuid;
  v_invite_id uuid;
  v_work_item_text text;
  v_work_item_id uuid := null;
  v_connection_id uuid := null;
  v_relationship_type text := 'other';
  v_assignment public.transaction_partner_assignments%rowtype;
begin
  v_lookup := public.bridge_lookup_partner_portal_by_token(p_token);

  if coalesce((v_lookup ->> 'success')::boolean, false) is false then
    return v_lookup;
  end if;

  v_assignment_id := nullif(v_lookup #>> '{assignment,id}', '')::uuid;
  v_invite_id := nullif(v_lookup #>> '{invite,id}', '')::uuid;
  v_work_item_text := nullif(trim(coalesce(
    p_profile ->> 'workItemId',
    p_profile ->> 'work_item_id',
    v_lookup #>> '{assignment,pending_work_delivery,workItemId}',
    v_lookup #>> '{assignment,pending_work_delivery,work_item_id}',
    ''
  )), '');

  if v_work_item_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_work_item_id := v_work_item_text::uuid;
  end if;

  if v_invite_id is not null then
    update public.invites
    set status = case when status = 'pending' then 'accepted' else status end,
        accepted_at = coalesce(accepted_at, now()),
        accepted_by_user_id = coalesce(accepted_by_user_id, auth.uid()),
        updated_at = now()
    where id = v_invite_id;
  end if;

  select partner_connection_id
  into v_connection_id
  from public.transaction_partner_assignments
  where id = v_assignment_id;

  if v_connection_id is not null then
    update public.partner_connections
    set status = 'connected',
        accepted_by = coalesce(accepted_by, auth.uid()),
        accepted_at = coalesce(accepted_at, now()),
        updated_at = now()
    where id = v_connection_id;
  else
    select public.bridge_phase4_relationship_type(agency_organisation_id, partner_organisation_id)
    into v_relationship_type
    from public.transaction_partner_assignments
    where id = v_assignment_id
      and agency_organisation_id is not null
      and partner_organisation_id is not null
      and agency_organisation_id <> partner_organisation_id;

    if coalesce(v_relationship_type, 'other') <> 'other' then
      insert into public.partner_connections (
        source_organization_id,
        target_organization_id,
        relationship_type,
        status,
        created_by,
        accepted_by,
        accepted_at,
        metadata
      )
      select
        agency_organisation_id,
        partner_organisation_id,
        v_relationship_type,
        'connected',
        coalesce(created_by, auth.uid()),
        auth.uid(),
        now(),
        jsonb_build_object('source', 'partner_portal_onboarding', 'assignmentId', id)
      from public.transaction_partner_assignments
      where id = v_assignment_id
      on conflict (source_organization_id, target_organization_id)
      do update
      set status = 'connected',
          accepted_by = coalesce(public.partner_connections.accepted_by, auth.uid()),
          accepted_at = coalesce(public.partner_connections.accepted_at, now()),
          updated_at = now()
      returning id into v_connection_id;
    end if;
  end if;

  update public.transaction_partner_assignments
  set assignment_status = 'active',
      partner_connection_id = coalesce(partner_connection_id, v_connection_id),
      assigned_person_id = coalesce(assigned_person_id, auth.uid()),
      accepted_at = coalesce(accepted_at, now()),
      activated_at = coalesce(activated_at, now()),
      work_item_id = coalesce(work_item_id, v_work_item_id),
      pending_work_delivery = coalesce(pending_work_delivery, '{}'::jsonb),
      updated_at = now()
  where id = v_assignment_id
  returning * into v_assignment;

  return jsonb_build_object(
    'success', true,
    'assignment', to_jsonb(v_assignment)
  );
end;
$$;

grant execute on function public.bridge_lookup_partner_portal_by_token(text) to anon, authenticated;
grant execute on function public.bridge_activate_partner_portal_onboarding(text, jsonb) to authenticated;

notify pgrst, 'reload schema';
