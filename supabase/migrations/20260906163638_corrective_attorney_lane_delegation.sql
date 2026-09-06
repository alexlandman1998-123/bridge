-- Narrow corrective convergence for partially-live migration 20260906070938; no unrelated module state is touched.
begin;

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

create or replace function public.bridge_grant_attorney_lane_delegation(
  p_transaction_id uuid,
  p_attorney_role text,
  p_delegate_user_id uuid,
  p_capabilities text[],
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_reason text
)
returns public.attorney_lane_delegations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role text := lower(trim(coalesce(p_attorney_role, '')));
  v_capabilities text[];
  v_assignment public.transaction_attorney_assignments;
  v_created public.attorney_lane_delegations;
begin
  if v_actor_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  if v_role not in ('bond_attorney', 'cancellation_attorney') then
    raise exception 'Delegation is available only for bond and cancellation lanes.' using errcode = '22023';
  end if;
  if p_delegate_user_id is null or p_delegate_user_id = v_actor_id then
    raise exception 'Select another active attorney as the delegate.' using errcode = '22023';
  end if;
  if trim(coalesce(p_reason, '')) = '' then raise exception 'A delegation reason is required.' using errcode = '22023'; end if;
  if p_starts_at is null or p_starts_at < now() - interval '5 minutes'
     or p_expires_at is null or p_expires_at <= p_starts_at
     or p_expires_at > p_starts_at + interval '30 days' then
    raise exception 'Delegation must have a valid start and expiry window of no more than 30 days.' using errcode = '22023';
  end if;

  select array_agg(distinct capability order by capability) into v_capabilities
  from unnest(coalesce(p_capabilities, '{}'::text[])) capability
  where capability in ('workflow', 'documents', 'internal_notes', 'shared_updates');
  if cardinality(coalesce(v_capabilities, '{}'::text[])) = 0
     or cardinality(v_capabilities) <> cardinality(coalesce(p_capabilities, '{}'::text[])) then
    raise exception 'Select one or more supported delegation capabilities.' using errcode = '22023';
  end if;

  select * into v_assignment
  from public.transaction_attorney_assignments assignment
  where assignment.transaction_id = p_transaction_id
    and assignment.attorney_role = v_role
    and coalesce(assignment.assignment_status, assignment.status) = 'active'
  order by assignment.updated_at desc nulls last
  limit 1;
  if v_assignment.id is null then raise exception 'The responsible lane must be active before delegation.' using errcode = '22023'; end if;
  if ('workflow' = any(v_capabilities) and not coalesce(v_assignment.can_update_workflow_lane, true))
     or ('documents' = any(v_capabilities) and not coalesce(v_assignment.can_manage_documents, true))
     or ('internal_notes' = any(v_capabilities) and not coalesce(v_assignment.can_add_internal_notes, true))
     or ('shared_updates' = any(v_capabilities) and not coalesce(v_assignment.can_add_shared_updates, true)) then
    raise exception 'Delegation cannot exceed the responsible lane assignment capabilities.' using errcode = '42501';
  end if;
  if not (
    public.attorney_user_is_firm_lead(coalesce(v_assignment.attorney_firm_id, v_assignment.firm_id))
    or v_actor_id in (v_assignment.attorney_user_id, v_assignment.primary_attorney_id, v_assignment.assigned_user_id)
  ) then
    raise exception 'Only the responsible lane attorney or firm lead may grant delegation.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.transaction_attorney_assignments transfer_assignment
    where transfer_assignment.transaction_id = p_transaction_id
      and coalesce(transfer_assignment.assignment_status, transfer_assignment.status) = 'active'
      and (
        transfer_assignment.attorney_role = 'transfer_attorney'
        or transfer_assignment.assignment_type in ('transfer', 'transfer_and_bond')
      )
      and p_delegate_user_id in (
        transfer_assignment.attorney_user_id,
        transfer_assignment.primary_attorney_id,
        transfer_assignment.assigned_user_id
      )
  ) then
    raise exception 'The delegate must be the active transfer attorney for this matter.' using errcode = '22023';
  end if;

  update public.attorney_lane_delegations
  set status = 'revoked', revoked_at = now(), revoked_by = v_actor_id,
      revocation_reason = 'Replaced by a new delegation grant.', updated_at = now()
  where transaction_id = p_transaction_id and attorney_role = v_role
    and delegate_user_id = p_delegate_user_id and status = 'active';

  insert into public.attorney_lane_delegations (
    transaction_id, attorney_role, responsible_firm_id, delegate_user_id,
    capabilities, reason, starts_at, expires_at, granted_by
  ) values (
    p_transaction_id, v_role, coalesce(v_assignment.attorney_firm_id, v_assignment.firm_id),
    p_delegate_user_id, v_capabilities, trim(p_reason), p_starts_at, p_expires_at, v_actor_id
  ) returning * into v_created;

  insert into public.transaction_events (
    transaction_id, event_type, event_data, created_by, created_by_role, visibility_scope
  ) values (
    p_transaction_id, 'TransactionUpdated', jsonb_build_object(
      'originalEventType', 'AttorneyLaneDelegationGranted', 'delegationId', v_created.id,
      'attorneyRole', v_role, 'delegateUserId', p_delegate_user_id,
      'capabilities', v_capabilities, 'startsAt', p_starts_at, 'expiresAt', p_expires_at,
      'responsibleFirmId', v_created.responsible_firm_id
    ), v_actor_id, v_role, 'internal'
  );
  return v_created;
