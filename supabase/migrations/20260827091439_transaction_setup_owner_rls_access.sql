create or replace function public.bridge_has_transaction_access(target_transaction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when auth.uid() is null then false
      when public.bridge_is_admin() then true
      when exists (
        select 1
        from public.transactions t
        where t.id = target_transaction_id
          and auth.uid() in (
            t.created_by,
            t.owner_user_id,
            t.assigned_user_id,
            t.assigned_agent_id
          )
      ) then true
      when exists (
        select 1
        from public.transaction_participants tp
        where tp.transaction_id = target_transaction_id
          and tp.can_view = true
          and (
            tp.user_id = auth.uid()
            or lower(coalesce(tp.participant_email, '')) = public.bridge_current_user_email()
          )
      ) then true
      when exists (
        select 1
        from public.transactions t
        where t.id = target_transaction_id
          and (
            (
              public.bridge_current_profile_role() = 'developer'
              and t.development_id is not null
              and public.bridge_has_development_access(t.development_id)
            )
            or (
              public.bridge_current_profile_role() = 'agent'
              and lower(coalesce(t.assigned_agent_email, '')) = public.bridge_current_user_email()
            )
            or (
              public.bridge_current_profile_role() = 'attorney'
              and lower(coalesce(t.assigned_attorney_email, '')) = public.bridge_current_user_email()
            )
            or (
              public.bridge_current_profile_role() = 'bond_originator'
              and lower(coalesce(t.assigned_bond_originator_email, '')) = public.bridge_current_user_email()
            )
          )
      ) then true
      when exists (
        select 1
        from public.transactions t
        join public.buyers b
          on b.id = t.buyer_id
        where t.id = target_transaction_id
          and public.bridge_current_profile_role() = 'client'
          and lower(coalesce(b.email, '')) = public.bridge_current_user_email()
      ) then true
      else false
    end
$$;

create or replace function public.bridge_can_edit_finance_lane(target_transaction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.bridge_is_admin()
    or exists (
      select 1
      from public.transactions t
      where t.id = target_transaction_id
        and public.bridge_current_profile_role() in ('developer', 'agent')
        and auth.uid() in (
          t.created_by,
          t.owner_user_id,
          t.assigned_user_id,
          t.assigned_agent_id
        )
    )
    or exists (
      select 1
      from public.transaction_participants tp
      where tp.transaction_id = target_transaction_id
        and (
          tp.user_id = auth.uid()
          or lower(coalesce(tp.participant_email, '')) = public.bridge_current_user_email()
        )
        and tp.can_edit_finance_workflow = true
    )
    or exists (
      select 1
      from public.transactions t
      where t.id = target_transaction_id
        and public.bridge_current_profile_role() = 'bond_originator'
        and lower(coalesce(t.assigned_bond_originator_email, '')) = public.bridge_current_user_email()
    )
$$;
