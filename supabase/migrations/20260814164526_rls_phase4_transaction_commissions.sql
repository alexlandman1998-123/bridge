begin;

-- Phase 4 covers the financial transaction commission snapshot table classified
-- in docs/supabase-rls-phase-0-policy-classification.md.

create or replace function public.bridge_can_read_transaction_commission(
  target_organisation_id uuid,
  target_transaction_id uuid,
  target_assigned_agent_id uuid,
  target_assigned_agent_email text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with transaction_scope as (
    select
      tx.organisation_id,
      coalesce(tx.assigned_agent_id, tx.assigned_user_id, tx.owner_user_id) as assigned_agent_id,
      tx.assigned_agent_email
    from public.transactions tx
    where tx.id = target_transaction_id
    limit 1
  ),
  resolved as (
    select
      coalesce(target_organisation_id, transaction_scope.organisation_id) as organisation_id,
      coalesce(target_assigned_agent_id, transaction_scope.assigned_agent_id) as assigned_agent_id,
      lower(coalesce(target_assigned_agent_email, transaction_scope.assigned_agent_email, '')) as assigned_agent_email
    from transaction_scope
    union all
    select
      target_organisation_id,
      target_assigned_agent_id,
      lower(coalesce(target_assigned_agent_email, ''))
    where target_transaction_id is null
  )
  select coalesce(
    public.bridge_is_org_admin(resolved.organisation_id)
    or (
      public.bridge_is_active_member(resolved.organisation_id)
      and (
        resolved.assigned_agent_id = auth.uid()
        or resolved.assigned_agent_email = lower(coalesce(public.bridge_current_email(), ''))
      )
    )
    or (
      target_transaction_id is not null
      and public.bridge_has_transaction_permission(target_transaction_id, 'view_transaction')
    ),
    false
  )
  from resolved
  limit 1
$$;

revoke all on function public.bridge_can_read_transaction_commission(uuid, uuid, uuid, text)
  from public, anon;
grant execute on function public.bridge_can_read_transaction_commission(uuid, uuid, uuid, text)
  to authenticated, service_role;

create or replace function public.bridge_upsert_transaction_commission_snapshot(
  p_transaction_id uuid,
  p_organisation_id uuid default null,
  p_assigned_agent_id uuid default null,
  p_assigned_agent_email text default null,
  p_commission_structure_id uuid default null,
  p_commission_structure_name_snapshot text default null,
  p_sale_price numeric default null,
  p_gross_commission_percentage numeric default null,
  p_gross_commission_amount numeric default null,
  p_agent_split_percentage_snapshot numeric default null,
  p_agency_split_percentage_snapshot numeric default null,
  p_agent_commission_amount numeric default null,
  p_agency_commission_amount numeric default null,
  p_status text default 'projected'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_email text := lower(coalesce(public.bridge_current_email(), ''));
  v_tx public.transactions%rowtype;
  v_existing_id uuid;
  v_organisation_id uuid;
  v_assigned_agent_id uuid;
  v_assigned_agent_email text;
  v_status text := coalesce(nullif(lower(trim(p_status)), ''), 'projected');
  v_commission_id uuid;
begin
  if v_actor is null then
    raise exception 'Authentication is required to write transaction commission snapshots.'
      using errcode = '42501';
  end if;

  if p_transaction_id is null then
    raise exception 'transaction_id is required.'
      using errcode = '23502';
  end if;

  select *
  into v_tx
  from public.transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'Transaction % was not found.', p_transaction_id
      using errcode = 'P0002';
  end if;

  v_organisation_id := coalesce(p_organisation_id, v_tx.organisation_id);
  if v_organisation_id is null then
    raise exception 'organisation_id is required.'
      using errcode = '23502';
  end if;

  if p_organisation_id is not null and v_tx.organisation_id is not null and p_organisation_id <> v_tx.organisation_id then
    raise exception 'Commission organisation does not match the transaction organisation.'
      using errcode = '42501';
  end if;

  v_assigned_agent_id := coalesce(p_assigned_agent_id, v_tx.assigned_agent_id, v_tx.assigned_user_id, v_tx.owner_user_id);
  v_assigned_agent_email := lower(coalesce(nullif(trim(p_assigned_agent_email), ''), v_tx.assigned_agent_email, ''));

  if not (
    public.bridge_is_org_admin(v_organisation_id)
    or public.bridge_has_transaction_permission(p_transaction_id, 'edit_core_transaction')
    or (
      v_status in ('draft', 'projected')
      and public.bridge_is_active_member(v_organisation_id)
      and (
        v_assigned_agent_id = v_actor
        or v_assigned_agent_email = v_actor_email
      )
    )
  ) then
    raise exception 'Not authorized to write this transaction commission snapshot.'
      using errcode = '42501';
  end if;

  select id
  into v_existing_id
  from public.transaction_commissions
  where transaction_id = p_transaction_id
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1
  for update;

  if v_existing_id is null then
    insert into public.transaction_commissions (
      organisation_id,
      transaction_id,
      assigned_agent_id,
      assigned_agent_email,
      commission_structure_id,
      commission_structure_name_snapshot,
      sale_price,
      gross_commission_percentage,
      gross_commission_amount,
      agent_split_percentage_snapshot,
      agency_split_percentage_snapshot,
      agent_commission_amount,
      agency_commission_amount,
      status,
      created_at,
      updated_at
    )
    values (
      v_organisation_id,
      p_transaction_id,
      v_assigned_agent_id,
      nullif(v_assigned_agent_email, ''),
      p_commission_structure_id,
      nullif(trim(p_commission_structure_name_snapshot), ''),
      p_sale_price,
      p_gross_commission_percentage,
      p_gross_commission_amount,
      p_agent_split_percentage_snapshot,
      p_agency_split_percentage_snapshot,
      p_agent_commission_amount,
      p_agency_commission_amount,
      v_status,
      now(),
      now()
    )
    returning id into v_commission_id;
  else
    update public.transaction_commissions
    set
      organisation_id = v_organisation_id,
      assigned_agent_id = v_assigned_agent_id,
      assigned_agent_email = nullif(v_assigned_agent_email, ''),
      commission_structure_id = p_commission_structure_id,
      commission_structure_name_snapshot = nullif(trim(p_commission_structure_name_snapshot), ''),
      sale_price = p_sale_price,
      gross_commission_percentage = p_gross_commission_percentage,
      gross_commission_amount = p_gross_commission_amount,
      agent_split_percentage_snapshot = p_agent_split_percentage_snapshot,
      agency_split_percentage_snapshot = p_agency_split_percentage_snapshot,
      agent_commission_amount = p_agent_commission_amount,
      agency_commission_amount = p_agency_commission_amount,
      status = v_status,
      updated_at = now()
    where id = v_existing_id
    returning id into v_commission_id;
  end if;

  return jsonb_build_object(
    'id', v_commission_id,
    'transactionId', p_transaction_id,
    'organisationId', v_organisation_id,
    'status', v_status
  );
end;
$$;

revoke all on function public.bridge_upsert_transaction_commission_snapshot(
  uuid, uuid, uuid, text, uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text
) from public, anon;
grant execute on function public.bridge_upsert_transaction_commission_snapshot(
  uuid, uuid, uuid, text, uuid, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text
) to authenticated, service_role;

alter table if exists public.transaction_commissions enable row level security;

revoke all on table public.transaction_commissions from public, anon, authenticated;
grant select on table public.transaction_commissions to authenticated;
grant all on table public.transaction_commissions to service_role;

drop policy if exists transaction_commissions_financial_select
  on public.transaction_commissions;
create policy transaction_commissions_financial_select
  on public.transaction_commissions
  for select
  to authenticated
  using (
    public.bridge_can_read_transaction_commission(
      organisation_id,
      transaction_id,
      assigned_agent_id,
      assigned_agent_email
    )
  );

comment on table public.transaction_commissions is
  'Financial transaction commission snapshots. Direct browser writes are blocked; reads are scoped to organisation admins, assigned agents, or transaction participants; writes use bridge_upsert_transaction_commission_snapshot or service-role jobs.';

notify pgrst, 'reload schema';

commit;
