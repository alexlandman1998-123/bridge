begin;

-- Some staged active matter plans already reference this consolidated outcome.
-- Restore only the missing catalogue definition so existing plans become
-- readable without changing their state or advancing any transaction.
insert into journey_private.task_catalog (
  lane_key, step_key, definition, phase_key, phase_label, phase_order, task_order
)
values (
  'transfer',
  'transfer_duty_vat_review',
  jsonb_build_object(
    'processKey', 'transfer',
    'processLabel', 'Property transfer',
    'stepKey', 'transfer_duty_vat_review',
    'ownerRole', 'transfer_attorney',
    'defaultVisibility', 'professional_shared',
    'clientVisibleAllowed', true,
    'professional', jsonb_build_object(
      'title', 'Transfer tax reviewed',
      'description', 'The applicable transfer duty, exemption or VAT evidence is under review.'
    ),
    'client', jsonb_build_object(
      'title', 'Transfer tax review in progress',
      'description', 'The transfer attorneys are reviewing the applicable transfer tax route.'
    )
  ),
  'financial_preparation',
  'Financial Preparation',
  2,
  0
)
on conflict (lane_key, step_key) do update set
  definition = excluded.definition,
  phase_key = excluded.phase_key,
  phase_label = excluded.phase_label,
  phase_order = excluded.phase_order,
  task_order = excluded.task_order;

commit;
