-- Phase 2: reconcile historical scalar VAT treatment into the attorney-owned
-- transfer-tax decision record introduced in Phase 1. This migration is
-- deliberately data-only: it never changes lane progress, task status,
-- documents, lifecycle state, or a matter's existing workflow plan.
--
-- Legacy values are evidence to review, not an attorney confirmation. Every
-- migrated decision therefore remains `needs_confirmation` until an attorney
-- confirms it in the workspace.

update public.transactions as transaction_row
set routing_profile_json = jsonb_set(
  coalesce(transaction_row.routing_profile_json, '{}'::jsonb),
  '{transferTaxDecision}',
  jsonb_build_object(
    'version', 'transfer_tax_decision_v1',
    'route', case lower(coalesce(transaction_row.vat_treatment, ''))
      when 'transfer_duty' then 'transfer_duty'
      when 'duty' then 'transfer_duty'
      when 'no_vat' then 'transfer_duty'
      when 'vat' then 'vat'
      when 'vat_applicable' then 'vat'
      when 'standard_vat' then 'vat'
      when 'taxable_supply' then 'vat'
      when 'zero_rated' then 'zero_rated_going_concern'
      when 'zero_rated_going_concern' then 'zero_rated_going_concern'
      when 'going_concern' then 'zero_rated_going_concern'
      else 'needs_tax_advice'
    end,
    'status', 'needs_confirmation',
    'sellerVatRegistered', 'unknown',
    'sellerVatNumberReference', '',
    'supplyInCourseOfEnterprise', 'unknown',
    'sellerNonResidentReview', 'unknown',
    'sarsEvidenceRequest', 'unknown',
    'dutyPaymentRequired', 'unknown',
    'sarsStatus', 'not_started',
    'basisNote', '',
    'confirmedAt', null,
    'confirmedBy', null,
    'confirmedByRole', null,
    'audit', '[]'::jsonb,
    'legacySource', jsonb_build_object(
      'vatTreatment', nullif(trim(transaction_row.vat_treatment), ''),
      'migratedAt', now()
    )
  ),
  true
)
where transaction_row.routing_profile_json is null
   or (
     not (coalesce(transaction_row.routing_profile_json, '{}'::jsonb) ? 'transferTaxDecision')
     and not (coalesce(transaction_row.routing_profile_json, '{}'::jsonb) ? 'transfer_tax_decision')
   );
