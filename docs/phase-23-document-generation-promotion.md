# Phase 23 — Promote Document Generation

## Decision

**Status: PRODUCTION_PHASE_23_COMPLETE**

The 11 governed document-generation migrations were promoted individually to production project `isdowlnollckzvltkasn`, verified before ledger recording, and reconciled against the live production ledger. One additive least-privilege correction, `202607200007`, was required and completed through the same staging-certification and production-promotion gates.

## Result

| Check | Result |
| --- | --- |
| Requested document-generation migrations | 11/11 promoted |
| Corrective migrations | 1/1 promoted |
| Production ledger | 469 → 481 |
| Reviewed production evidence | 48/68 |
| Remaining governed migrations | 20 |
| Pure local-only versions | 22: 20 governed and 2 out-of-manifest |
| Duplicate migration versions | 0 |
| Pure remote-only versions | 0 |
| Divergent versions | 0 |
| Production physical backups | 8 |
| Production PITR | Disabled |
| Phase 0 broad-push guard | Active |

Operational data was preserved at 50 packets, 94 packet versions, 660 packet events, 82 documents, 21 signers and 20 signing fields. The generation lease table remains empty.

## Security correction

Migration `202607180049` correctly removed `INSERT`, `UPDATE`, and `DELETE`, but its own H2 diagnostic found 15 remaining `TRUNCATE`, `REFERENCES`, and `TRIGGER` grants for the authenticated role across five pipeline tables. Promotion stopped before ledger recording.

The additive migration `202607200007_document_generator_least_privilege_h2_fix.sql` was then:

1. rehearsed transactionally on staging with no rollback residue;
2. applied and verified on staging;
3. added to the governed manifest and 68-row staging certificate;
4. applied and verified on production; and
5. recorded before `202607180049` was accepted into the production ledger.

The live H2 contract now reports 10/10 packet-scoped policy tables, 15/15 RLS tables, zero direct pipeline write grants, and zero client grants on service-evidence tables.

## Generator verification

- Atomic packet-version creation is enforced by the unique index, guarded insert trigger, completion trigger and RPC boundary.
- Generation leases are RLS-protected, service-controlled and empty after promotion.
- Launch-chain, attempt-status, renderer-fence, recovery-rehearsal and signer-surface functions have the intended role grants and safe rejection behavior.
- The concurrency probe reports a correct current-version pointer, zero duplicate version numbers, zero event mismatches and zero orphan events.
- The backpressure probe confirms its primary key, expiry index and completion trigger while reporting `mutatedData: false`.
- The H4 application contract found that `resolve-signer-token` still returned the internal `rendered_file_path`. That field was removed, the function was deployed to staging and production, and both invalid-token probes returned the expected `404 INVALID_SIGNING_TOKEN` response without internal path data. Production function version 54 is active.

## Remaining boundary

Phase 23 deployed only the narrowly scoped `resolve-signer-token` Edge Function hardening. It did not deploy the frontend application, configure a production cohort, promote deferred attorney-accounting/calendar work, promote the conditional-master chain, merge the draft pull request, or retire the Phase 0 guard.

The Phase 12 verifier initially rejected the valid 481-row ledger because it still assumed the original 433-row recovery baseline. Phase 23 repaired the verifier to derive the expected ledger from that signed baseline plus the 48 reviewed production promotions. The recovery probe now remains useful as the ledger grows.
