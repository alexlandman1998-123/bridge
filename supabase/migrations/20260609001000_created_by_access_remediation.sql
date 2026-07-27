begin;

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
        or public.bridge_support_can_access_record(
          listing.organisation_id,
          listing.branch_id,
          'listing',
          listing.assigned_agent_id,
          null,
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
        or lower(coalesce(tx.assigned_agent_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or lower(coalesce(tx.assigned_attorney_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or lower(coalesce(tx.assigned_bond_originator_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
        or public.bridge_support_can_access_record(
          tx.organisation_id,
          tx.assigned_branch_id,
          'transaction',
          tx.owner_user_id,
          tx.assigned_user_id,
          null
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

create or replace function public.bridge_commercial_can_access_record(
  target_organisation_id uuid,
  target_branch_id uuid,
  target_team_id uuid,
  target_broker_id uuid,
  target_created_by uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bridge_commercial_user_scope(target_organisation_id) scope
    where scope.scope_level = 'organisation'
      or (
        scope.scope_level = 'branch'
        and (
          target_branch_id = scope.branch_id
          or target_branch_id is null
        )
      )
      or (
        scope.scope_level = 'team'
        and target_team_id = scope.team_id
      )
      or (
        scope.scope_level = 'broker'
        and target_broker_id = scope.user_id
      )
  )
$$;

grant execute on function public.bridge_commercial_can_access_record(uuid, uuid, uuid, uuid, uuid) to authenticated;

drop policy if exists leads_support_role_select on public.leads;
create policy leads_support_role_select on public.leads
for select
to authenticated
using (
  public.bridge_is_org_admin(organisation_id)
  or assigned_user_id = auth.uid()
  or assigned_agent_id = auth.uid()
  or lower(coalesce(assigned_agent_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  or public.bridge_support_can_access_record(
    organisation_id,
    branch_id,
    'lead',
    assigned_user_id,
    assigned_agent_id,
    null
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
  or public.bridge_support_can_access_record(
    organisation_id,
    branch_id,
    'lead',
    assigned_user_id,
    assigned_agent_id,
    null
  )
)
with check (
  public.bridge_is_org_admin(organisation_id)
  or assigned_user_id = auth.uid()
  or assigned_agent_id = auth.uid()
  or public.bridge_support_can_access_record(
    organisation_id,
    branch_id,
    'lead',
    assigned_user_id,
    assigned_agent_id,
    null
  )
);

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

drop policy if exists private_listings_delete_member_owner on public.private_listings;
create policy private_listings_delete_member_owner
on public.private_listings
for delete
to authenticated
using (
  public.bridge_is_active_member(organisation_id)
  and (
    public.bridge_is_org_admin(organisation_id)
    or assigned_agent_id = auth.uid()
  )
);

drop policy if exists private_listing_activity_select_member on public.private_listing_activity;
create policy private_listing_activity_select_member
on public.private_listing_activity
for select
to authenticated
using (public.bridge_can_access_private_listing(private_listing_id));

drop policy if exists private_listing_activity_insert_member on public.private_listing_activity;
create policy private_listing_activity_insert_member
on public.private_listing_activity
for insert
to authenticated
with check (public.bridge_can_access_private_listing(private_listing_id));

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

drop policy if exists appointments_agency_select on public.appointments;
create policy appointments_agency_select on public.appointments
for select to authenticated
using (
  public.bridge_is_org_admin(organisation_id)
  or agent_id = auth.uid()
  or (
    public.bridge_membership_role(organisation_id) = 'agent'
    and agent_id = auth.uid()
  )
  or public.bridge_support_can_access_record(
    organisation_id,
    null,
    'appointment',
    agent_id,
    null,
    null
  )
);

drop policy if exists appointments_agency_write on public.appointments;
create policy appointments_agency_write on public.appointments
for all to authenticated
using (
  public.bridge_is_org_admin(organisation_id)
  or agent_id = auth.uid()
  or public.bridge_support_can_access_record(
    organisation_id,
    null,
    'appointment',
    agent_id,
    null,
    null
  )
)
with check (
  public.bridge_is_org_admin(organisation_id)
  or (
    public.bridge_membership_role(organisation_id) = 'agent'
    and agent_id = auth.uid()
  )
  or public.bridge_support_can_access_record(
    organisation_id,
    null,
    'appointment',
    agent_id,
    null,
    null
  )
);

drop policy if exists appointments_support_role_select on public.appointments;
create policy appointments_support_role_select on public.appointments
for select
to authenticated
using (
  public.bridge_is_org_admin(organisation_id)
  or agent_id = auth.uid()
  or public.bridge_support_can_access_record(
    organisation_id,
    null,
    'appointment',
    agent_id,
    null,
    null
  )
);

drop policy if exists appointments_support_role_update on public.appointments;
create policy appointments_support_role_update on public.appointments
for update
to authenticated
using (
  public.bridge_is_org_admin(organisation_id)
  or agent_id = auth.uid()
  or public.bridge_support_can_access_record(
    organisation_id,
    null,
    'appointment',
    agent_id,
    null,
    null
  )
)
with check (
  public.bridge_is_org_admin(organisation_id)
  or agent_id = auth.uid()
  or public.bridge_support_can_access_record(
    organisation_id,
    null,
    'appointment',
    agent_id,
    null,
    null
  )
);

drop policy if exists appointment_participants_agency_select on public.appointment_participants;
create policy appointment_participants_agency_select on public.appointment_participants
for select to authenticated
using (
  appointment_participants.user_id = auth.uid()
  or exists (
    select 1
    from public.appointments a
    where a.appointment_id = appointment_participants.appointment_id
      and (
        public.bridge_is_org_admin(a.organisation_id)
        or a.agent_id = auth.uid()
        or public.bridge_support_can_access_record(
          a.organisation_id,
          null,
          'appointment',
          a.agent_id,
          null,
          null
        )
      )
  )
);

drop policy if exists appointment_participants_agency_write on public.appointment_participants;
create policy appointment_participants_agency_write on public.appointment_participants
for all to authenticated
using (
  exists (
    select 1
    from public.appointments a
    where a.appointment_id = appointment_participants.appointment_id
      and (
        public.bridge_is_org_admin(a.organisation_id)
        or a.agent_id = auth.uid()
        or public.bridge_support_can_access_record(
          a.organisation_id,
          null,
          'appointment',
          a.agent_id,
          null,
          null
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.appointments a
    where a.appointment_id = appointment_participants.appointment_id
      and (
        public.bridge_is_org_admin(a.organisation_id)
        or (
          public.bridge_membership_role(a.organisation_id) = 'agent'
          and a.agent_id = auth.uid()
        )
        or public.bridge_support_can_access_record(
          a.organisation_id,
          null,
          'appointment',
          a.agent_id,
          null,
          null
        )
      )
  )
);

drop policy if exists transactions_select_transaction_spine_scope on public.transactions;
create policy transactions_select_transaction_spine_scope
  on public.transactions
  for select
  to authenticated
  using (
    owner_user_id = auth.uid()
    or assigned_user_id = auth.uid()
    or lower(coalesce(assigned_agent_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.bridge_can_access_transaction_spine(id)
  );

drop policy if exists transactions_update_transaction_spine_scope on public.transactions;
create policy transactions_update_transaction_spine_scope
  on public.transactions
  for update
  to authenticated
  using (
    owner_user_id = auth.uid()
    or assigned_user_id = auth.uid()
    or lower(coalesce(assigned_agent_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.bridge_can_access_transaction_spine(id)
  )
  with check (
    owner_user_id = auth.uid()
    or assigned_user_id = auth.uid()
    or lower(coalesce(assigned_agent_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.bridge_can_access_transaction_spine(id)
  );

drop policy if exists transaction_bond_applications_select_scope_hardened on public.transaction_bond_applications;
create policy transaction_bond_applications_select_scope_hardened
  on public.transaction_bond_applications
  for select
  to authenticated
  using (
    public.bridge_can_access_bond_application_scope(id)
    or public.bridge_transaction_scope_is_internal_user()
    or exists (
      select 1
      from public.transactions t
      where t.id = transaction_bond_applications.transaction_id
        and (
          t.owner_user_id = auth.uid()
          or t.assigned_user_id = auth.uid()
          or lower(coalesce(t.assigned_agent_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
          or public.bridge_can_access_transaction_spine(t.id)
        )
    )
  );

drop policy if exists transaction_bond_applications_update_scope_hardened on public.transaction_bond_applications;
create policy transaction_bond_applications_update_scope_hardened
  on public.transaction_bond_applications
  for update
  to authenticated
  using (
    public.bridge_can_access_bond_application_scope(id)
    or public.bridge_transaction_scope_is_internal_user()
    or exists (
      select 1
      from public.transactions t
      where t.id = transaction_bond_applications.transaction_id
        and (
          t.owner_user_id = auth.uid()
          or t.assigned_user_id = auth.uid()
          or lower(coalesce(t.assigned_agent_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
          or public.bridge_can_access_transaction_spine(t.id)
        )
    )
  )
  with check (
    public.bridge_can_access_bond_application_scope(id)
    or public.bridge_transaction_scope_is_internal_user()
    or exists (
      select 1
      from public.transactions t
      where t.id = transaction_bond_applications.transaction_id
        and (
          t.owner_user_id = auth.uid()
          or t.assigned_user_id = auth.uid()
          or lower(coalesce(t.assigned_agent_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
          or public.bridge_can_access_transaction_spine(t.id)
        )
    )
  );

drop policy if exists transaction_finance_workflows_owner_agent_access on public.transaction_finance_workflows;
create policy transaction_finance_workflows_owner_agent_access
  on public.transaction_finance_workflows
  for all
  to authenticated
  using (
    public.bridge_transaction_scope_is_internal_user()
    or exists (
      select 1
      from public.transactions t
      where t.id = transaction_finance_workflows.transaction_id
        and (
          t.owner_user_id = auth.uid()
          or t.assigned_user_id = auth.uid()
          or lower(coalesce(t.assigned_agent_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
          or public.bridge_can_access_transaction_spine(t.id)
        )
    )
  )
  with check (
    public.bridge_transaction_scope_is_internal_user()
    or exists (
      select 1
      from public.transactions t
      where t.id = transaction_finance_workflows.transaction_id
        and (
          t.owner_user_id = auth.uid()
          or t.assigned_user_id = auth.uid()
          or lower(coalesce(t.assigned_agent_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
          or public.bridge_can_access_transaction_spine(t.id)
        )
    )
  );

drop policy if exists canvassing_prospects_insert_member on public.canvassing_prospects;
create policy canvassing_prospects_insert_member
on public.canvassing_prospects
for insert
to authenticated
with check (
  public.bridge_is_active_member(organisation_id)
  and (
    public.bridge_is_org_admin(organisation_id)
    or assigned_agent_id is null
    or assigned_agent_id = auth.uid()
  )
);

drop policy if exists canvassing_prospects_update_member on public.canvassing_prospects;
create policy canvassing_prospects_update_member
on public.canvassing_prospects
for update
to authenticated
using (
  public.bridge_is_active_member(organisation_id)
  and (
    public.bridge_is_org_admin(organisation_id)
    or assigned_agent_id = auth.uid()
  )
)
with check (
  public.bridge_is_active_member(organisation_id)
  and (
    public.bridge_is_org_admin(organisation_id)
    or assigned_agent_id = auth.uid()
  )
);

drop policy if exists canvassing_prospects_delete_member on public.canvassing_prospects;
create policy canvassing_prospects_delete_member
on public.canvassing_prospects
for delete
to authenticated
using (
  public.bridge_is_active_member(organisation_id)
  and (
    public.bridge_is_org_admin(organisation_id)
    or assigned_agent_id = auth.uid()
  )
);

drop policy if exists canvassing_activities_insert_member on public.canvassing_activities;
create policy canvassing_activities_insert_member
on public.canvassing_activities
for insert
to authenticated
with check (
  public.bridge_is_active_member(organisation_id)
  and exists (
    select 1
    from public.canvassing_prospects prospect
    where prospect.id = prospect_id
      and prospect.organisation_id = canvassing_activities.organisation_id
      and (
        public.bridge_is_org_admin(prospect.organisation_id)
        or prospect.assigned_agent_id = auth.uid()
      )
  )
);

drop policy if exists canvassing_activities_delete_member on public.canvassing_activities;
create policy canvassing_activities_delete_member
on public.canvassing_activities
for delete
to authenticated
using (
  public.bridge_is_active_member(organisation_id)
  and exists (
    select 1
    from public.canvassing_prospects prospect
    where prospect.id = prospect_id
      and (
        public.bridge_is_org_admin(prospect.organisation_id)
        or prospect.assigned_agent_id = auth.uid()
      )
  )
);

notify pgrst, 'reload schema';

commit;
