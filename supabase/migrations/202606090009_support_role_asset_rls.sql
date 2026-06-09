begin;

create or replace function public.bridge_support_can_access_record(
  target_org uuid,
  target_branch uuid,
  target_kind text,
  target_user_a uuid,
  target_user_b uuid,
  target_user_c uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select
      auth.uid() is not null
      and (
        exists (
          select 1
          from public.agent_support_assignments asa
          where asa.organisation_id = target_org
            and asa.assistant_user_id = auth.uid()
            and asa.status = 'active'
            and asa.support_role = 'assistant'
            and (
              asa.supported_user_id = target_user_a
              or asa.supported_user_id = target_user_b
              or asa.supported_user_id = target_user_c
            )
            and (
              target_branch is null
              or asa.branch_id is null
              or asa.branch_id = target_branch
            )
        )
        or exists (
          select 1
          from public.organisation_users ou
          where ou.organisation_id = target_org
            and ou.user_id = auth.uid()
            and coalesce(ou.status, 'active') in ('active', 'accepted')
            and (
              ou.branch_id = target_branch
              or ou.primary_branch_id = target_branch
              or ou.workspace_unit_id = target_branch
            )
            and (
              coalesce(ou.workspace_role, ou.organisation_role, ou.role) = 'admin_coordinator'
              or (
                target_kind in ('transaction', 'transaction_document', 'appointment')
                and coalesce(ou.workspace_role, ou.organisation_role, ou.role) = 'transaction_coordinator'
              )
              or (
                target_kind in ('listing', 'listing_document', 'appointment')
                and coalesce(ou.workspace_role, ou.organisation_role, ou.role) = 'listing_coordinator'
              )
            )
        )
      )
  ), false);
$$;

grant execute on function public.bridge_support_can_access_record(uuid, uuid, text, uuid, uuid, uuid) to authenticated;

