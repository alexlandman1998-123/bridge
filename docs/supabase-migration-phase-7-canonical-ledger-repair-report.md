# Supabase Migration Phase 7 Canonical Ledger Repair Report

Generated: 2026-07-12T20:27:06.901Z
Repo: /Users/alexanderlandman/the-it-guy

## Safety Scope

Phase 7 is a single-candidate ledger repair for the canonical document verification snapshot migration. It only runs `supabase migration repair --status applied` for `202607120003` after proving the migration is pure local-only and the live RPC evidence passes. It does not run `db push`, `db reset`, schema migrations, or data-changing application SQL.

## Decision

| Field | Value |
| --- | --- |
| Status | REPAIRED |
| Recommendation | Phase 7 repaired the canonical-document pilot ledger row. Refresh Phase 5 before choosing the next pure-local batch. |
| Apply mode | yes |
| Candidate version | 202607120003 |
| Candidate module | canonical_documents |
| Local migration files | 336 |
| Duplicate local timestamps | 0 |
| Before ledger state | pure local-only |
| After ledger state | recorded applied |
| Evidence ready | yes |
| Object checks | 1/1 |
| Matched rows before | 240 |
| Matched rows after | 241 |
| Pure local-only rows before | 79 |
| Pure local-only rows after | 78 |

## Candidate Matrix

| Version | Module | Migration | Local File | Before | After | Evidence Keys |
| --- | --- | --- | --- | --- | --- | --- |
| 202607120003 | canonical_documents | canonical document verification snapshot RPC | present | pure local-only | recorded applied | canonical_document_verification_snapshot_function, canonical_document_verification_snapshot_signature, canonical_document_verification_snapshot_bounded_call |

## Evidence Gate

| Gate | Status | Details |
| --- | --- | --- |
| Local migration file | PASS | supabase/migrations/202607120003_canonical_document_verification_snapshot_scoped.sql |
| Duplicate timestamps | PASS | none |
| Pure local-only ledger state | PASS | pure local-only |
| Required live evidence | PASS | all required evidence keys ready |
| Static object evidence | PASS | all static objects live |

## Evidence Detail

| Check | Ready | Details |
| --- | --- | --- |
| canonical_document_verification_snapshot_bounded_call | yes | {"max_rows":1,"purpose":"canonical_staging_verification"} |
| canonical_document_verification_snapshot_function | yes | {"function":"public.canonical_document_verification_snapshot"} |
| canonical_document_verification_snapshot_signature | yes | {"identity_arguments":"p_purpose text, p_transaction_id uuid, p_fixture text, p_max_rows integer"} |
| object:function:canonical_document_verification_snapshot | yes | {"relation_name":""} |

## Extracted Objects

| Type | Name | Relation |
| --- | --- | --- |
| function | canonical_document_verification_snapshot |  |

## Command Evidence

| Command | Status | Notes |
| --- | --- | --- |
| npx supabase migration list --linked --output-format json | ok | Initialising login role... Connecting to remote database... |
| npx supabase db query --linked --file /var/folders/r_/zbzvf7r10897f7jqjfy4sfvh0000gn/T/supabase-phase7-canonical-evidence-95507.sql --output-format json | ok | Initialising login role... |
| npx supabase migration repair --linked --status applied 202607120003 | ok | Initialising login role... Connecting to remote database... Repaired migration history: [202607120003] => applied |
| npx supabase migration list --linked --output-format json | ok | Initialising login role... Connecting to remote database... |

## Next Step

Regenerate Phase 5 so the pure local-only counts reflect the repaired canonical snapshot row, then choose the next smallest all-live pure-local batch with module smoke evidence.

