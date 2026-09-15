# Supabase migration reconciliation — Phase 7 FICA declaration data review

The manual data review for `20260913190000` is complete. The migration is
cleared to apply its original SQL in staging after dependency preflight.

- Production: 0 of 2 expected definitions and 0 of 5 expected rules present.
- Staging: 0 of 2 expected definitions and 0 of 5 expected rules present.
- Conflict targets: `document_definitions(key)` and
  `document_requirement_rules(id)` are primary keys.
- Decision: apply the original idempotent migration; do not repair its ledger
  and do not create replacement SQL.

The precise, read-only verification is
`sql/supabase-phase7-fica-declaration-data-audit.sql`. The reviewed clearance
is `docs/non-runnable-clearance/20260913190000-other.json`.

No database data or migration history was changed in this phase.