create or replace function public.bridge_can_access_private_listing(target_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with listing as (
    select pl.*
    from public.private_listings pl
    where pl.id = target_listing_id
  )
  select coalesce((
    select
      auth.uid() is not null
      and (
        public.bridge_is_org_admin(listing.organisation_id)
        or listing.assigned_agent_id = auth.uid()
        or listing.created_by = auth.uid()
        or public.bridge_support_can_access_record(
          listing.organisation_id,
          listing.branch_id,
          'listing',
          listing.assigned_agent_id,
          listing.created_by,
          null
        )
      )
    from listing
  ), false);
$$;

grant execute on function public.bridge_can_access_private_listing(uuid) to authenticated;

create or replace function public.bridge_can_access_transaction_spine(target_transaction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with tx as (
    select *
    from public.transactions t
    where t.id = target_transaction_id
  )
  select coalesce((
    select
      auth.uid() is not null
      and (
        public.bridge_transaction_scope_is_internal_user()
        or tx.owner_user_id = auth.uid()
        or tx.assigned_user_id = auth.uid()
        or tx.created_by = auth.uid()
        or lower(coalesce(tx.assigned_agent_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or lower(coalesce(tx.assigned_attorney_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or lower(coalesce(tx.assigned_bond_originator_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or public.bridge_support_can_access_record(
          tx.organisation_id,
          tx.assigned_branch_id,
          'transaction',
          tx.owner_user_id,
          tx.assigned_user_id,
          tx.created_by
        )
        or exists (
          select 1
          from public.organisation_users ou
          where ou.organisation_id = tx.organisation_id
            and ou.user_id = auth.uid()
            and coalesce(ou.status, 'active') in ('active', 'accepted')
            and (
              ou.scope_level in ('organisation', 'organization', 'workspace_hq')
              or coalesce(ou.workspace_role, ou.organisation_role, ou.role) in ('owner', 'principal', 'director', 'partner', 'admin', 'admin_staff', 'manager', 'hq_manager')
              or (ou.scope_level = 'branch' and ou.workspace_unit_id = tx.assigned_branch_id)
            )
        )
        or exists (
          select 1
          from public.transaction_participants tp
          where tp.transaction_id = target_transaction_id
            and coalesce(tp.status, 'active') = 'active'
            and tp.removed_at is null
            and (
              tp.user_id = auth.uid()
              or tp.assigned_user_id = auth.uid()
              or lower(coalesce(tp.participant_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
            )
        )
        or exists (
          select 1
          from public.transaction_role_players trp
          where trp.transaction_id = target_transaction_id
            and coalesce(trp.status, 'active') <> 'removed'
            and trp.removed_at is null
            and (
              trp.user_id = auth.uid()
              or trp.assigned_user_id = auth.uid()
              or lower(coalesce(trp.email_address, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
            )
        )
        or exists (
          select 1
          from public.transaction_attorney_assignments taa
          where taa.transaction_id = target_transaction_id
            and coalesce(taa.status, 'active') <> 'removed'
            and (
              taa.assigned_user_id = auth.uid()
              or taa.primary_attorney_id = auth.uid()
              or taa.attorney_user_id = auth.uid()
            )
        )
        or exists (
          select 1
          from public.transaction_bond_applications tba
          where tba.transaction_id = target_transaction_id
            and public.bridge_can_access_bond_application_scope(tba.id)
        )
      )
    from tx
  ), false)
$$;

grant execute on function public.bridge_can_access_transaction_spine(uuid) to authenticated;

alter table if exists public.leads enable row level security;

drop policy if exists leads_support_role_select on public.leads;
create policy leads_support_role_select on public.leads
for select
to authenticated
using (
  public.bridge_is_org_admin(organisation_id)
  or assigned_user_id = auth.uid()
  or assigned_agent_id = auth.uid()
  or created_by = auth.uid()
  or lower(coalesce(assigned_agent_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.bridge_support_can_access_record(
    organisation_id,
    branch_id,
    'lead',
    assigned_user_id,
    assigned_agent_id,
    created_by
  )
);

drop policy if exists leads_support_role_update on public.leads;
create policy leads_support_role_update on public.leads
for update
to authenticated
using (
  public.bridge_is_org_admin(organisation_id)
  or assigned_user_id = auth.uid()
  or assigned_agent_id = auth.uid()
  or created_by = auth.uid()
  or public.bridge_support_can_access_record(
    organisation_id,
    branch_id,
    'lead',
    assigned_user_id,
    assigned_agent_id,
    created_by
  )
)
with check (
  public.bridge_is_org_admin(organisation_id)
  or assigned_user_id = auth.uid()
  or assigned_agent_id = auth.uid()
  or created_by = auth.uid()
  or public.bridge_support_can_access_record(
    organisation_id,
    branch_id,
    'lead',
    assigned_user_id,
    assigned_agent_id,
    created_by
  )
);

alter table if exists public.private_listings enable row level security;

drop policy if exists private_listings_support_role_select on public.private_listings;
create policy private_listings_support_role_select on public.private_listings
for select
to authenticated
using (public.bridge_can_access_private_listing(id));

drop policy if exists private_listings_support_role_update on public.private_listings;
create policy private_listings_support_role_update on public.private_listings
for update
to authenticated
using (public.bridge_can_access_private_listing(id))
with check (public.bridge_can_access_private_listing(id));

drop policy if exists private_listing_document_requirements_select_member on public.private_listing_document_requirements;
create policy private_listing_document_requirements_select_member
on public.private_listing_document_requirements
for select
to authenticated
using (public.bridge_can_access_private_listing(private_listing_id));

drop policy if exists private_listing_document_requirements_mutate_member on public.private_listing_document_requirements;
create policy private_listing_document_requirements_mutate_member
on public.private_listing_document_requirements
for all
to authenticated
using (public.bridge_can_access_private_listing(private_listing_id))
with check (public.bridge_can_access_private_listing(private_listing_id));

drop policy if exists private_listing_documents_select_member on public.private_listing_documents;
create policy private_listing_documents_select_member
on public.private_listing_documents
for select
to authenticated
using (public.bridge_can_access_private_listing(private_listing_id));

drop policy if exists private_listing_documents_mutate_member on public.private_listing_documents;
create policy private_listing_documents_mutate_member
on public.private_listing_documents
for all
to authenticated
using (public.bridge_can_access_private_listing(private_listing_id))
with check (public.bridge_can_access_private_listing(private_listing_id));

drop policy if exists appointments_support_role_select on public.appointments;
create policy appointments_support_role_select on public.appointments
for select
to authenticated
using (
  public.bridge_is_org_admin(organisation_id)
  or created_by = auth.uid()
  or agent_id = auth.uid()
  or public.bridge_support_can_access_record(
    organisation_id,
    null,
    'appointment',
    agent_id,
    created_by,
    null
  )
);

drop policy if exists appointments_support_role_update on public.appointments;
create policy appointments_support_role_update on public.appointments
for update
to authenticated
using (
  public.bridge_is_org_admin(organisation_id)
  or created_by = auth.uid()
  or agent_id = auth.uid()
  or public.bridge_support_can_access_record(
    organisation_id,
    null,
    'appointment',
    agent_id,
    created_by,
    null
  )
)
with check (
  public.bridge_is_org_admin(organisation_id)
  or created_by = auth.uid()
  or agent_id = auth.uid()
  or public.bridge_support_can_access_record(
    organisation_id,
    null,
    'appointment',
    agent_id,
    created_by,
    null
  )
);

drop policy if exists document_requests_support_role_select on public.document_requests;
create policy document_requests_support_role_select on public.document_requests
for select
to authenticated
using (
  transaction_id is not null
  and public.bridge_can_access_transaction_spine(transaction_id)
);

drop policy if exists documents_support_role_select on public.documents;
create policy documents_support_role_select on public.documents
for select
to authenticated
using (
  transaction_id is not null
  and public.bridge_can_access_transaction_spine(transaction_id)
);

commit;
