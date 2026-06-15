begin;
create or replace function public.bridge_is_bond_transaction_canonical_ready(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select
    coalesce(
      (
        select
          case
            when t.id is null then false
            when t.bond_workspace_id is null then false
            when exists (
              select 1
              from public.bond_rls_cutover_exclusions ex
              where ex.transaction_id = t.id
                and ex.active = true
                and ex.exclusion_type in (
                  'accepted_unresolved_legacy',
                  'manual_review',
                  'legacy_compatibility_required',
                  'archived_or_inactive',
                  'not_bond_scoped'
                )
            ) then false
            when coalesce(t.is_active, true) = false then false
            when t.archived_at is not null then false
            when t.cancelled_at is not null then false
            when lower(coalesce(t.lifecycle_state, '')) in ('archived', 'inactive', 'cancelled') then false
            when lower(coalesce(t.operational_state, '')) = 'archived' then false
            else true
          end
        from public.transactions t
        where t.id = transaction_id
      ),
      false
    );
$$;
create or replace function public.bridge_can_access_bond_transaction_canonical(transaction_id uuid)
returns boolean
language sql
stable
as $$
  with workspace_context as (
    select
      public.bridge_bond_transaction_workspace_id(transaction_id) as workspace_id,
      public.bridge_bond_transaction_region_id(transaction_id) as region_id,
      public.bridge_bond_transaction_workspace_unit_id(transaction_id) as workspace_unit_id
  ),
  participant_match as (
    select true as has_access
    from public.transaction_participants tp
    where tp.transaction_id = transaction_id
      and coalesce(tp.status, 'active') = 'active'
      and (
        tp.user_id = auth.uid()
        or (
          tp.participant_email is not null
          and lower(tp.participant_email) = lower(coalesce((
            select coalesce(auth.jwt() ->> 'email', '')
          ), ''))
        )
      )
    limit 1
  ),
  role_player_match as (
    select true as has_access
    from public.transaction_role_players trp
    where trp.transaction_id = transaction_id
      and (
        trp.user_id = auth.uid()
        or (
          trp.email_address is not null
          and lower(trp.email_address) = lower(coalesce((
            select coalesce(auth.jwt() ->> 'email', '')
          ), ''))
        )
      )
      and (
        lower(coalesce(trp.role_type, '')) in ('bond_originator', 'consultant')
        or lower(coalesce(trp.legal_role, '')) in ('bond_originator', 'consultant')
      )
    limit 1
  )
  select
    coalesce(
      (
        select
          case
            when auth.uid() is null then false
            when public.bridge_can_access_bond_assignment(transaction_id) then true
            when (select has_access from participant_match) then true
            when (select has_access from role_player_match) then true
            when (
              select workspace_id from workspace_context
            ) is not null
            and (
              public.bridge_is_bond_workspace_hq_member((select workspace_id from workspace_context))
              or public.bridge_can_access_bond_region(
                (select workspace_id from workspace_context),
                (select region_id from workspace_context)
              )
              or public.bridge_can_access_bond_workspace_unit(
                (select workspace_id from workspace_context),
                (select workspace_unit_id from workspace_context)
              )
            ) then true
            else false
          end
      ),
      false
    );
$$;
create or replace function public.bridge_can_access_bond_transaction_legacy_compat(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select public.bridge_can_access_bond_transaction_shadow(transaction_id);
$$;
create or replace function public.bridge_can_access_bond_transaction_phase5b(transaction_id uuid)
returns boolean
language sql
stable
as $$
  select
    case
      when public.bridge_is_bond_transaction_canonical_ready(transaction_id) then
        public.bridge_can_access_bond_transaction_canonical(transaction_id)
      else
        public.bridge_can_access_bond_transaction_legacy_compat(transaction_id)
    end;
$$;
create policy transactions_select_phase5b_scoped on public.transactions
for select to authenticated
using (
  public.bridge_is_bond_transaction_canonical_ready(id)
  and public.bridge_can_access_bond_transaction_canonical(id)
);
create policy transaction_subprocesses_select_phase5b_scoped on public.transaction_subprocesses
for select to authenticated
using (
  public.bridge_is_bond_transaction_canonical_ready(transaction_id)
  and public.bridge_can_access_bond_transaction_canonical(transaction_id)
  and (
    transaction_subprocesses.visibility_scope = 'shared'
    or public.bridge_is_internal_user()
  )
);
create policy transaction_subprocess_steps_select_phase5b_scoped on public.transaction_subprocess_steps
for select to authenticated
using (
  exists (
    select 1
    from public.transaction_subprocesses tsp
    where tsp.id = transaction_subprocess_steps.subprocess_id
      and public.bridge_is_bond_transaction_canonical_ready(tsp.transaction_id)
      and public.bridge_can_access_bond_transaction_canonical(tsp.transaction_id)
      and (
        transaction_subprocess_steps.visibility_scope = 'shared'
        or public.bridge_is_internal_user()
      )
  )
);
create policy transaction_finance_details_select_phase5b_scoped on public.transaction_finance_details
for select to authenticated
using (
  public.bridge_is_bond_transaction_canonical_ready(transaction_id)
  and public.bridge_can_access_bond_transaction_canonical(transaction_id)
);
create policy document_requests_select_phase5b_scoped on public.document_requests
for select to authenticated
using (
  public.document_requests.transaction_id is not null
  and public.bridge_is_bond_transaction_canonical_ready(public.document_requests.transaction_id)
  and public.bridge_can_access_bond_transaction_canonical(public.document_requests.transaction_id)
);
create policy documents_select_phase5b_scoped on public.documents
for select to authenticated
using (
  public.bridge_is_bond_transaction_canonical_ready(transaction_id)
  and public.bridge_can_access_bond_transaction_canonical(transaction_id)
);
create policy transaction_events_select_phase5b_scoped on public.transaction_events
for select to authenticated
using (
  public.bridge_is_bond_transaction_canonical_ready(transaction_id)
  and public.bridge_can_access_bond_transaction_canonical(transaction_id)
  and (
    visibility_scope = 'shared'
    or public.bridge_is_internal_user()
  )
);
create policy transaction_notifications_select_phase5b_scoped on public.transaction_notifications
for select to authenticated
using (
  public.bridge_is_bond_transaction_canonical_ready(transaction_id)
  and public.bridge_can_access_bond_transaction_canonical(transaction_id)
  and (
    user_id = auth.uid()
    or public.bridge_is_admin()
  )
);
grant execute on function public.bridge_is_bond_transaction_canonical_ready(uuid) to authenticated;
grant execute on function public.bridge_can_access_bond_transaction_canonical(uuid) to authenticated;
grant execute on function public.bridge_can_access_bond_transaction_legacy_compat(uuid) to authenticated;
grant execute on function public.bridge_can_access_bond_transaction_phase5b(uuid) to authenticated;
commit;