end;
$$;

create or replace function public.bridge_revoke_attorney_lane_delegation(
  p_delegation_id uuid,
  p_reason text
)
returns public.attorney_lane_delegations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_delegation public.attorney_lane_delegations;
begin
  if v_actor_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  if trim(coalesce(p_reason, '')) = '' then raise exception 'A revocation reason is required.' using errcode = '22023'; end if;
  select * into v_delegation from public.attorney_lane_delegations where id = p_delegation_id for update;
  if v_delegation.id is null then raise exception 'Delegation was not found.' using errcode = 'P0002'; end if;
  if not (
    v_actor_id = v_delegation.granted_by
    or public.attorney_user_is_firm_lead(v_delegation.responsible_firm_id)
  ) then raise exception 'Only the grantor or responsible firm lead may revoke delegation.' using errcode = '42501'; end if;
  if v_delegation.status <> 'active' then return v_delegation; end if;

  update public.attorney_lane_delegations set
    status = 'revoked', revoked_at = now(), revoked_by = v_actor_id,
    revocation_reason = trim(p_reason), updated_at = now()
  where id = p_delegation_id returning * into v_delegation;

  insert into public.transaction_events (
    transaction_id, event_type, event_data, created_by, created_by_role, visibility_scope
  ) values (
    v_delegation.transaction_id, 'TransactionUpdated', jsonb_build_object(
      'originalEventType', 'AttorneyLaneDelegationRevoked', 'delegationId', v_delegation.id,
      'attorneyRole', v_delegation.attorney_role, 'delegateUserId', v_delegation.delegate_user_id
    ), v_actor_id, v_delegation.attorney_role, 'internal'
  );
  return v_delegation;
end;
$$;

