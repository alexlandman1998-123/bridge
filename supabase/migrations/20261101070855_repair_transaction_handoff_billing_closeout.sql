begin;

create or replace function public.bridge_transaction_fee_has_current_otp(p_transaction_id uuid, p_document_id uuid)
returns boolean language sql stable security definer set search_path=public as $function$
  select p_document_id is not null and exists (
    select 1 from public.documents d where d.id=p_document_id and d.transaction_id=p_transaction_id
      and (lower(coalesce(d.category,''))='otp'
        or lower(coalesce(d.document_type,'')) in ('uploaded_otp','signed_otp','signed_otp_uploaded','offer_to_purchase_signed'))
      and coalesce(d.status,'') not in ('deleted','rejected','archived')
  ) and not exists (
    select 1 from public.document_requirement_instances r
    where r.context_type='transaction' and r.context_id=p_transaction_id
      and r.document_definition_key='signed_otp' and r.status not in ('removed','not_applicable')
      and r.satisfied_by_document_id is not null and r.satisfied_by_document_id is distinct from p_document_id
  );
$function$;

revoke all on function public.bridge_transaction_fee_has_current_otp(uuid,uuid) from public,anon,authenticated;

-- Repair the production handoff and finance boundaries without changing historical rows.
CREATE OR REPLACE FUNCTION public.prepare_transaction_handoff_workspace(p_id uuid, p_attempt integer, p_lease uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j public.transaction_handoff_dispatch_jobs; h public.transaction_handoffs; tx public.transactions;
  assignment uuid; domain_id uuid; firm uuid; workflow uuid; candidate uuid; recipient record; contact text; email_count integer; kind text;
begin
  if current_setting('role') not in ('service_role','none') then raise exception 'Worker authorization required' using errcode='42501'; end if;
  -- Match the source-trigger lock order: matter, handoff, then dispatch job.
  select * into j from public.transaction_handoff_dispatch_jobs where id=p_id;
  select * into tx from public.transactions where id=(select transaction_id from public.transaction_handoffs where id=j.handoff_id) for no key update;
  select * into h from public.transaction_handoffs where id=j.handoff_id for update;
  perform 1 from public.transaction_handoffs where id=(select handoff_id from public.transaction_handoff_dispatch_jobs where id=p_id) for update;
  select * into j from public.transaction_handoff_dispatch_jobs where id=p_id for update;
  if p_attempt is null or p_lease is null or j.id is null or j.channel<>'workspace' or j.status<>'leased' or j.attempt_count<>p_attempt or j.lease_token is distinct from p_lease
    or j.lease_expires_at<=now() or not handoff_private.job_current(j) then return jsonb_build_object('prepared',false,'reason','stale_job'); end if;
  if h.role_type='bond_originator' then
    insert into public.transaction_finance_workflows(transaction_id,workflow_type) values(h.transaction_id,'bond_hybrid')
      on conflict(transaction_id,workflow_type) do nothing;
    select id into workflow from public.transaction_finance_workflows where transaction_id=h.transaction_id and workflow_type='bond_hybrid';
    select id,assigned_organisation_id into domain_id,candidate from public.transaction_bond_applications
      where transaction_id=h.transaction_id and application_type='originator_intake' for update;
    if domain_id is not null and candidate is not null and candidate<>h.destination_organisation_id then
      perform public.complete_transaction_handoff_dispatch(j.id,j.attempt_count,j.lease_token,'failed',null,'domain_destination_conflict');
      return jsonb_build_object('prepared',false,'reason','domain_destination_conflict');
    end if;
    if domain_id is null then
      insert into public.transaction_bond_applications(transaction_id,workflow_id,application_type,bank_name,status,assigned_organisation_id,
        assignment_status,assignment_source,scope_level,scope_metadata,metadata)
      values(h.transaction_id,workflow,'originator_intake','Bond Originator Intake','pending',h.destination_organisation_id,
        'organisation_queue','transaction_roleplayer_propagation','workspace_hq',jsonb_build_object('source','durable_handoff','handoffId',h.id),
        jsonb_build_object('source','durable_handoff','handoffId',h.id,'canonicalStatus','new_application')) returning id into domain_id;
    elsif candidate is null then
      update public.transaction_bond_applications set assigned_organisation_id=h.destination_organisation_id where id=domain_id;
    end if;
    update public.transactions set bond_workspace_id=h.destination_organisation_id,
      bond_assignment_status=coalesce(bond_assignment_status,'workspace_assigned'),bond_assignment_source=coalesce(bond_assignment_source,'workflow_assignment'),updated_at=now()
      where id=h.transaction_id;
  else
    select id into firm from public.attorney_firms where organisation_id=h.destination_organisation_id order by id limit 1;
    if firm is null then
      perform public.complete_transaction_handoff_dispatch(j.id,j.attempt_count,j.lease_token,'failed',null,'attorney_firm_not_linked');
      return jsonb_build_object('prepared',false,'reason','attorney_firm_not_linked');
    end if;
    kind:=case h.role_type when 'transfer_attorney' then 'transfer' when 'bond_attorney' then 'bond' else 'cancellation' end;
    select id,coalesce(attorney_firm_id,firm_id) into domain_id,candidate from public.transaction_attorney_assignments
      where transaction_id=h.transaction_id and attorney_role=h.role_type and coalesce(assignment_status,status,'') not in ('removed','completed')
      order by updated_at desc,id limit 1 for update;
    if domain_id is not null and candidate is distinct from firm then
      perform public.complete_transaction_handoff_dispatch(j.id,j.attempt_count,j.lease_token,'failed',null,'domain_destination_conflict');
      return jsonb_build_object('prepared',false,'reason','domain_destination_conflict');
    end if;
    if domain_id is null then
      insert into public.transaction_attorney_assignments(transaction_id,firm_id,attorney_firm_id,attorney_role,assignment_type,
        status,assignment_status,is_primary,instruction_status,firm_acceptance_status,staff_assignment_status,allocation_state)
      values(h.transaction_id,firm,firm,h.role_type,kind,'pending','pending',true,'ready_for_acceptance',
        'awaiting_firm_acceptance','awaiting_staff_assignment','awaiting_firm_acceptance') returning id into domain_id;
    else
      update public.transaction_attorney_assignments set instruction_status='ready_for_acceptance',updated_at=now()
      where id=domain_id and instruction_status not in ('accepted','declined','removed','completed');
    end if;
  end if;
  select id into assignment from public.transaction_partner_assignments where transaction_id=h.transaction_id
    and partner_organisation_id=h.destination_organisation_id and partner_role=h.role_type and assignment_status='active'
    order by created_at,id limit 1;
  if assignment is null then
    insert into public.transaction_partner_assignments(transaction_id,agency_organisation_id,partner_organisation_id,partner_service_type,
      partner_role,delivery_type,assignment_status,source,activated_at,pending_work_delivery)
    values(h.transaction_id,h.owner_organisation_id,h.destination_organisation_id,
      case when h.role_type='bond_originator' then 'bond_origination' else 'property_transfers' end,h.role_type,h.handoff_type,'active','routing',now(),
      jsonb_build_object('handoffId',h.id,'generation',h.dispatch_generation,'organisationLevelAssignment',true)) returning id into assignment;
  end if;
  -- Stable notification identity: email retries never duplicate or reset it.
  insert into public.partner_portal_notifications(id,transaction_partner_assignment_id,organisation_id,partner_id,bond_application_id,notification_type,title)
    values(j.id,assignment,h.owner_organisation_id,h.destination_organisation_id,case when h.role_type='bond_originator' then domain_id end,
      'organisation_handoff_ready','A new partner instruction is ready') on conflict(id) do nothing;
  if h.workspace_prepared_at is null then
    insert into public.transaction_events(transaction_id,event_type,event_data) values(h.transaction_id,'organisation_handoff_prepared',
      jsonb_build_object('handoffId',h.id,'generation',h.dispatch_generation,'organisationId',h.destination_organisation_id,'roleType',h.role_type,
        'domainRecordId',domain_id,'partnerAssignmentId',assignment,'visibility','client_visible','audience','buyer',
        'title','Partner matter prepared','description','The partner organisation can receive this matter. Delivery and acceptance are tracked separately.'));
  end if;
  update public.transaction_handoffs set workspace_prepared_at=coalesce(workspace_prepared_at,now()) where id=h.id;
  select contacts.email into contact from public.organisations o
    cross join lateral (values (1,lower(trim(to_jsonb(o)->>'company_email'))),
      (2,lower(trim(to_jsonb(o)->>'primary_contact_email')))) contacts(priority,email)
    where o.id=h.destination_organisation_id and contacts.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    order by contacts.priority limit 1;
  for recipient in
    select distinct email from (
      select contact as email where contact is not null
      union all
      select lower(trim(u.email)) from public.organisation_users u where u.organisation_id=h.destination_organisation_id and u.status='active'
        and contact is null and lower(u.role) in ('owner','admin','organisation_admin','workspace_admin','principal','firm_admin','director_partner','director','hq_manager','bond_manager','manager')
        and coalesce(to_jsonb(u)->>'scope_level','workspace_hq') in ('workspace_hq','organisation','organization')
        and (to_jsonb(u)->>'scope_level' is not null or nullif(to_jsonb(u)->>'branch_id','') is null)
      union all
      select lower(trim(p.email)) from public.attorney_firm_members m join public.profiles p on p.id=m.user_id
        where contact is null and m.firm_id=firm and m.status='active' and m.role in ('firm_admin','director_partner')
    ) recipients where email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' loop
    insert into public.transaction_handoff_dispatch_jobs(handoff_id,generation,channel,recipient_key,destination_organisation_id,status,context)
      values(h.id,h.dispatch_generation,'email',recipient.email,h.destination_organisation_id,'queued',jsonb_build_object(
        'transactionId',h.transaction_id,'transactionReference',coalesce(to_jsonb(tx)->>'transaction_reference',h.transaction_id::text),
        'roleType',h.role_type,'organisationName',h.destination_company_name,'partnerAssignmentId',assignment,
        'controlledTestRoleSet',to_jsonb(tx)#>>'{metadata,controlledTestRoleSet}',
        'testDataProtection',coalesce(to_jsonb(tx)#>'{metadata,testDataProtection}',jsonb_build_object('isTestData',coalesce(to_jsonb(tx)->>'is_demo_data','false')='true')))) on conflict do nothing;
  end loop;
  select count(*) into email_count from public.transaction_handoff_dispatch_jobs where handoff_id=h.id and generation=h.dispatch_generation and channel='email';
  if email_count=0 then
    perform public.complete_transaction_handoff_dispatch(j.id,j.attempt_count,j.lease_token,'failed',null,'organisation_contact_missing');
    return jsonb_build_object('prepared',true,'reason','organisation_contact_missing');
  end if;
  perform public.complete_transaction_handoff_dispatch(j.id,j.attempt_count,j.lease_token,'sent');
  return jsonb_build_object('prepared',true,'recipientCount',email_count);
end $function$;

CREATE OR REPLACE FUNCTION public.bridge_apply_commission_structure_to_transaction(p_transaction_id uuid, p_commission_structure_id uuid DEFAULT NULL::uuid, p_actor_id uuid DEFAULT auth.uid())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  tx_row public.transactions%rowtype;
  commission_row public.transaction_commissions%rowtype;
  resolved jsonb;
  structure_row public.commission_structures%rowtype;
  rule_row public.commission_structure_rules%rowtype;
  v_sale_price numeric(14,2);
  v_gross_amount numeric(14,2);
  v_agent_amount numeric(14,2);
  v_agency_amount numeric(14,2);
  v_basis_amount numeric(14,2);
  v_calculated_amount numeric(14,2);
  v_participant_user_id uuid;
  v_participant_org_id uuid;
  v_participant_branch_id uuid;
  v_participant_email text;
  v_participant_name text;
  v_allocation_id uuid;
  v_applied_count integer := 0;
  v_status text;
begin
  if p_transaction_id is null then
    return jsonb_build_object('success', false, 'code', 'transaction_id_required');
  end if;

  select *
    into tx_row
  from public.transactions
  where id = p_transaction_id
  limit 1;

  if tx_row.id is null then
    return jsonb_build_object('success', false, 'code', 'transaction_not_found');
  end if;

  if pg_trigger_depth() = 0
     and not public.bridge_is_org_admin(tx_row.organisation_id)
     and not public.bridge_is_active_member(tx_row.organisation_id)
     and coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('success', false, 'code', 'forbidden');
  end if;

  select *
    into commission_row
  from public.transaction_commissions
  where transaction_id = tx_row.id
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;

  if p_commission_structure_id is not null then
    select *
      into structure_row
    from public.commission_structures
    where id = p_commission_structure_id
      and organisation_id = tx_row.organisation_id
      and status = 'active'
    limit 1;

    if structure_row.id is null then
      perform public.bridge_sync_legacy_commission_structure(p_commission_structure_id);
      select *
        into structure_row
      from public.commission_structures
      where id = p_commission_structure_id
        and organisation_id = tx_row.organisation_id
        and status = 'active'
      limit 1;
    end if;
  end if;

  if structure_row.id is null then
    resolved := public.bridge_resolve_commission_structure(
      tx_row.organisation_id,
      tx_row.id,
      coalesce(commission_row.assigned_agent_id, tx_row.assigned_agent_id, tx_row.assigned_user_id),
      coalesce(commission_row.assigned_agent_email, tx_row.assigned_agent_email),
      coalesce(tx_row.transaction_type, 'default'),
      tx_row.property_type,
      null
    );

    if coalesce((resolved->>'success')::boolean, false) is not true then
      return resolved || jsonb_build_object('applied', false, 'transaction_id', tx_row.id);
    end if;

    select *
      into structure_row
    from public.commission_structures
    where id = (resolved->>'commission_structure_id')::uuid
    limit 1;
  end if;

  v_sale_price := coalesce(commission_row.sale_price, tx_row.purchase_price, tx_row.sales_price);
  v_gross_amount := coalesce(
    commission_row.gross_commission_amount,
    tx_row.gross_commission_amount,
    case
      when v_sale_price is not null and coalesce(commission_row.gross_commission_percentage, tx_row.gross_commission_percentage) is not null
        then round((v_sale_price * coalesce(commission_row.gross_commission_percentage, tx_row.gross_commission_percentage)) / 100, 2)
      else null
    end
  );
  v_agent_amount := coalesce(commission_row.agent_commission_amount, tx_row.agent_commission_amount);
  v_agency_amount := coalesce(commission_row.agency_commission_amount, tx_row.agency_commission_amount);
  -- Canonical allocations require their own review; aggregate legacy status is not a payment receipt.
  v_status := 'projected';

  update public.transaction_commission_allocations
    set status = 'cancelled',
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('cancelled_by', 'phase_3_structure_reapply'),
        updated_at = now()
  where transaction_id = tx_row.id
    and source_referral_id is null
    and allocation_type not in ('internal_referral', 'external_referral')
    and status = 'projected'
    and locked_at is null
    and not exists (select 1 from public.commission_allocation_review_events review where review.allocation_id = transaction_commission_allocations.id)
    and metadata->>'source' = 'phase_3_commission_structure_apply'
    and commission_structure_id is distinct from structure_row.id;

  for rule_row in
    select *
    from public.commission_structure_rules
    where commission_structure_id = structure_row.id
      and allocation_type not in ('internal_referral', 'external_referral')
    order by priority asc, created_at asc
  loop
    v_basis_amount := case rule_row.calculation_basis
      when 'agent_commission' then v_agent_amount
      when 'agency_commission' then v_agency_amount
      when 'fixed_amount' then null
      else v_gross_amount
    end;
    v_calculated_amount := case
      when rule_row.fixed_amount is not null then rule_row.fixed_amount
      when v_basis_amount is not null and rule_row.percentage is not null then round((v_basis_amount * rule_row.percentage) / 100, 2)
      else null
    end;
    v_calculated_amount := greatest(
      coalesce(rule_row.floor_amount, 0),
      coalesce(v_calculated_amount, 0)
    );
    if rule_row.cap_amount is not null then
      v_calculated_amount := least(v_calculated_amount, rule_row.cap_amount);
    end if;

    v_participant_user_id := case rule_row.participant_role
      when 'listing_agent' then coalesce(tx_row.owner_user_id, tx_row.created_by, tx_row.assigned_agent_id, tx_row.assigned_user_id, commission_row.assigned_agent_id)
      when 'selling_agent' then coalesce(commission_row.assigned_agent_id, tx_row.assigned_agent_id, tx_row.assigned_user_id)
      else null
    end;
    v_participant_org_id := case
      when rule_row.participant_role in ('agency', 'principal') then tx_row.organisation_id
      else null
    end;
    v_participant_branch_id := case
      when rule_row.participant_role in ('source_branch', 'target_branch') then tx_row.assigned_branch_id
      else null
    end;
    v_participant_email := case
      when rule_row.participant_role in ('listing_agent', 'selling_agent') then coalesce(commission_row.assigned_agent_email, tx_row.assigned_agent_email)
      else null
    end;
    v_participant_name := case
      when rule_row.participant_role in ('listing_agent', 'selling_agent') then tx_row.assigned_agent
      when rule_row.participant_role = 'agency' then 'Agency'
      else null
    end;

    select id
      into v_allocation_id
    from public.transaction_commission_allocations
    where transaction_id = tx_row.id
      and commission_structure_rule_id = rule_row.id
      and source_referral_id is null
      and status <> 'cancelled'
    limit 1;

    if v_allocation_id is null then
      insert into public.transaction_commission_allocations (
        transaction_id,
        organisation_id,
        commission_structure_id,
        commission_structure_version,
        commission_structure_rule_id,
        allocation_type,
        scope,
        participant_role,
        participant_user_id,
        participant_organisation_id,
        participant_branch_id,
        participant_name,
        participant_email,
        calculation_basis,
        allocation_pool,
        percentage,
        fixed_amount,
        gross_commission_amount_snapshot,
        basis_amount_snapshot,
        calculated_amount,
        approved_amount,
        currency,
        status,
        requires_approval,
        source_snapshot_json,
        metadata,
        created_by
      )
      values (
        tx_row.id,
        tx_row.organisation_id,
        structure_row.id,
        structure_row.version,
        rule_row.id,
        rule_row.allocation_type,
        rule_row.scope,
        rule_row.participant_role,
        v_participant_user_id,
        v_participant_org_id,
        v_participant_branch_id,
        v_participant_name,
        v_participant_email,
        rule_row.calculation_basis,
        rule_row.allocation_pool,
        rule_row.percentage,
        rule_row.fixed_amount,
        v_gross_amount,
        v_basis_amount,
        v_calculated_amount,
        case when v_status in ('approved', 'due', 'paid') then v_calculated_amount else null end,
        'ZAR',
        v_status,
        rule_row.requires_approval,
        jsonb_strip_nulls(jsonb_build_object(
          'transaction_id', tx_row.id,
          'transaction_commission_id', commission_row.id,
          'commission_structure_id', structure_row.id,
          'commission_structure_version', structure_row.version,
          'commission_structure_rule_id', rule_row.id,
          'sale_price', v_sale_price
        )),
        jsonb_build_object('source', 'phase_3_commission_structure_apply'),
        p_actor_id
      )
      returning id into v_allocation_id;
    else
      -- Aggregate commission updates must not overwrite reviewed amounts or decisions.
      if exists (
        select 1 from public.transaction_commission_allocations allocation
        where allocation.id = v_allocation_id
          and (allocation.status <> 'projected' or allocation.locked_at is not null
            or exists (select 1 from public.commission_allocation_review_events review where review.allocation_id = allocation.id))
      ) then
        v_applied_count := v_applied_count + 1;
        continue;
      end if;
      update public.transaction_commission_allocations
        set commission_structure_id = structure_row.id,
            commission_structure_version = structure_row.version,
            allocation_type = rule_row.allocation_type,
            scope = rule_row.scope,
            participant_role = rule_row.participant_role,
            participant_user_id = v_participant_user_id,
            participant_organisation_id = v_participant_org_id,
            participant_branch_id = v_participant_branch_id,
            participant_name = v_participant_name,
            participant_email = v_participant_email,
            calculation_basis = rule_row.calculation_basis,
            allocation_pool = rule_row.allocation_pool,
            percentage = rule_row.percentage,
            fixed_amount = rule_row.fixed_amount,
            gross_commission_amount_snapshot = v_gross_amount,
            basis_amount_snapshot = v_basis_amount,
            calculated_amount = v_calculated_amount,
            approved_amount = case when v_status in ('approved', 'due', 'paid') then v_calculated_amount else approved_amount end,
            status = v_status,
            requires_approval = rule_row.requires_approval,
            source_snapshot_json = jsonb_strip_nulls(jsonb_build_object(
              'transaction_id', tx_row.id,
              'transaction_commission_id', commission_row.id,
              'commission_structure_id', structure_row.id,
              'commission_structure_version', structure_row.version,
              'commission_structure_rule_id', rule_row.id,
              'sale_price', v_sale_price
            )),
            metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('last_synced_by', 'phase_3_commission_structure_apply'),
            updated_at = now()
      where id = v_allocation_id;
    end if;

    v_applied_count := v_applied_count + 1;
  end loop;

  return jsonb_build_object(
    'success', true,
    'code', 'applied',
    'transaction_id', tx_row.id,
    'commission_structure_id', structure_row.id,
    'commission_structure_version', structure_row.version,
    'applied_rule_count', v_applied_count
  );
end;
$function$;

-- Legal registration may precede payment. Only final completion/archive is financial closeout.
CREATE OR REPLACE FUNCTION public.bridge_is_transaction_closeout_state(p_stage text DEFAULT NULL::text, p_current_main_stage text DEFAULT NULL::text, p_lifecycle_state text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  select exists (
    select 1
    from unnest(array[p_stage, p_current_main_stage, p_lifecycle_state]) as state(raw_value)
    where regexp_replace(lower(trim(coalesce(state.raw_value, ''))), '[^a-z0-9]+', '_', 'g') in (
      'completed',
      'complete',
      'closed',
      'settled',
      'archived'
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.bridge_closeout_transaction_with_commission_check(p_transaction_id uuid, p_stage text DEFAULT 'Registered'::text, p_lifecycle_state text DEFAULT 'completed'::text, p_override boolean DEFAULT false, p_override_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  tx_row public.transactions%rowtype;
  updated_tx_row public.transactions%rowtype;
  v_validation jsonb;
  v_reason text := nullif(trim(coalesce(p_override_reason, '')), '');
  v_actor_id uuid := auth.uid();
  v_actor_email text := public.bridge_current_email();
  v_action text;
  v_stage text := public.bridge_normalize_transaction_stage(p_stage);
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('success', false, 'code', 'forbidden');
  end if;
  if p_transaction_id is null then
    return jsonb_build_object('success', false, 'code', 'transaction_id_required');
  end if;

  select *
    into tx_row
  from public.transactions
  where id = p_transaction_id
  for update;

  if tx_row.id is null then
    return jsonb_build_object('success', false, 'code', 'transaction_not_found');
  end if;

  -- Authorize before either blocked-attempt events or successful closeout writes.
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.bridge_is_active_member(tx_row.organisation_id)
     and not public.bridge_is_org_admin(tx_row.organisation_id) then
    return jsonb_build_object('success', false, 'code', 'forbidden');
  end if;

  if v_stage is null or v_stage not in ('Registration','Registered') or p_lifecycle_state not in ('completed','archived') then
    return jsonb_build_object('success', false, 'code', 'invalid_closeout_state');
  end if;
  if not public.bridge_is_transaction_closeout_state(p_stage, p_stage, p_lifecycle_state) then
    return jsonb_build_object('success', false, 'code', 'invalid_closeout_state');
  end if;

  if tx_row.lifecycle_state not in ('registered','completed','archived') then
    return jsonb_build_object('success',false,'code','registration_required');
  end if;

  if p_override and v_reason is null then
    return jsonb_build_object('success', false, 'code', 'override_reason_required');
  end if;

  v_validation := public.bridge_validate_transaction_commission_closeout(p_transaction_id, p_override);

  if coalesce((v_validation->>'success')::boolean, false) = false then
    insert into public.commission_closeout_events (
      transaction_id,
      organisation_id,
      action,
      from_stage,
      to_stage,
      from_current_main_stage,
      to_current_main_stage,
      from_lifecycle_state,
      to_lifecycle_state,
      active_allocation_count,
      unresolved_allocation_count,
      unresolved_amount,
      reason,
      actor_id,
      actor_email,
      metadata
    )
    values (
      tx_row.id,
      tx_row.organisation_id,
      'blocked',
      tx_row.stage,
      p_stage,
      tx_row.current_main_stage,
      p_stage,
      tx_row.lifecycle_state,
      p_lifecycle_state,
      coalesce((v_validation->>'active_allocation_count')::integer, 0),
      coalesce((v_validation->>'unresolved_allocation_count')::integer, 0),
      coalesce((v_validation->>'unresolved_amount')::numeric, 0),
      coalesce(v_reason, v_validation->>'code'),
      v_actor_id,
      v_actor_email,
      jsonb_build_object('validation', v_validation)
    );

    return v_validation;
  end if;

  v_action := case
    when p_override and coalesce((v_validation->>'unresolved_allocation_count')::integer, 0) > 0 then 'override_closed_out'
    else 'closed_out'
  end;

  if v_action = 'override_closed_out' then
    perform set_config('bridge.commission_closeout_override_transaction_id', p_transaction_id::text, true);
  end if;

  update public.transactions
    set stage = v_stage,
        current_main_stage = case when v_stage in ('Registration', 'Registered') then 'REG' else tx_row.current_main_stage end,
        lifecycle_state = p_lifecycle_state,
        completed_at = case when p_lifecycle_state='completed' then coalesce(completed_at,now()) else completed_at end,
        completed_by_user_id = case when p_lifecycle_state='completed' then coalesce(completed_by_user_id,v_actor_id) else completed_by_user_id end,
        archived_at = case when p_lifecycle_state='archived' then coalesce(archived_at,now()) else archived_at end,
        archived_by_user_id = case when p_lifecycle_state='archived' then coalesce(archived_by_user_id,v_actor_id) else archived_by_user_id end,
        updated_at = now()
  where id = p_transaction_id
  returning * into updated_tx_row;

  insert into public.commission_closeout_events (
    transaction_id,
    organisation_id,
    action,
    from_stage,
    to_stage,
    from_current_main_stage,
    to_current_main_stage,
    from_lifecycle_state,
    to_lifecycle_state,
    active_allocation_count,
    unresolved_allocation_count,
    unresolved_amount,
    reason,
    actor_id,
    actor_email,
    metadata
  )
  values (
    updated_tx_row.id,
    updated_tx_row.organisation_id,
    v_action,
    tx_row.stage,
    updated_tx_row.stage,
    tx_row.current_main_stage,
    updated_tx_row.current_main_stage,
    tx_row.lifecycle_state,
    updated_tx_row.lifecycle_state,
    coalesce((v_validation->>'active_allocation_count')::integer, 0),
    coalesce((v_validation->>'unresolved_allocation_count')::integer, 0),
    coalesce((v_validation->>'unresolved_amount')::numeric, 0),
    v_reason,
    v_actor_id,
    v_actor_email,
    jsonb_build_object(
      'validation', v_validation,
      'override', p_override,
      'requested_stage', p_stage,
      'requested_lifecycle_state', p_lifecycle_state
    )
  );

  return jsonb_build_object(
    'success', true,
    'code', v_action,
    'transaction_id', updated_tx_row.id,
    'organisation_id', updated_tx_row.organisation_id,
    'stage', updated_tx_row.stage,
    'current_main_stage', updated_tx_row.current_main_stage,
    'lifecycle_state', updated_tx_row.lifecycle_state,
    'validation', v_validation
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.bridge_record_transaction_fee_control(p_transaction_id uuid, p_otp_document_id uuid, p_billing_party_type text, p_consent_and_fee_terms_confirmed boolean, p_confirmation_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_transaction public.transactions%rowtype;
  v_control public.transaction_fee_controls%rowtype;
  v_billing_party_type text := lower(nullif(trim(coalesce(p_billing_party_type, '')), ''));
  v_note text := nullif(left(trim(coalesce(p_confirmation_note, '')), 1000), '');
  v_now timestamptz := now();
  v_created boolean := false;
  v_evidence_changed boolean := false;
begin
  if auth.uid() is null then
    raise exception 'An authenticated user is required to record a transaction fee control.' using errcode = '42501';
  end if;

  if p_transaction_id is null or not public.bridge_can_access_transaction_spine(p_transaction_id) then
    raise exception 'You do not have access to record this transaction fee control.' using errcode = '42501';
  end if;

  if v_billing_party_type not in ('agent', 'attorney') then
    raise exception 'The transaction fee must be billed to either the agent or attorney.' using errcode = '22023';
  end if;

  if coalesce(p_consent_and_fee_terms_confirmed, false) is not true then
    raise exception 'Confirm that the transaction-fee terms and consent form are included before uploading the OTP.' using errcode = '22023';
  end if;

  select * into v_transaction
  from public.transactions
  where id = p_transaction_id
  for update;

  if not found then
    raise exception 'Transaction not found for fee control.' using errcode = 'P0002';
  end if;

  if not public.bridge_transaction_fee_has_current_otp(p_transaction_id,p_otp_document_id) then
    raise exception 'Select the uploaded signed OTP for this transaction before confirming the transaction fee.' using errcode = '22023';
  end if;

  select * into v_control
  from public.transaction_fee_controls
  where transaction_id = p_transaction_id
  for update;

  if found then
    v_evidence_changed := v_control.otp_document_id is distinct from p_otp_document_id
      or v_control.billing_party_type is distinct from v_billing_party_type;
    if v_control.billing_party_type is distinct from v_billing_party_type and exists (
      select 1 from public.transaction_fee_invoice_queue where fee_control_id = v_control.id and status = 'completed'
    ) then
      raise exception 'This fee has a completed accounting invoice. Finance must resolve that invoice before changing who is billed.' using errcode = '22023';
    end if;
  end if;

  if v_control.id is null then
    insert into public.transaction_fee_controls (
      transaction_id, organisation_id, otp_document_id, billing_party_type,
      consent_and_fee_terms_confirmed, confirmed_at, confirmed_by_user_id,
      confirmation_note, status
    ) values (
      p_transaction_id, v_transaction.organisation_id, p_otp_document_id, v_billing_party_type,
      true, v_now, auth.uid(), v_note, 'verified'
    ) returning * into v_control;
    v_created := true;
  else
    update public.transaction_fee_controls
    set otp_document_id = coalesce(p_otp_document_id, otp_document_id),
        billing_party_type = v_billing_party_type,
        attorney_receipt_confirmed = case when v_evidence_changed then false else attorney_receipt_confirmed end,
        attorney_receipt_confirmed_at = case when v_evidence_changed then null else attorney_receipt_confirmed_at end,
        attorney_receipt_confirmed_by_user_id = case when v_evidence_changed then null else attorney_receipt_confirmed_by_user_id end,
        attorney_receipt_note = case when v_evidence_changed then null else attorney_receipt_note end,
        consent_and_fee_terms_confirmed = true,
        confirmed_at = v_now,
        confirmed_by_user_id = auth.uid(),
        confirmation_note = v_note,
        status = 'verified'
    where id = v_control.id
    returning * into v_control;
  end if;

  if v_evidence_changed then
    update public.transaction_fee_invoice_queue
    set billing_party_type = v_control.billing_party_type, status = 'ready_for_finance',
        completed_at = null, completed_by_user_id = null, invoice_reference = null
    where fee_control_id = v_control.id and status <> 'completed';
  end if;

  insert into public.transaction_fee_control_events (
    fee_control_id, transaction_id, organisation_id, event_type, event_data, created_by_user_id
  ) values (
    v_control.id, p_transaction_id, v_transaction.organisation_id,
    case when v_created then 'fee_control_created' else 'fee_control_updated' end,
    jsonb_build_object(
      'billingPartyType', v_billing_party_type,
      'feeAmountExVat', v_control.fee_amount_ex_vat,
      'vatAmount', v_control.vat_amount,
      'totalAmountInclVat', v_control.total_amount_incl_vat,
      'otpDocumentId', p_otp_document_id
    ), auth.uid()
  );

  insert into public.transaction_fee_control_events (
    fee_control_id, transaction_id, organisation_id, event_type, event_data, created_by_user_id
  ) values (
    v_control.id, p_transaction_id, v_transaction.organisation_id, 'fee_terms_confirmed',
    jsonb_build_object('otpDocumentId', p_otp_document_id, 'confirmationNote', v_note), auth.uid()
  );

  return jsonb_build_object(
    'id', v_control.id,
    'transactionId', v_control.transaction_id,
    'billingPartyType', v_control.billing_party_type,
    'feeAmountExVat', v_control.fee_amount_ex_vat,
    'vatAmount', v_control.vat_amount,
    'totalAmountInclVat', v_control.total_amount_incl_vat,
    'status', v_control.status,
    'confirmedAt', v_control.confirmed_at
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.bridge_prepare_transaction_fee_invoice(p_transaction_id uuid, p_finance_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_control public.transaction_fee_controls%rowtype;
  v_invoice public.transaction_fee_invoice_queue%rowtype;
  v_note text := nullif(left(trim(coalesce(p_finance_note, '')), 1000), '');
begin
  if v_actor_id is null then
    raise exception 'An authenticated finance administrator is required to prepare an invoice.' using errcode = '42501';
  end if;

  select * into v_control
  from public.transaction_fee_controls
  where transaction_id = p_transaction_id
  for update;

  if not found then
    raise exception 'The transaction-fee verification has not been recorded for this matter.' using errcode = 'P0002';
  end if;

  if not public.bridge_transaction_fee_finance_admin(v_control.organisation_id) then
    raise exception 'Only senior organisation management may prepare this transaction-fee invoice.' using errcode = '42501';
  end if;

  if not public.bridge_transaction_fee_has_current_otp(p_transaction_id,v_control.otp_document_id) or not v_control.consent_and_fee_terms_confirmed
    or not coalesce((to_jsonb(v_control)->>'attorney_receipt_confirmed')::boolean, false) then
    raise exception 'Signed OTP, consent verification, and attorney receipt confirmation are required before invoice preparation.' using errcode = '22023';
  end if;

  insert into public.transaction_fee_invoice_queue (
    fee_control_id, transaction_id, organisation_id, billing_party_type,
    prepared_by_user_id, finance_note
  ) values (
    v_control.id, v_control.transaction_id, v_control.organisation_id, v_control.billing_party_type,
    v_actor_id, v_note
  )
  on conflict (fee_control_id) do update
    set finance_note = coalesce(excluded.finance_note, public.transaction_fee_invoice_queue.finance_note)
  returning * into v_invoice;

  return jsonb_build_object(
    'id', v_invoice.id,
    'transactionId', v_invoice.transaction_id,
    'billingPartyType', v_invoice.billing_party_type,
    'status', v_invoice.status,
    'feeAmountExVat', v_invoice.fee_amount_ex_vat,
    'vatAmount', v_invoice.vat_amount,
    'totalAmountInclVat', v_invoice.total_amount_incl_vat
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.bridge_complete_transaction_fee_invoice(p_transaction_id uuid, p_invoice_reference text, p_finance_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_invoice public.transaction_fee_invoice_queue%rowtype;
  v_control public.transaction_fee_controls%rowtype;
  v_reference text := nullif(left(trim(coalesce(p_invoice_reference, '')), 160), '');
  v_note text := nullif(left(trim(coalesce(p_finance_note, '')), 1000), '');
begin
  if v_actor_id is null then
    raise exception 'An authenticated finance administrator is required to complete an invoice.' using errcode = '42501';
  end if;
  if v_reference is null then
    raise exception 'Enter the invoice reference from your accounting system.' using errcode = '22023';
  end if;

  -- Match the fee-record/prepare lock order and recheck the evidence at completion.
  select * into v_control from public.transaction_fee_controls
  where transaction_id = p_transaction_id for update;

  select * into v_invoice
  from public.transaction_fee_invoice_queue
  where transaction_id = p_transaction_id
  for update;

  if not found then
    raise exception 'Prepare the transaction-fee invoice before marking it complete.' using errcode = 'P0002';
  end if;
  if not public.bridge_transaction_fee_finance_admin(v_invoice.organisation_id) then
    raise exception 'Only senior organisation management may complete this transaction-fee invoice.' using errcode = '42501';
  end if;
  if v_invoice.status = 'completed' then
    if v_invoice.invoice_reference is distinct from v_reference then
      raise exception 'This invoice is already completed. Use the recorded accounting reference or resolve the correction in finance.' using errcode = '22023';
    end if;
    return jsonb_build_object('id', v_invoice.id, 'transactionId', v_invoice.transaction_id,
      'status', v_invoice.status, 'invoiceReference', v_invoice.invoice_reference, 'completedAt', v_invoice.completed_at);
  end if;
  if v_control.id is null or not public.bridge_transaction_fee_has_current_otp(p_transaction_id,v_control.otp_document_id)
    or not v_control.consent_and_fee_terms_confirmed or not v_control.attorney_receipt_confirmed
    or v_control.billing_party_type is distinct from v_invoice.billing_party_type then
    raise exception 'The current signed OTP, billing party and attorney receipt must be verified before completing this invoice.' using errcode = '22023';
  end if;
  if v_invoice.status = 'cancelled' then
    raise exception 'A cancelled transaction-fee invoice cannot be completed.' using errcode = '22023';
  end if;

  update public.transaction_fee_invoice_queue
  set status = 'completed',
      completed_at = now(),
      completed_by_user_id = v_actor_id,
      invoice_reference = v_reference,
      finance_note = coalesce(v_note, finance_note)
  where id = v_invoice.id
  returning * into v_invoice;

  return jsonb_build_object(
    'id', v_invoice.id,
    'transactionId', v_invoice.transaction_id,
    'status', v_invoice.status,
    'invoiceReference', v_invoice.invoice_reference,
    'completedAt', v_invoice.completed_at
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.bridge_list_transaction_fee_invoice_queue()
 RETURNS SETOF jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'id', queue.id,
    'feeControlId', queue.fee_control_id,
    'transactionId', queue.transaction_id,
    'billingPartyType', queue.billing_party_type,
    'status', case when queue.status <> 'completed' and (not control.attorney_receipt_confirmed or not control.consent_and_fee_terms_confirmed)
      then 'verification_required' else queue.status end,
    'feeAmountExVat', queue.fee_amount_ex_vat,
    'vatAmount', queue.vat_amount,
    'totalAmountInclVat', queue.total_amount_incl_vat,
    'preparedAt', queue.prepared_at,
    'invoiceReference', queue.invoice_reference
  )
  from public.transaction_fee_invoice_queue queue
  join public.transaction_fee_controls control on control.id = queue.fee_control_id
  where public.bridge_transaction_fee_finance_admin(queue.organisation_id)
  union all
  select jsonb_build_object(
    'id', null,
    'feeControlId', control.id,
    'transactionId', control.transaction_id,
    'billingPartyType', control.billing_party_type,
    'status', 'ready_to_prepare',
    'feeAmountExVat', control.fee_amount_ex_vat,
    'vatAmount', control.vat_amount,
    'totalAmountInclVat', control.total_amount_incl_vat,
    'preparedAt', null,
    'invoiceReference', null
  )
  from public.transaction_fee_controls control
  where public.bridge_transaction_fee_finance_admin(control.organisation_id)
    and control.consent_and_fee_terms_confirmed
    and coalesce((to_jsonb(control)->>'attorney_receipt_confirmed')::boolean, false)
    and not exists (
      select 1 from public.transaction_fee_invoice_queue queue
      where queue.fee_control_id = control.id
    );
$function$;

create or replace function public.bridge_read_transaction_finance_closeout(p_transaction_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $function$
declare tx public.transactions; control public.transaction_fee_controls; invoice jsonb; can_review boolean;
begin
  select * into tx from public.transactions where id=p_transaction_id;
  if auth.uid() is null or tx.id is null or not public.bridge_transaction_fee_finance_admin(tx.organisation_id) then
    return jsonb_build_object('canManage',false);
  end if;
  can_review := lower(coalesce(public.bridge_current_workspace_role(tx.organisation_id),'')) <> 'admin';
  select * into control from public.transaction_fee_controls where transaction_id=tx.id;
  select item into invoice from public.bridge_list_transaction_fee_invoice_queue() item where item->>'transactionId'=tx.id::text limit 1;
  return jsonb_build_object(
    'canManage',true,'canReviewCommission',can_review,
    'feeControl',case when control.id is null then null else jsonb_build_object(
      'billingPartyType',control.billing_party_type,'attorneyReceiptConfirmed',control.attorney_receipt_confirmed,
      'otpDocumentId',control.otp_document_id) end,
    'invoice',invoice,
    'allocations',case when can_review then (select coalesce(jsonb_agg(jsonb_build_object(
      'id',a.id,'participantName',a.participant_name,'participantRole',a.participant_role,'status',a.status,
      'calculatedAmount',a.calculated_amount,'approvedAmount',a.approved_amount,'paymentReference',a.payment_reference
    ) order by a.created_at,a.id),'[]'::jsonb) from public.transaction_commission_allocations a
      where a.transaction_id=tx.id and a.status<>'cancelled') else '[]'::jsonb end,
    'grossCommissionPercentage',case when can_review then (select c.gross_commission_percentage from public.transaction_commissions c where c.transaction_id=tx.id limit 1) end,
    'readiness',case when can_review then public.bridge_validate_transaction_commission_closeout(tx.id,false) end
  );
end $function$;

revoke all on function public.bridge_read_transaction_finance_closeout(uuid) from public,anon;

grant execute on function public.bridge_read_transaction_finance_closeout(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.bridge_review_commission_allocation(p_allocation_id uuid, p_action text, p_approved_amount numeric DEFAULT NULL::numeric, p_reason text DEFAULT NULL::text, p_payment_reference text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  allocation_row public.transaction_commission_allocations%rowtype;
  updated_row public.transaction_commission_allocations%rowtype;
  v_action text := lower(trim(coalesce(p_action, '')));
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_payment_reference text := nullif(trim(coalesce(p_payment_reference, '')), '');
  v_actor_id uuid := auth.uid();
  v_actor_email text := public.bridge_current_email();
  v_approved_amount numeric(14,2);
  v_to_status text;
  v_requires_admin boolean := true;
begin
  if p_allocation_id is null then
    return jsonb_build_object('success', false, 'code', 'allocation_id_required');
  end if;

  if v_action not in ('submit', 'submit_for_review', 'approve', 'mark_due', 'due', 'mark_paid', 'paid', 'waive', 'dispute', 'reopen') then
    return jsonb_build_object('success', false, 'code', 'invalid_action');
  end if;

  select *
    into allocation_row
  from public.transaction_commission_allocations
  where id = p_allocation_id
  for update;

  if allocation_row.id is null then
    return jsonb_build_object('success', false, 'code', 'allocation_not_found');
  end if;

  if allocation_row.status = 'cancelled' then
    return jsonb_build_object('success', false, 'code', 'allocation_cancelled');
  end if;

  if allocation_row.status in ('paid', 'waived') and v_action not in ('dispute', 'reopen') then
    return jsonb_build_object('success', false, 'code', 'allocation_locked');
  end if;

  v_requires_admin := v_action not in ('dispute');

  if v_requires_admin and not (
    (public.bridge_transaction_fee_finance_admin(allocation_row.organisation_id)
      and lower(coalesce(public.bridge_current_workspace_role(allocation_row.organisation_id),'')) <> 'admin')
    or coalesce(auth.role(), '') = 'service_role'
  ) then
    return jsonb_build_object('success', false, 'code', 'admin_required');
  end if;

  if not v_requires_admin and not (
    (public.bridge_transaction_fee_finance_admin(allocation_row.organisation_id)
      and lower(coalesce(public.bridge_current_workspace_role(allocation_row.organisation_id),'')) <> 'admin')
    or public.bridge_is_active_member(allocation_row.organisation_id)
    or allocation_row.participant_user_id = v_actor_id
    or lower(coalesce(allocation_row.participant_email, '')) = lower(coalesce(v_actor_email, ''))
    or coalesce(auth.role(), '') = 'service_role'
  ) then
    return jsonb_build_object('success', false, 'code', 'forbidden');
  end if;

  if v_action in ('waive', 'dispute', 'reopen') and v_reason is null then
    return jsonb_build_object('success', false, 'code', 'reason_required');
  end if;

  if v_action in ('mark_paid','paid') and coalesce(v_payment_reference,allocation_row.payment_reference) is null then
    return jsonb_build_object('success',false,'code','payment_reference_required');
  end if;
  if p_approved_amount is not null and allocation_row.calculated_amount is not null
    and p_approved_amount <> allocation_row.calculated_amount and v_reason is null then
    return jsonb_build_object('success',false,'code','override_reason_required');
  end if;

  v_approved_amount := coalesce(p_approved_amount, allocation_row.approved_amount, allocation_row.calculated_amount);
  if v_action in ('approve', 'mark_due', 'due', 'mark_paid', 'paid') and v_approved_amount is null then
    return jsonb_build_object('success', false, 'code', 'amount_required');
  end if;

  if v_approved_amount is not null and v_approved_amount < 0 then
    return jsonb_build_object('success', false, 'code', 'invalid_amount');
  end if;

  v_to_status := case v_action
    when 'submit' then 'pending_approval'
    when 'submit_for_review' then 'pending_approval'
    when 'approve' then 'approved'
    when 'mark_due' then 'due'
    when 'due' then 'due'
    when 'mark_paid' then 'paid'
    when 'paid' then 'paid'
    when 'waive' then 'waived'
    when 'dispute' then 'disputed'
    when 'reopen' then 'pending_approval'
    else allocation_row.status
  end;

  update public.transaction_commission_allocations
    set status = v_to_status,
        approved_amount = case
          when v_to_status in ('approved', 'due', 'paid') then v_approved_amount
          when v_to_status = 'pending_approval' and v_action = 'reopen' then null
          else approved_amount
        end,
        approved_by = case
          when v_to_status in ('approved', 'due', 'paid') then coalesce(approved_by, v_actor_id)
          when v_action = 'reopen' then null
          else approved_by
        end,
        approved_at = case
          when v_to_status in ('approved', 'due', 'paid') then coalesce(approved_at, now())
          when v_action = 'reopen' then null
          else approved_at
        end,
        due_at = case
          when v_to_status in ('due', 'paid') then coalesce(due_at, now())
          when v_action = 'reopen' then null
          else due_at
        end,
        paid_at = case
          when v_to_status = 'paid' then coalesce(paid_at, now())
          when v_action = 'reopen' then null
          else paid_at
        end,
        payment_reference = case
          when v_to_status = 'paid' then coalesce(v_payment_reference, payment_reference)
          when v_action = 'reopen' then null
          else payment_reference
        end,
        waived_at = case
          when v_to_status = 'waived' then coalesce(waived_at, now())
          when v_action = 'reopen' then null
          else waived_at
        end,
        waived_by = case
          when v_to_status = 'waived' then coalesce(waived_by, v_actor_id)
          when v_action = 'reopen' then null
          else waived_by
        end,
        dispute_reason = case
          when v_to_status = 'disputed' then v_reason
          when v_action = 'reopen' then null
          else dispute_reason
        end,
        override_reason = case
          when v_action in ('approve', 'mark_due', 'due', 'mark_paid', 'paid', 'waive', 'reopen')
               and (
                 v_reason is not null
                 or p_approved_amount is not null
                    and allocation_row.calculated_amount is not null
                    and p_approved_amount <> allocation_row.calculated_amount
               )
            then v_reason
          else override_reason
        end,
        locked_at = case
          when v_to_status in ('paid', 'waived') then coalesce(locked_at, now())
          when v_action = 'reopen' then null
          else locked_at
        end,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
          'last_review_action', v_action,
          'last_reviewed_by', v_actor_id,
          'last_reviewed_at', now(),
          'last_review_reason', v_reason
        )),
        updated_at = now()
  where id = allocation_row.id
  returning * into updated_row;

  insert into public.commission_allocation_review_events (
    allocation_id,
    transaction_id,
    organisation_id,
    source_referral_id,
    action,
    from_status,
    to_status,
    previous_approved_amount,
    approved_amount,
    calculated_amount_snapshot,
    reason,
    payment_reference,
    actor_id,
    actor_email,
    metadata
  )
  values (
    updated_row.id,
    updated_row.transaction_id,
    updated_row.organisation_id,
    updated_row.source_referral_id,
    case v_action
      when 'submit' then 'submitted_for_review'
      when 'submit_for_review' then 'submitted_for_review'
      when 'approve' then 'approved'
      when 'mark_due' then 'marked_due'
      when 'due' then 'marked_due'
      when 'mark_paid' then 'marked_paid'
      when 'paid' then 'marked_paid'
      when 'waive' then 'waived'
      when 'dispute' then 'disputed'
      when 'reopen' then 'reopened'
      else 'adjusted'
    end,
    allocation_row.status,
    updated_row.status,
    allocation_row.approved_amount,
    updated_row.approved_amount,
    updated_row.calculated_amount,
    v_reason,
    v_payment_reference,
    v_actor_id,
    v_actor_email,
    coalesce(p_metadata, '{}'::jsonb)
  );

  perform public.bridge_sync_commission_allocation_review_sources(updated_row.id, v_actor_id);

  return jsonb_build_object(
    'success', true,
    'code', 'review_action_applied',
    'allocation_id', updated_row.id,
    'transaction_id', updated_row.transaction_id,
    'from_status', allocation_row.status,
    'to_status', updated_row.status,
    'approved_amount', updated_row.approved_amount
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.bridge_confirm_transaction_fee_attorney_receipt(p_transaction_id uuid, p_documentation_received boolean, p_receipt_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_control public.transaction_fee_controls%rowtype;
  v_note text := nullif(left(trim(coalesce(p_receipt_note, '')), 1000), '');
  v_now timestamptz := now();
begin
  if v_actor_id is null then
    raise exception 'An authenticated attorney is required to confirm document receipt.' using errcode = '42501';
  end if;

  if p_transaction_id is null or not public.bridge_can_access_transaction_spine(p_transaction_id) then
    raise exception 'You do not have access to this matter.' using errcode = '42501';
  end if;

  -- Only an attorney assigned to the matter, an active member of the assigned
  -- firm, or that firm's lead may make this legal-side confirmation. Agency
  -- users with general transaction visibility are deliberately excluded.
  if not exists (
    select 1
    from public.transaction_attorney_assignments taa
    left join public.attorney_firms af
      on af.id = coalesce(taa.attorney_firm_id, taa.firm_id)
    where taa.transaction_id = p_transaction_id
      and coalesce(taa.assignment_status, 'pending') in ('pending', 'active', 'paused')
      and coalesce(taa.status, 'active') <> 'removed'
      and (
        taa.assigned_user_id = v_actor_id
        or taa.primary_attorney_id = v_actor_id
        or taa.attorney_user_id = v_actor_id
        or public.attorney_user_is_firm_lead(coalesce(taa.attorney_firm_id, taa.firm_id))
        or exists (
          select 1
          from public.attorney_firm_members member
          where member.firm_id = coalesce(taa.attorney_firm_id, taa.firm_id)
            and member.user_id = v_actor_id
            and coalesce(member.status, 'active') in ('active', 'accepted')
        )
      )
  ) then
    raise exception 'Only the assigned attorney firm may confirm document receipt for this matter.' using errcode = '42501';
  end if;

  if coalesce(p_documentation_received, false) is not true then
    raise exception 'Confirm receipt and review of the signed OTP and approved consent documentation.' using errcode = '22023';
  end if;

  select * into v_control
  from public.transaction_fee_controls
  where transaction_id = p_transaction_id
  for update;

  if not found then
    raise exception 'The transaction-fee verification has not yet been recorded for this matter.' using errcode = 'P0002';
  end if;

  if not public.bridge_transaction_fee_has_current_otp(p_transaction_id,v_control.otp_document_id) then
    raise exception 'The fee verification must reference the current signed OTP before confirming receipt.' using errcode='22023';
  end if;

  update public.transaction_fee_controls
  set attorney_receipt_confirmed = true,
      attorney_receipt_confirmed_at = v_now,
      attorney_receipt_confirmed_by_user_id = v_actor_id,
      attorney_receipt_note = v_note
  where id = v_control.id
  returning * into v_control;

  insert into public.transaction_fee_control_events (
    fee_control_id, transaction_id, organisation_id, event_type, event_data, created_by_user_id
  ) values (
    v_control.id,
    v_control.transaction_id,
    v_control.organisation_id,
    'attorney_receipt_confirmed',
    jsonb_build_object(
      'otpDocumentId', v_control.otp_document_id,
      'documentationReceived', true,
      'receiptNote', v_note
    ),
    v_actor_id
  );

  return jsonb_build_object(
    'id', v_control.id,
    'transactionId', v_control.transaction_id,
    'attorneyReceiptConfirmed', v_control.attorney_receipt_confirmed,
    'attorneyReceiptConfirmedAt', v_control.attorney_receipt_confirmed_at
  );
end;
$function$;

notify pgrst, 'reload schema';

commit;
