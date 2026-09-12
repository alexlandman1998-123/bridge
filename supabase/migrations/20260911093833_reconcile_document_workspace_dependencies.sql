-- Reconcile only the missing workspace read dependencies; no matter backfill.
begin;
-- Narrow corrective convergence for partially-live migration 20260906070938; no unrelated module state is touched.
create table if not exists public.attorney_lane_delegations (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  attorney_role text not null check (attorney_role in ('bond_attorney', 'cancellation_attorney')),
  responsible_firm_id uuid not null references public.attorney_firms(id) on delete cascade,
  delegate_user_id uuid not null references auth.users(id) on delete cascade,
  capabilities text[] not null,
  reason text not null,
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  granted_by uuid not null references auth.users(id) on delete restrict,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revocation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attorney_lane_delegations_not_self check (delegate_user_id <> granted_by),
  constraint attorney_lane_delegations_valid_window check (expires_at > starts_at),
  constraint attorney_lane_delegations_max_window check (expires_at <= starts_at + interval '30 days'),
  constraint attorney_lane_delegations_capabilities check (
    cardinality(capabilities) > 0
    and capabilities <@ array['workflow', 'documents', 'internal_notes', 'shared_updates']::text[]
  )
);

create index if not exists attorney_lane_delegations_delegate_active_idx
  on public.attorney_lane_delegations (delegate_user_id, transaction_id, attorney_role, status, expires_at);
create index if not exists attorney_lane_delegations_firm_active_idx
  on public.attorney_lane_delegations (responsible_firm_id, status, expires_at);

alter table public.attorney_lane_delegations enable row level security;
revoke all on table public.attorney_lane_delegations from public, anon;
grant select on table public.attorney_lane_delegations to authenticated;

drop policy if exists attorney_lane_delegations_select_involved on public.attorney_lane_delegations;
create policy attorney_lane_delegations_select_involved
  on public.attorney_lane_delegations
  for select
  to authenticated
  using (
    delegate_user_id = auth.uid()
    or granted_by = auth.uid()
    or public.attorney_user_is_firm_lead(responsible_firm_id)
    or exists (
      select 1
      from public.transaction_attorney_assignments assignment
      where assignment.transaction_id = attorney_lane_delegations.transaction_id
        and assignment.attorney_role = attorney_lane_delegations.attorney_role
        and auth.uid() in (assignment.attorney_user_id, assignment.primary_attorney_id, assignment.assigned_user_id)
    )
  );


