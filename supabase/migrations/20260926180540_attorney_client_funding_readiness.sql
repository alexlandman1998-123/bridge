begin;

-- A client milestone must not appear complete while an applicable bond or
-- cancellation task still prevents the linked matter from lodging. Keep the
-- keys private: the portal receives only the eight broad milestone states.
create or replace function journey_private.client_transfer_milestones(p_source jsonb)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with tasks as (
    select lane ->> 'key' lane_key, phase ->> 'key' phase_key,
      task ->> 'key' task_key, task ->> 'status' status
    from pg_catalog.jsonb_array_elements(coalesce(p_source -> 'lanes', '[]'::jsonb)) lane
    cross join lateral pg_catalog.jsonb_array_elements(coalesce(lane -> 'phases', '[]'::jsonb)) phase
    cross join lateral pg_catalog.jsonb_array_elements(coalesce(phase -> 'tasks', '[]'::jsonb)) task
  ), definitions(ordinal, milestone_key, task_ids, phase_key) as (
    values
      (1, 'instruction', array['transfer:instruction_received','transfer:matter_opened','transfer:otp_source_docs_checked']::text[], null::text),
      (2, 'fica', array[]::text[], 'fica_authority'),
      (3, 'rates', array['transfer:municipal_rates_clearance_review']::text[], null::text),
      (4, 'funding', array[
        'transfer:cash_funding_source_review','transfer:payment_security_review',
        'bond:bond_instruction_received','bond:bank_reference_captured',
        'bond:bond_approval_letter_received','bond:bank_requirements_confirmed',
        'bond:bank_conditions_outstanding','bond:bank_conditions_resolved',
        'bond:guarantees_issued','bond:guarantee_wording_accepted',
        'cancellation:cancellation_existing_bond_confirmed','cancellation:cancellation_bank_captured',
        'cancellation:cancellation_bond_account_captured','cancellation:cancellation_instruction_received',
        'cancellation:notice_period_captured','cancellation:cancellation_figures_requested',
        'cancellation:cancellation_figures_received','cancellation:figures_expiry_captured',
        'cancellation:notice_penalty_risk_captured','cancellation:cancellation_guarantees_requested',
        'cancellation:cancellation_guarantees_received',
        'cancellation:cancellation_guarantees_accepted',
        'cancellation:cancellation_guarantee_allocation_review'
      ]::text[], null::text),
      (5, 'signing', array[
        'transfer:buyer_signing_review','transfer:seller_signing_review',
        'bond:bond_documents_prepared','bond:buyer_bond_signing_scheduled',
        'bond:buyer_signed_bond_documents','bond:bond_documents_sent_to_bank',
        'cancellation:cancellation_documents_prepared',
        'cancellation:seller_cancellation_documents_signed'
      ]::text[], null::text),
      (6, 'clearances', array[
        'bond:bank_approval_to_lodge_received',
        'bond:bond_lodgement_instructions_confirmed',
        'cancellation:cancellation_consent_confirmed',
        'cancellation:cancellation_simultaneous_lodgement_confirmed'
      ]::text[], 'financial_preparation'),
      (7, 'lodgement', array['transfer:lodged_at_deeds_office','bond:bond_lodged','cancellation:cancellation_lodged']::text[], null::text),
      (8, 'registration', array['transfer:registered','bond:bond_registered','cancellation:cancellation_registered']::text[], null::text)
  ), summaries as (
    select d.ordinal, d.milestone_key,
      pg_catalog.count(t.task_key) task_count,
      pg_catalog.count(t.task_key) filter (where t.status in ('completed','completed_externally','not_applicable')) resolved_count,
      pg_catalog.count(t.task_key) filter (where t.status = 'not_applicable') not_applicable_count,
      pg_catalog.count(t.task_key) filter (where t.status = 'blocked') blocked_count,
      pg_catalog.count(t.task_key) filter (where t.status = 'waiting') waiting_count,
      pg_catalog.count(t.task_key) filter (where t.status in ('in_progress','completed','completed_externally')) started_count
    from definitions d
    left join tasks t on (d.phase_key is not null and t.lane_key = 'transfer' and t.phase_key = d.phase_key
      and (d.milestone_key <> 'clearances' or t.task_key <> 'municipal_rates_clearance_review'))
      or (t.lane_key || ':' || t.task_key = any(d.task_ids))
    group by d.ordinal, d.milestone_key
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('key', milestone_key, 'status',
    case
      when task_count = 0 or not_applicable_count = task_count then 'not_applicable'
      when blocked_count > 0 then 'blocked'
      when waiting_count > 0 then 'waiting'
      when resolved_count = task_count then 'completed'
      when started_count > 0 then 'in_progress'
      else 'not_started'
    end) order by ordinal), '[]'::jsonb)
  from summaries;
$$;

revoke all on function journey_private.client_transfer_milestones(jsonb) from public, anon, authenticated;

commit;
