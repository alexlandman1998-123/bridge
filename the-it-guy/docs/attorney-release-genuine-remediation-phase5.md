# Attorney release — Phase 5 controlled staging remediation

## Outcome

Phase 5 repaired the approved attorney propagation gaps in staging without touching production. The guarded run reduced the health RPC result from 129 gaps to zero across 109 matters.

## Safety contract

The batch runner is fail closed:

- staging identity and production separation are checked before every run;
- recovery confirmation is mandatory for apply mode;
- the input Phase 2 manifest fingerprint must be valid and current;
- every batch requires an approver label and approval reference;
- only `allowlisted_automatic_candidate` entries with a valid current stage are eligible;
- matter classes are processed separately;
- a batch contains at most ten unique matters;
- apply succeeds only when repaired rows equal the observed global gap reduction and every selected matter has zero remaining gaps;
- the Phase 2 manifest is regenerated after every applied batch;
- receipts, allowlists, and the redacted ledger are owner-readable artifacts and contain record keys instead of raw transaction IDs.

## Commands

Dry-run a batch:

```bash
npm run apply:attorney-release-batch-phase5 -- --matter-class=genuine --limit=10 --approved-by='<approver>' --approval-reference='<reference>'
```

Apply the same bounded workflow:

```bash
npm run apply:attorney-release-batch-phase5 -- --matter-class=genuine --limit=10 --approved-by='<approver>' --approval-reference='<reference>' --apply
```

Verify the contract and staging result:

```bash
npm run test:attorney-release-controlled-batches-phase5
npm run check:attorney-release-phase3:staging
npm run report:attorney-release-propagation-phase2
```

## Applied result — 2026-09-05

- 12 applied batches: 1 `other_demo` batch and 11 `genuine` batches.
- 109 unique matters selected; no batch exceeded ten matters.
- 129 missing propagation rows repaired.
- Global propagation gaps reduced from 129 to 0.
- Final Phase 2 manifest fingerprint: `7e0e0a3035bcf29385e41fab87422a37e02e71913e466aef2d4bca52bae14a76`.
- Final Phase 3 staging health: `GO`, `healthy`, gap count `0`.

The audit ledger is written to `output/attorney-release/phase5-controlled-batch-ledger.json`. This is staging evidence, not production release approval.
