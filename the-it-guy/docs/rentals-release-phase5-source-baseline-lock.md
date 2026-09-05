# Rentals release readiness — Phase 5 source-baseline lock

Phase 5 binds the reviewed Rentals source chain to the cleared evidence and security-review chain.

```sh
node scripts/rentals-release-phase5-source-baseline-lock.mjs
```

The report hashes all 17 ordered Rental foundation/portal sources and produces one chain digest. The peer-review record in [`config/rentals-release-source-lock-approval.json`](../config/rentals-release-source-lock-approval.json) must reference that exact digest. Any source change or source reordering invalidates the approval.

The lock requires Phase 3 evidence clearance and Phase 4 security-exception approvals first. A passing report permits managed migration authoring only; it never permits a database apply.
