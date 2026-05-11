begin;

create or replace function public.bridge_current_user_is_transaction_participant(
  p_transaction_id uuid,
  p_role_type text default null,
  p_require_edit boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.transaction_participants tp
    where tp.transaction_id = p_transaction_id
      and coalesce(tp.can_view, true) = true
      and tp.removed_at is null
      and coalesce(tp.status, 'active') <> 'removed'
      and (
        p_role_type is null
        or lower(coalesce(tp.role_type, '')) = lower(p_role_type)
      )
      and (
        p_require_edit is not true
        or coalesce(tp.can_edit_core_transaction, false) = true
      )
      and (
        tp.user_id = auth.uid()
        or (
          coalesce(tp.participant_email, '') <> ''
          and lower(tp.participant_email) = public.bridge_current_email()
        )
      )
  );
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transactions'
      and column_name in (
        'organisation_id',
        'assigned_user_id',
        'owner_user_id',
        'assigned_agent_email',
        'assigned_attorney_email',
        'assigned_bond_originator_email'
      )
    group by table_schema, table_name
    having count(*) = 6
  ) then
    drop policy if exists transactions_agency_select on public.transactions;
    create policy transactions_agency_select on public.transactions
    for select to authenticated
    using (
      public.bridge_can_access_transaction(
        organisation_id,
        assigned_user_id,
        owner_user_id,
        assigned_agent_email,
        assigned_attorney_email,
        assigned_bond_originator_email
      )
      or public.bridge_current_user_is_transaction_participant(id)
    );

    drop policy if exists transactions_agency_update on public.transactions;
    create policy transactions_agency_update on public.transactions
    for update to authenticated
    using (
      public.bridge_can_access_transaction(
        organisation_id,
        assigned_user_id,
        owner_user_id,
        assigned_agent_email,
        assigned_attorney_email,
        assigned_bond_originator_email
      )
      or public.bridge_current_user_is_transaction_participant(id, null, true)
    )
    with check (
      public.bridge_can_access_transaction(
        organisation_id,
        assigned_user_id,
        owner_user_id,
        assigned_agent_email,
        assigned_attorney_email,
        assigned_bond_originator_email
      )
      or public.bridge_current_user_is_transaction_participant(id, null, true)
    );
  else
    raise notice 'transactions_agency policies skipped: transactions organisation/assignment columns are not fully installed in this database.';
  end if;
end $$;

grant execute on function public.bridge_current_user_is_transaction_participant(uuid, text, boolean) to authenticated;

commit;
