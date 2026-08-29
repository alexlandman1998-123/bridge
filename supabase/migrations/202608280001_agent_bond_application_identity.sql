create or replace function public.bridge_agent_bond_application_identity(
  p_transaction_id uuid,
  p_bond_application_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_application public.bond_applications%rowtype;
  v_package public.transaction_bond_application_export_packages%rowtype;
  v_finance_workflow_id uuid;
  v_lender_submission_ids jsonb := '[]'::jsonb;
begin
  if p_transaction_id is null then
    raise exception 'Transaction is required.';
  end if;

  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
    and (auth.uid() is null or not public.bridge_can_access_transaction_spine(p_transaction_id)) then
    raise exception 'You do not have access to this transaction.';
  end if;

  if p_bond_application_id is not null then
    select application.*
    into v_application
    from public.bond_applications application
    where application.id = p_bond_application_id
      and application.transaction_id = p_transaction_id
      and application.status <> 'cancelled';

    if not found then
      raise exception 'The bond application does not belong to this transaction or is not active.';
    end if;
  else
    select application.*
    into v_application
    from public.bond_applications application
    where application.transaction_id = p_transaction_id
      and application.status <> 'cancelled'
    order by application.revision desc, application.created_at desc
    limit 1;
  end if;

  if v_application.id is null then
    return jsonb_build_object(
      'version', 'bond-application-identity-v1',
      'available', false,
      'transactionId', p_transaction_id,
      'canonicalBondApplicationId', null,
      'activeSubmissionId', null,
      'exportPackageId', null,
      'financeWorkflowId', null,
      'transactionBondApplicationId', null,
      'lenderSubmissionIds', '[]'::jsonb
    );
  end if;

  select package.*
  into v_package
  from public.transaction_bond_application_export_packages package
  where package.transaction_id = p_transaction_id
    and package.bond_application_id = v_application.id
    and package.destination_key = 'bond_originator_intake'
    and package.status not in ('cancelled', 'superseded')
  order by package.package_ready_at desc nulls last, package.created_at desc
  limit 1;

  select workflow.id
  into v_finance_workflow_id
  from public.transaction_finance_workflows workflow
  where workflow.transaction_id = p_transaction_id
    and workflow.workflow_type = 'bond_hybrid'
  order by workflow.created_at desc
  limit 1;

  if v_finance_workflow_id is not null then
    select coalesce(jsonb_agg(application.id order by application.created_at asc), '[]'::jsonb)
    into v_lender_submission_ids
    from public.transaction_bond_applications application
    where application.transaction_id = p_transaction_id
      and application.workflow_id = v_finance_workflow_id;
  end if;

  return jsonb_build_object(
    'version', 'bond-application-identity-v1',
    'available', true,
    'transactionId', p_transaction_id,
    'canonicalBondApplicationId', v_application.id,
    'activeSubmissionId', coalesce(v_application.active_submission_id, v_package.submission_id),
    'exportPackageId', v_package.id,
    'financeWorkflowId', v_finance_workflow_id,
    'transactionBondApplicationId', v_package.transaction_bond_application_id,
    'lenderSubmissionIds', coalesce(v_lender_submission_ids, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.bridge_agent_bond_application_identity(uuid, uuid) from public;
revoke all on function public.bridge_agent_bond_application_identity(uuid, uuid) from anon;
grant execute on function public.bridge_agent_bond_application_identity(uuid, uuid) to authenticated;
grant execute on function public.bridge_agent_bond_application_identity(uuid, uuid) to service_role;

comment on function public.bridge_agent_bond_application_identity(uuid, uuid) is
  'Resolves the active canonical bond application and its originator export, immutable submission, finance workflow and lender-submission identifiers for an accessible transaction. Canonical bond_applications ids remain distinct from transaction_bond_applications lender-submission ids.';
