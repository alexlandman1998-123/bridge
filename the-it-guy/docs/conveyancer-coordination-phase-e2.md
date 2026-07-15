# Conveyancer Phase E2 — Three-role dependency model

## Outcome

E2 converts matter facts and the known transfer, bond and cancellation role bindings into one deterministic cross-lane dependency graph. Every graph node contains an E1-valid draft coordination definition; E2 does not introduce a second workflow contract.

Cash matters remain transfer-only and receive no invented cross-lane work. Bond, cancellation and hybrid matters receive only the hand-offs that their facts require.

## Dependency catalogue

The initial catalogue covers:

### Bond lane

- accepted bond instruction and outstanding bank conditions;
- issued guarantee;
- transfer attorney's guarantee-wording decision;
- bond lodgement readiness; and
- bond registration confirmation.

### Cancellation lane

- current cancellation figures and expiry evidence;
- cancellation guarantee supplied through the transfer lane;
- cancellation attorney's guarantee decision;
- cancellation lodgement readiness; and
- cancellation registration confirmation.

Each dependency pins its direction, deliverable, priority, prerequisite milestones, downstream milestones and evidence contract.

## Three-role guarantee chain

On a matter requiring both bond registration and cancellation:

1. the bond attorney supplies the issued guarantee to transfer;
2. the cancellation attorney's request for the required guarantee depends on that accepted hand-off;
3. the transfer lane supplies the guarantee to cancellation;
4. cancellation returns its acceptance decision; and
5. bond and cancellation lodge-readiness confirmations feed the transfer lodgement gate.

There is deliberately no bond-to-cancellation mutation edge. The transfer lane remains the coordination hub, while the bank-appointed firms retain control of their own work and decisions.

## Matter and role bindings

E2 requires:

- an exact A-series plan ID and version;
- transaction and organisation identity;
- complete transaction facts sufficient to determine the required roles;
- exact firm and accountable owner bindings for every required lane; and
- neutral generation provenance from the system or a firm manager.

The resolved fact snapshot and its fingerprint are retained. The model rejects any mismatch between those facts and the declared required lanes, preventing a bond or cancellation lane from being silently removed.

## Graph integrity

E2 validates:

- complete node coverage for the required lanes;
- unique dependency keys;
- known prerequisites and no self-dependencies;
- an acyclic graph and deterministic topological order;
- no node using a non-required lane;
- no direct bond-to-cancellation or cancellation-to-bond edge;
- exact E1 lane, matter and plan bindings; and
- both nested E1 fingerprints and the overall E2 model fingerprint.

Canonical workflow milestones may be mapped to actual A1 action keys supplied by the caller. E2 never invents an action mapping where none exists.

## Side-effect boundary

E2 builds draft definitions in memory. It does not:

- activate a coordination request;
- notify an attorney or client;
- invite or appoint a legal role;
- persist the graph;
- mutate an attorney workflow stage; or
- accept a deliverable on another lane's behalf.

## Verification

Run:

```bash
npm run test:conveyancer-coordination-e2
```

The suite covers cash, transfer-and-bond, transfer-and-cancellation and full three-role matters; milestone mapping; missing role bindings; incomplete facts; generation authority; cycle and prerequisite detection; fact, lane, matter and nested-definition tampering; side-effect boundaries; and catalogue immutability.

## Database boundary

E2 requires no migration. It produces deterministic E1 draft definitions for later activation and persistence phases.
