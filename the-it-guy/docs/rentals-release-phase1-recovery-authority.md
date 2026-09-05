# Rentals release readiness — Phase 1 recovery authority

Phase 1 makes the staging recovery decision explicit and independently verifies the operational freeze. It reads the redacted evidence record and makes no Supabase, deployment, or configuration changes.

```sh
node scripts/rentals-release-phase1-recovery-authority.mjs
```

The report passes only when both records are present for `vaszuxjeoajeuhlcnzzf`:

1. a restorable snapshot reference or explicit `disposable` decision; and
2. a separate reference confirming both deployment freeze and outbound-integration freeze.

The records may contain only an opaque reference and timestamp. Do not commit snapshot contents, database URLs, credentials, or customer data.

A passing Phase 1 authorises only the controlled recovery plan. It does not authorise a reset, migration repair, schema change, or deployment.
