# OTP simplification — Phase 2 versioning model

Phase 2 extends the existing `document_packet_templates` registry instead of creating a second template system.

## Master lifecycle

A canonical OTP master now records three explicit version pointers:

- `live_version_id`: the published version used for generation;
- `candidate_version_id`: a draft, awaiting-approval or approved replacement; and
- `previous_live_version_id`: the immediately preceding version available for rollback.

Legacy templates retain `document_model = legacy_sectioned`. A canonical OTP opts into `single_master_document`, so applying the migration alone does not change the live generator.

## Added records

- `document_template_field_mappings` stores the Phase 1 inventory for a specific DOCX version.
- `document_template_approvals` records the current attorney decision and its fingerprint.
- `approved_special_conditions` versions the only two types of exceptional legal wording.
- `document_generation_runs` ties every future output to its input, template version and field-map version.

All four tables use organisation-scoped row-level security. Ordinary active members can read published mappings and approved clauses, while template administration remains restricted to organisation or platform administrators.

## Runtime compatibility

This phase does not switch production generation. The current generator continues using the existing live `document_packet_templates` record. A later activation phase can populate the canonical pointers and atomically move runtime selection to `live_version_id` after the DOCX and field mappings are ready.