-- Extend the canonical lane mutation boundary. Direct assignment remains the
-- first path; delegation is an additional matter/lane/capability-scoped path.
create or replace function public.bridge_can_mutate_attorney_lane(
  p_transaction_id uuid,
  p_attorney_role text,
  p_capability text default 'workflow'
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role text := lower(trim(coalesce(p_attorney_role, '')));
  v_capability text := lower(trim(coalesce(p_capability, 'workflow')));
begin
  if p_transaction_id is null or v_actor_id is null
     or v_role not in ('transfer_attorney', 'bond_attorney', 'cancellation_attorney')
     or v_capability not in ('workflow', 'documents', 'internal_notes', 'shared_updates') then return false; end if;

  if exists (
    select 1 from public.transaction_attorney_assignments assignment
    where assignment.transaction_id = p_transaction_id
      and coalesce(assignment.assignment_status, assignment.status) = 'active'
      and case v_role
        when 'transfer_attorney' then assignment.attorney_role = 'transfer_attorney' or assignment.assignment_type in ('transfer', 'transfer_and_bond')
        when 'bond_attorney' then assignment.attorney_role = 'bond_attorney' or assignment.assignment_type in ('bond', 'transfer_and_bond')
        when 'cancellation_attorney' then assignment.attorney_role = 'cancellation_attorney' or assignment.assignment_type in ('cancellation', 'bond_cancellation')
        else false end
      and case v_capability
        when 'workflow' then coalesce(assignment.can_update_workflow_lane, true) and v_actor_id in (assignment.attorney_user_id, assignment.primary_attorney_id, assignment.assigned_user_id)
        when 'documents' then coalesce(assignment.can_manage_documents, true) and v_actor_id in (assignment.attorney_user_id, assignment.primary_attorney_id, assignment.assigned_user_id, assignment.secretary_id, assignment.admin_handler_id)
        when 'internal_notes' then coalesce(assignment.can_add_internal_notes, true) and v_actor_id in (assignment.attorney_user_id, assignment.primary_attorney_id, assignment.assigned_user_id)
        when 'shared_updates' then coalesce(assignment.can_add_shared_updates, true) and v_actor_id in (assignment.attorney_user_id, assignment.primary_attorney_id, assignment.assigned_user_id)
        else false end
  ) then return true; end if;

  return exists (
    select 1 from public.attorney_lane_delegations delegation
    where delegation.transaction_id = p_transaction_id
      and delegation.attorney_role = v_role
      and delegation.delegate_user_id = v_actor_id
      and delegation.status = 'active'
      and delegation.starts_at <= now() and delegation.expires_at > now()
      and v_capability = any(delegation.capabilities)
      and exists (
        select 1 from public.transaction_attorney_assignments owner_assignment
        where owner_assignment.transaction_id = delegation.transaction_id
          and owner_assignment.attorney_role = delegation.attorney_role
          and coalesce(owner_assignment.attorney_firm_id, owner_assignment.firm_id) = delegation.responsible_firm_id
          and coalesce(owner_assignment.assignment_status, owner_assignment.status) = 'active'
          and case v_capability
            when 'workflow' then coalesce(owner_assignment.can_update_workflow_lane, true)
            when 'documents' then coalesce(owner_assignment.can_manage_documents, true)
            when 'internal_notes' then coalesce(owner_assignment.can_add_internal_notes, true)
            when 'shared_updates' then coalesce(owner_assignment.can_add_shared_updates, true)
            else false end
      )
  );
end;
$$;

revoke all on function public.bridge_grant_attorney_lane_delegation(uuid, text, uuid, text[], timestamptz, timestamptz, text) from public, anon;
revoke all on function public.bridge_revoke_attorney_lane_delegation(uuid, text) from public, anon;
revoke all on function public.bridge_can_mutate_attorney_lane(uuid, text, text) from public, anon;
grant execute on function public.bridge_grant_attorney_lane_delegation(uuid, text, uuid, text[], timestamptz, timestamptz, text) to authenticated;
grant execute on function public.bridge_revoke_attorney_lane_delegation(uuid, text) to authenticated;
grant execute on function public.bridge_can_mutate_attorney_lane(uuid, text, text) to authenticated;

comment on table public.attorney_lane_delegations is
  'Matter-, lane-, capability-, actor-, and time-scoped authority to act on behalf of a bond or cancellation attorney.';
comment on function public.bridge_can_mutate_attorney_lane(uuid, text, text) is
  'Canonical direct-assignment or explicit-delegation attorney lane mutation boundary.';

notify pgrst, 'reload schema';
commit;