create table if not exists public.transaction_matter_health (
  transaction_id uuid primary key references public.transactions(id) on delete cascade,
  overall_status text not null default 'in_progress'
    check (overall_status in ('healthy', 'in_progress', 'attention_required', 'at_risk', 'on_hold')),
  estimated_lodgement_date date,
  estimated_registration_date date,
  financial_summary_amount numeric(14,2),
  financial_summary_label text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.transaction_matter_health_audit (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  changed_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists transaction_matter_health_audit_transaction_created_idx
  on public.transaction_matter_health_audit (transaction_id, created_at desc);

alter table public.transaction_matter_health enable row level security;
alter table public.transaction_matter_health_audit enable row level security;

drop policy if exists transaction_matter_health_select_scope on public.transaction_matter_health;
create policy transaction_matter_health_select_scope
  on public.transaction_matter_health
  for select
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_matter_health_insert_scope on public.transaction_matter_health;
create policy transaction_matter_health_insert_scope
  on public.transaction_matter_health
  for insert
  to authenticated
  with check (
    (select public.bridge_is_admin())
    or (select public.bridge_attorney_can_manage_transaction(transaction_id))
    or (
      (select public.bridge_current_profile_role()) = 'attorney'
      and (select public.bridge_has_transaction_access(transaction_id))
    )
  );

drop policy if exists transaction_matter_health_update_scope on public.transaction_matter_health;
create policy transaction_matter_health_update_scope
  on public.transaction_matter_health
  for update
  to authenticated
  using (
    (select public.bridge_is_admin())
    or (select public.bridge_attorney_can_manage_transaction(transaction_id))
    or (
      (select public.bridge_current_profile_role()) = 'attorney'
      and (select public.bridge_has_transaction_access(transaction_id))
    )
  )
  with check (
    (select public.bridge_is_admin())
    or (select public.bridge_attorney_can_manage_transaction(transaction_id))
    or (
      (select public.bridge_current_profile_role()) = 'attorney'
      and (select public.bridge_has_transaction_access(transaction_id))
    )
  );

drop policy if exists transaction_matter_health_audit_select_scope on public.transaction_matter_health_audit;
create policy transaction_matter_health_audit_select_scope
  on public.transaction_matter_health_audit
  for select
  to authenticated
  using (public.bridge_can_access_transaction_spine(transaction_id));

drop policy if exists transaction_matter_health_audit_insert_scope on public.transaction_matter_health_audit;
create policy transaction_matter_health_audit_insert_scope
  on public.transaction_matter_health_audit
  for insert
  to authenticated
  with check (
    (select public.bridge_is_admin())
    or (select public.bridge_attorney_can_manage_transaction(transaction_id))
    or (
      (select public.bridge_current_profile_role()) = 'attorney'
      and (select public.bridge_has_transaction_access(transaction_id))
    )
  );

create or replace function public.touch_transaction_matter_health()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists transaction_matter_health_touch on public.transaction_matter_health;
create trigger transaction_matter_health_touch
  before insert or update on public.transaction_matter_health
  for each row execute function public.touch_transaction_matter_health();


revoke all on public.transaction_matter_health, public.transaction_matter_health_audit from public, anon;
grant select, insert, update on public.transaction_matter_health to authenticated;
grant select, insert on public.transaction_matter_health_audit to authenticated;

alter table public.transaction_attorney_assignments
  add column if not exists replaces_assignment_id uuid references public.transaction_attorney_assignments(id),
  add column if not exists replacement_sequence integer not null default 0,
  add column if not exists replacement_reason text;
create index if not exists transaction_attorney_assignments_firm_lifecycle_assurance_idx
  on public.transaction_attorney_assignments (transaction_id, attorney_role, allocation_state, updated_at desc);

create or replace view public.transfer_firm_allocation_lifecycle_v2
with (security_invoker = true)
as
select
  tx.id as transaction_id,
  tx.organisation_id,
  tx.listing_id,
  tx.transaction_reference,
  tx.onboarding_status,
  tx.current_main_stage,
  tx.attorney_stage,
  tx.next_action,
  assignment.id as assignment_id,
  coalesce(assignment.attorney_firm_id, assignment.firm_id) as attorney_firm_id,
  assignment.attorney_user_id,
  assignment.primary_attorney_id,
  assignment.preferred_attorney_user_id,
  assignment.appointment_source,
  assignment.preferred_contact_name,
  assignment.preferred_contact_email,
  assignment.firm_acceptance_status,
  assignment.staff_assignment_status,
  assignment.allocation_state,
  assignment.instruction_status,
  assignment.assignment_status,
  assignment.firm_accepted_at,
  assignment.firm_declined_at,
  assignment.allocation_state_changed_at,
  assignment.replaces_assignment_id,
  assignment.replacement_sequence,
  assignment.replacement_reason,
  coalesce(counts.open_assignment_count, 0) as open_assignment_count,
  coalesce(counts.declined_assignment_count, 0) as declined_assignment_count,
  coalesce(roleplayers.active_roleplayer_count, 0) as active_roleplayer_count,
  extract(epoch from (now() - coalesce(assignment.allocation_state_changed_at, assignment.updated_at))) / 3600.0 as hours_in_allocation_state,
  case
    when assignment.id is null and lower(coalesce(tx.onboarding_status, '')) in ('signed_otp_received', 'otp_uploaded') then 'instruction_missing'
    when assignment.id is null then 'awaiting_instruction'
    else assignment.allocation_state
  end as lifecycle_stage,
  case
    when assignment.allocation_state = 'awaiting_firm_acceptance' then 'accept_or_decline_firm_nomination'
    when assignment.allocation_state = 'awaiting_staff_assignment' then 'assign_primary_attorney'
    when assignment.allocation_state = 'staff_assigned' then 'activate_transfer_matter'
    when assignment.allocation_state = 'declined' then 'nominate_replacement_firm'
    else null
  end as required_action,
  case
    when coalesce(counts.open_assignment_count, 0) > 1 then 'blocked'
    when assignment.allocation_state = 'awaiting_staff_assignment' and assignment.firm_acceptance_status <> 'accepted' then 'blocked'
    when assignment.allocation_state = 'awaiting_staff_assignment' and coalesce(assignment.attorney_user_id, assignment.primary_attorney_id) is not null then 'blocked'
    when assignment.allocation_state = 'staff_assigned' and (
      assignment.staff_assignment_status <> 'staff_assigned'
      or coalesce(assignment.attorney_user_id, assignment.primary_attorney_id) is null
    ) then 'blocked'
    when assignment.allocation_state = 'active' and (
      assignment.firm_acceptance_status <> 'accepted'
      or assignment.staff_assignment_status <> 'staff_assigned'
      or coalesce(assignment.attorney_user_id, assignment.primary_attorney_id) is null
      or assignment.instruction_status <> 'accepted'
    ) then 'blocked'
    when assignment.allocation_state = 'declined' and coalesce(roleplayers.active_roleplayer_count, 0) > 0 then 'blocked'
    when assignment.id is null and lower(coalesce(tx.onboarding_status, '')) in ('signed_otp_received', 'otp_uploaded') then 'attention'
    when assignment.allocation_state = 'awaiting_firm_acceptance'
      and now() - coalesce(assignment.allocation_state_changed_at, assignment.updated_at) > interval '48 hours' then 'attention'
    when assignment.allocation_state = 'awaiting_staff_assignment'
      and now() - coalesce(assignment.allocation_state_changed_at, assignment.updated_at) > interval '24 hours' then 'attention'
    when assignment.allocation_state = 'declined' then 'attention'
    else 'on_track'
  end as lifecycle_health,
  case
    when coalesce(counts.open_assignment_count, 0) > 1 then 'multiple_open_transfer_firm_allocations'
    when assignment.allocation_state = 'awaiting_staff_assignment' and assignment.firm_acceptance_status <> 'accepted' then 'staff_assignment_open_before_firm_acceptance'
    when assignment.allocation_state = 'awaiting_staff_assignment' and coalesce(assignment.attorney_user_id, assignment.primary_attorney_id) is not null then 'person_linked_before_internal_assignment'
    when assignment.allocation_state = 'staff_assigned' and (
      assignment.staff_assignment_status <> 'staff_assigned'
      or coalesce(assignment.attorney_user_id, assignment.primary_attorney_id) is null
    ) then 'staff_assigned_state_missing_primary_attorney'
    when assignment.allocation_state = 'active' and (
      assignment.firm_acceptance_status <> 'accepted'
      or assignment.staff_assignment_status <> 'staff_assigned'
      or coalesce(assignment.attorney_user_id, assignment.primary_attorney_id) is null
      or assignment.instruction_status <> 'accepted'
    ) then 'active_matter_missing_firm_or_person_gate'
    when assignment.allocation_state = 'declined' and coalesce(roleplayers.active_roleplayer_count, 0) > 0 then 'declined_firm_still_has_active_roleplayer'
    when assignment.id is null and lower(coalesce(tx.onboarding_status, '')) in ('signed_otp_received', 'otp_uploaded') then 'missing_instruction_assignment'
    when assignment.allocation_state = 'awaiting_firm_acceptance'
      and now() - coalesce(assignment.allocation_state_changed_at, assignment.updated_at) > interval '48 hours' then 'firm_acceptance_sla_overdue'
    when assignment.allocation_state = 'awaiting_staff_assignment'
      and now() - coalesce(assignment.allocation_state_changed_at, assignment.updated_at) > interval '24 hours' then 'internal_assignment_sla_overdue'
    when assignment.allocation_state = 'declined' then 'replacement_firm_required'
    else null
  end as lifecycle_issue,
  greatest(coalesce(tx.updated_at, '-infinity'::timestamptz), coalesce(assignment.updated_at, '-infinity'::timestamptz)) as lifecycle_updated_at
from public.transactions tx
left join lateral (
  select candidate.*
  from public.transaction_attorney_assignments candidate
  where candidate.transaction_id = tx.id
    and (candidate.attorney_role = 'transfer_attorney' or candidate.assignment_type in ('transfer', 'transfer_and_bond'))
  order by
    case when candidate.allocation_state not in ('declined', 'removed') then 0 else 1 end,
    candidate.replacement_sequence desc,
    candidate.updated_at desc
  limit 1
) assignment on true
left join lateral (
  select
    count(*) filter (where candidate.allocation_state not in ('declined', 'removed'))::integer as open_assignment_count,
    count(*) filter (where candidate.allocation_state = 'declined')::integer as declined_assignment_count
  from public.transaction_attorney_assignments candidate
  where candidate.transaction_id = tx.id
    and (candidate.attorney_role = 'transfer_attorney' or candidate.assignment_type in ('transfer', 'transfer_and_bond'))
) counts on true
left join lateral (
  select count(*)::integer as active_roleplayer_count
  from public.transaction_role_players roleplayer
  where roleplayer.transaction_id = tx.id
    and roleplayer.role_type = 'transfer_attorney'
    and coalesce(roleplayer.assignment_status, roleplayer.status, 'selected') not in ('removed', 'declined', 'rejected')
) roleplayers on true
where assignment.id is not null or tx.listing_id is not null;

grant select on public.transfer_firm_allocation_lifecycle_v2 to authenticated;

comment on view public.transfer_firm_allocation_lifecycle_v2 is
  'Phase 7 read-only assurance model for firm nomination, firm acceptance, internal primary assignment, activation, replacement lineage, and SLA drift.';


notify pgrst, 'reload schema';
commit;
