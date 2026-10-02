begin;

-- Align professional journey copy with the existing Work task. Preserve client
-- copy, visibility, saved outcomes and phase ordering.
update journey_private.task_catalog
set definition = jsonb_set(definition, '{professional,description}',
  '"Review rates figures, payment evidence, and the municipal certificate issuer, reference and validity dates."'::jsonb)
where lane_key = 'transfer' and step_key = 'municipal_rates_clearance_review';

commit;
