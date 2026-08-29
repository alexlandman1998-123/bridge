# Transaction sync Phase 7: canary certification

Phase 7 certifies one real transaction across the buyer, seller, agent, bond-originator, and attorney projections before any fleet-wide rollout decision.

## Certification gate

A canary passes only when:

- the Phase 5 operational assessment is healthy;
- all five role projections report the same non-zero transaction version;
- all five projections have identical stage and lane snapshots;
- buyer and seller receive only explicitly addressed client-visible activity;
- professional-shared activity does not reach client projections;
- attorney-internal activity does not reach buyers, sellers, agents, or originators;
- the agent may see only its exact `AgentWorkflowOverrideApplied` internal event;
- every client-visible projection has safe non-empty copy and an empty payload; and
- the evidence produces a deterministic SHA-256 fingerprint.

Phase 7 corrects the agent-override visibility gap with an exact RLS predicate matching the event type, agent audience, authenticated agent role, and existing transaction access. It does not broaden access to other internal activity.

## Certification receipts

`transaction_sync_certification_runs` stores privacy-safe evidence only: transaction, environment, project ref, status, version, role-version map, issue codes, summary counts, evidence hash, reason, and timestamp. The table has RLS, internal read access, service-role insert access, and no application update/delete path.

Plan mode is read-only. `--certify` records the result, including a failed result, as immutable operational evidence.

## Commands

Plan:

```bash
npm run certify:transaction-sync-phase7 -- \
  --environment=staging \
  --transaction-id=<uuid>
```

Record a staging certification:

```bash
npm run certify:transaction-sync-phase7 -- \
  --certify \
  --environment=staging \
  --transaction-id=<uuid> \
  --confirm-canary-certification \
  --confirm-project-ref=<project-ref> \
  --reason="Certify five-role synchronization after the controlled recovery gate."
```

Production certification additionally requires `--confirm-production`. Phase 7 does not perform a fleet-wide cutover or apply its migration remotely.

