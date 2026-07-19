# MVP exposure readiness gate

Do not expose Arch9 to pilot agencies or attorneys because local tests are green. Exposure requires fresh staging evidence from the exact deployed environment.

## Required proof

1. The atomic-creation migration is applied to staging and `bridge_create_mvp_transaction` is deployed.
2. The deployment contract check is recorded.
3. Test-data notification suppression and the outbox smoke check pass.
4. A real staging run passes from lead through registration for all four scenarios:
   - `cash_individual`
   - `bond_company`
   - `hybrid_trust`
   - `development_company`
5. Each run has a passing persisted-spine/post-deploy check and a batch record with an idempotency key and participant, document, and workflow bootstrap confirmations.
6. A named operator collected the evidence within the last 24 hours.

Start with [the template](mvp-exposure-evidence.template.json), replacing every placeholder or `false` value only with evidence from the real staging run. Do not store client PII, document content, credentials, or secrets in the evidence file.

Run the fail-closed gate from the app root:

```bash
node scripts/mvp-exposure-readiness.mjs --evidence=path/to/staging-exposure-evidence.json
```

Only `ready_for_controlled_exposure` permits one controlled pilot batch. Any other decision is `do_not_expose`; resolve every listed blocker and rerun with fresh evidence.
