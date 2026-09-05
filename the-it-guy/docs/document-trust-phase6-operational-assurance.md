# Document trust — Phase 6 operational assurance

Phase 6 is a read-only health report for the document-trust rollout. It does not migrate, hide, delete, upload, or update records.

## What it checks

- It scopes its checks to transactions with an active buyer portal link, so historic or seller-only records do not obscure this week's buyer release signal.
- Every in-scope canonical requirement in an evidence-bearing status (`uploaded`, `under_review`, `approved`, or `completed`) has a satisfied document that points back to that exact requirement instance.
- When the Phase 4 buyer read fence is asserted, in-scope active legacy required-document rows must already have canonical links.
- An active or ready Phase 5 pilot still enforces one originator, no automatic bank submission, no live delivery, and an unchanged bank workflow.

## Runbook

The report needs a local, non-committed service-role environment file. It never prints the URL or credentials.

```sh
node scripts/document-trust-phase6-operational-assurance.mjs \
  --env-file=.env.staging.local \
  --phase4-enabled \
  --require-phase4 \
  --fail-on-issues
```

To include a specific active pilot in the boundary check, add `--pilot-id=<uuid>`. The command writes its JSON receipt to `output/document-trust-phase6-operational-assurance.json` by default and exits non-zero when `--fail-on-issues` finds a blocking condition.

## Verification

```sh
npm run test:document-trust-phase6
npx vitest run src/services/__tests__/documentTrustOperationalAssuranceService.test.js
```
