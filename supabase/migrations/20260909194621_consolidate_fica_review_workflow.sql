begin;

-- FICA requests are system communications, not separate attorney work.  Keep
-- their audit rows, but replace the active work plan with one review task per
-- party. Authority is intentionally included in the relevant party pack.
insert into journey_private.task_catalog (
  lane_key, step_key, definition, phase_key, phase_label, phase_order, task_order
)
values
  ('transfer', 'buyer_fica_review', jsonb_build_object(
    'processKey', 'transfer', 'processLabel', 'Property transfer', 'stepKey', 'buyer_fica_review',
    'ownerRole', 'transfer_attorney', 'defaultVisibility', 'professional_shared', 'clientVisibleAllowed', true,
    'professional', jsonb_build_object('title', 'Buyer FICA reviewed', 'description', 'The applicable buyer identity, address and authority documents are under review.'),
    'client', jsonb_build_object('title', 'Buyer verification in progress', 'description', 'The transfer attorneys are reviewing the buyer verification documents.')
  ), 'fica_authority', 'FICA & Authority', 1, 0),
  ('transfer', 'seller_fica_review', jsonb_build_object(
    'processKey', 'transfer', 'processLabel', 'Property transfer', 'stepKey', 'seller_fica_review',
    'ownerRole', 'transfer_attorney', 'defaultVisibility', 'professional_shared', 'clientVisibleAllowed', true,
    'professional', jsonb_build_object('title', 'Seller FICA reviewed', 'description', 'The applicable seller identity, address and authority documents are under review.'),
    'client', jsonb_build_object('title', 'Seller verification in progress', 'description', 'The transfer attorneys are reviewing the seller verification documents.')
  ), 'fica_authority', 'FICA & Authority', 1, 1)
on conflict (lane_key, step_key) do update set
  definition = excluded.definition,
  phase_key = excluded.phase_key,
  phase_label = excluded.phase_label,
  phase_order = excluded.phase_order,
  task_order = excluded.task_order;

-- Seed the two canonical review rows.  An earlier completed approval carries
-- forward as completed; otherwise retain the strongest active state.
insert into public.transaction_subprocess_steps (
  subprocess_id, step_key, step_label, status, owner_type, sort_order, visibility_scope
)
select
  lane.id,
  review.step_key,
  review.step_label,
  coalesce(legacy.status, 'not_started'),
  'attorney',
  review.sort_order,
  'internal'
from public.transaction_subprocesses lane
cross join (
  values
    ('buyer_fica_review', 'Review & Approve Buyer FICA', 6, array['buyer_fica_requested','buyer_fica_received','buyer_fica_approved']::text[]),
    ('seller_fica_review', 'Review & Approve Seller FICA', 7, array['seller_fica_requested','seller_fica_received','seller_fica_approved','entity_authority_checked']::text[])
) as review(step_key, step_label, sort_order, legacy_keys)
left join lateral (
  select case
    when bool_or(step.status in ('completed', 'completed_externally')) then 'completed'
    when bool_or(step.status = 'blocked') then 'blocked'
    when bool_or(step.status = 'waiting') then 'waiting'
    when bool_or(step.status = 'in_progress') then 'in_progress'
    when bool_and(step.status = 'not_applicable') then 'not_applicable'
    else 'not_started'
  end as status
  from public.transaction_subprocess_steps step
  where step.subprocess_id = lane.id and step.step_key = any(review.legacy_keys)
) legacy on true
where lane.process_type = 'transfer'
  and not exists (
    select 1 from public.transaction_subprocess_steps existing
    where existing.subprocess_id = lane.id and existing.step_key = review.step_key
  );

-- Existing confirmed plans become v3 without deleting historical task rows.
-- The active sequence is rebuilt from the stable non-FICA work plus the two
-- canonical FICA review tasks so progress denominators cannot retain legacy
-- requested/received/approved/authority duplicates.
with rebuilt as (
  select
    transaction_row.id,
    jsonb_set(
      transaction_row.routing_profile_json,
      '{workflowPlan}',
      jsonb_set(
        transaction_row.routing_profile_json -> 'workflowPlan',
        '{lanes}',
        (
          select jsonb_agg(
            case when lane.value ->> 'laneKey' <> 'transfer' then lane.value
            else jsonb_set(
              lane.value,
              '{stepKeys}',
              (
                jsonb_build_array(
                  'instruction_received', 'matter_opened', 'otp_source_docs_checked', 'title_deed_checked', 'existing_bond_confirmed',
                  'buyer_fica_review', 'seller_fica_review'
                ) || coalesce((
                  select jsonb_agg(step.value)
                  from jsonb_array_elements(coalesce(lane.value -> 'stepKeys', '[]'::jsonb)) step(value)
                  where step.value #>> '{}' not in (
                    'instruction_received', 'matter_opened', 'otp_source_docs_checked', 'title_deed_checked', 'existing_bond_confirmed',
                    'buyer_fica_requested', 'buyer_fica_received', 'buyer_fica_approved',
                    'seller_fica_requested', 'seller_fica_received', 'seller_fica_approved', 'entity_authority_checked'
                  )
                ), '[]'::jsonb)
              )
            )
          )
          from jsonb_array_elements(transaction_row.routing_profile_json -> 'workflowPlan' -> 'lanes') lane(value)
        ),
        true
      ) || jsonb_build_object('version', 'attorney_matter_workflow_plan_v3'),
      true
    ) as routing_profile_json
  from public.transactions transaction_row
  where transaction_row.routing_profile_json -> 'workflowPlan' ->> 'status' = 'active'
    and jsonb_typeof(transaction_row.routing_profile_json -> 'workflowPlan' -> 'lanes') = 'array'
)
update public.transactions transaction_row
set routing_profile_json = rebuilt.routing_profile_json,
    updated_at = now()
from rebuilt
where transaction_row.id = rebuilt.id;

-- Keep the private reconciliation audit aware of the new plan shape without
-- weakening its existing security definer or access checks.
do $$
declare v_definition text;
begin
  select pg_get_functiondef('journey_private.audit_matter(uuid)'::regprocedure) into v_definition;
  if position('''attorney_matter_workflow_plan_v3''' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      '''attorney_matter_workflow_plan_v1'',''attorney_matter_workflow_plan_v2''',
      '''attorney_matter_workflow_plan_v1'',''attorney_matter_workflow_plan_v2'',''attorney_matter_workflow_plan_v3'''
    );
    execute v_definition;
  end if;
end;
$$;

commit;
