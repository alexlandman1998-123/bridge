-- Phase 79: read-only operational reconciliation. This is not a trust
-- accounting ledger and cannot post, allocate, reverse, or correct money.
create or replace function public.rental_get_financial_reconciliation(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_metrics jsonb;
  v_checks jsonb;
  v_overallocations jsonb;
begin
  if auth.uid() is null or not public.rental_financial_manager_authorized(p_org) then
    raise exception 'Not authorized';
  end if;

  select jsonb_build_object(
    'net_charges', coalesce((select sum(amount) from public.rental_financial_charges where organisation_id = p_org), 0),
    'net_payments', coalesce((select sum(amount) from public.rental_financial_payments where organisation_id = p_org), 0),
    'allocated_payments', coalesce((select sum(amount) from public.rental_financial_allocations where organisation_id = p_org), 0),
    'net_adjustments', coalesce((select sum(amount) from public.rental_financial_adjustments where organisation_id = p_org), 0),
    'pending_import_rows', (select count(*) from public.rental_payment_import_rows row join public.rental_payment_import_batches batch on batch.id = row.batch_id where batch.organisation_id = p_org and row.status in ('unmatched', 'suggested')),
    'pending_match_suggestions', (select count(*) from public.rental_payment_match_suggestions suggestion join public.rental_payment_import_rows row on row.id = suggestion.import_row_id join public.rental_payment_import_batches batch on batch.id = row.batch_id where batch.organisation_id = p_org and suggestion.status = 'pending'),
    'open_correction_requests', (select count(*) from public.rental_financial_correction_requests where organisation_id = p_org and status in ('requested', 'approved'))
  ) into v_metrics;

  select coalesce(jsonb_agg(to_jsonb(item) order by item.overallocated_by desc), '[]'::jsonb)
  into v_overallocations
  from (
    select payment.id as payment_id, payment.tenancy_id, payment.amount as payment_amount,
      coalesce(sum(allocation.amount), 0) as allocated_amount,
      coalesce(sum(allocation.amount), 0) - payment.amount as overallocated_by
    from public.rental_financial_payments payment
    join public.rental_financial_allocations allocation on allocation.payment_id = payment.id
    where payment.organisation_id = p_org and payment.reversal_of_payment_id is null
    group by payment.id, payment.tenancy_id, payment.amount
    having coalesce(sum(allocation.amount), 0) > payment.amount
    order by overallocated_by desc
    limit 50
  ) item;

  select jsonb_build_array(
    jsonb_build_object('key', 'payment_allocation', 'title', 'Payment allocations do not exceed original payments', 'status', case when jsonb_array_length(v_overallocations) = 0 then 'pass' else 'blocked' end, 'affected_count', jsonb_array_length(v_overallocations)),
    jsonb_build_object('key', 'import_review', 'title', 'Imported payment rows have been reviewed', 'status', case when (v_metrics->>'pending_import_rows')::integer = 0 then 'pass' else 'warning' end, 'affected_count', (v_metrics->>'pending_import_rows')::integer),
    jsonb_build_object('key', 'match_review', 'title', 'Suggested payment matches have been reviewed', 'status', case when (v_metrics->>'pending_match_suggestions')::integer = 0 then 'pass' else 'warning' end, 'affected_count', (v_metrics->>'pending_match_suggestions')::integer),
    jsonb_build_object('key', 'correction_review', 'title', 'Financial correction requests are resolved', 'status', case when (v_metrics->>'open_correction_requests')::integer = 0 then 'pass' else 'warning' end, 'affected_count', (v_metrics->>'open_correction_requests')::integer)
  ) into v_checks;

  return jsonb_build_object(
    'version', 'arch9_rental_financial_reconciliation_v1',
    'as_of', now(),
    'metrics', v_metrics,
    'checks', v_checks,
    'overallocated_payments', v_overallocations,
    'guardrail', 'Read-only operational reconciliation. Reconcile exceptions through approved financial controls; this snapshot never posts or reverses money and is not a trust-accounting statement.'
  );
end;
$$;

revoke all on function public.rental_get_financial_reconciliation(uuid) from public, anon;
grant execute on function public.rental_get_financial_reconciliation(uuid) to authenticated;
