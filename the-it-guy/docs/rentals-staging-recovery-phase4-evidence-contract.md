# Rentals staging recovery — Phase 4 evidence contract

Phase 4 accepts only redacted, read-only recovery evidence. It binds production evidence to `isdowlnollckzvltkasn` and staging evidence to `vaszuxjeoajeuhlcnzzf`; environment identities cannot be exchanged.

Populate only opaque references, timestamps, and SHA-256 fingerprints in [`config/rentals-staging-recovery-evidence.json`](../config/rentals-staging-recovery-evidence.json). Do not commit connection strings, tokens, SQL result rows, backups, or customer data.

Validate the record locally:

```sh
node scripts/rentals-staging-recovery-phase4-evidence.mjs
```

The validator requires:

- a redacted production migration-ledger artifact and catalog artifact, each with a SHA-256 fingerprint;
- a staging snapshot/disposability confirmation;
- explicit staging deployment and outbound-integration freeze confirmation;
- `containsSecrets: false` and `containsCustomerRecords: false` for every artifact.

A passing report unlocks only Phase 3’s managed-migration **authoring** gate. It never authorises a database migration, ledger repair, deployment, or reset.
