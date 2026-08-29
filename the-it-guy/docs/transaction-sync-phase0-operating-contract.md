# Transaction Synchronization Operating Contract — Phase 0

Date: 2026-08-29  
Status: Frozen for implementation  
Scope: Buyer, seller, agent, bond-originator, transfer-attorney, bond-attorney, cancellation-attorney, and system actions after a transaction exists.

## Outcome

Phase 0 freezes the operating contract for transaction synchronization. It does not change runtime behaviour, migrate production data, or certify that current propagation is complete.

The executable action matrix is [transaction-sync-phase0-action-matrix.json](transaction-sync-phase0-action-matrix.json). Later phases must update the implementation to conform to the matrix; they must not silently change the matrix to match a shortcut in an individual module.

## Central transaction model

The transaction is the aggregate boundary. It is not a single mutable row that every module edits directly.

```text
Role action
  -> authoritative specialist/participant record
  -> canonical transaction event
  -> affected lane and step calculation
  -> parent transaction rollup
  -> audience-scoped activity projection
  -> transaction refresh signal
  -> immutable audit record
```

The six durable outputs required from every in-scope action are:

1. `transaction_event`
2. `lane_state`
3. `transaction_rollup`
4. `activity_projection`
5. `refresh_signal`
6. `audit_record`

An action is not operationally complete because its originating screen saved successfully. It is complete only when all required outputs are durable or the command has failed atomically and is safe to retry.

## Authority boundaries

| Concern | Authority | Rule |
| --- | --- | --- |
| Transaction identity and lifecycle | `transactions` plus the derived rollup | Legacy stage fields are compatibility inputs, not independent workflow truth. |
| Workflow position | Child lanes and steps | Child state determines the parent milestone and current workflow item. |
| Specialist finance processing | Bond application, bank outcome, offer, grant, and originator records | Specialist records may advance finance only through a canonical event and lane adapter. |
| Legal processing | Transfer, bond-registration, and cancellation lanes | Each attorney lane owns its steps but not the shared macro tracker. |
| Activity | Projection of `transaction_events` | Comments and activity rows cannot independently change workflow state. |
| Shared progress | Audience-safe projection | It is a delivery/read model, not a competing source of truth. |
| Refresh | Transaction-version signal | Consumers subscribe by `transaction_id`, not to a growing list of domain tables. |

## Profile ownership

The word “profile” has three meanings that must remain separate:

1. Account identity in `profiles`: reusable name, profile image, and current contact details.
2. Transaction participation in `transaction_participants`: role, status, transaction contact details, legal capacity, and visibility permissions.
3. Historical legal evidence in signed or accepted documents: the party snapshot at the time of signing or acceptance.

Account-profile edits may update current presentation, but must not silently rewrite signed evidence. Any change that affects operation or notification of a specific transaction must use a transaction participant command and emit the six required outputs.

## Visibility contract

- `internal`: only the owning team or explicitly authorised internal role.
- `professional_shared`: authorised transaction professionals, excluding buyer and seller portals.
- `client_visible`: an audience-safe projection targeted to buyer, seller, or both.

Missing visibility metadata fails closed to `internal`. Client-visible content requires safe title and description copy. Raw blocker text, internal comments, identity documents, bank credentials, settlement figures, signature images, and private legal advice cannot be exposed through fallback rendering.

## Activity and comment rules

- Every comment has an owning role, transaction, lane, actor, timestamp, visibility, and idempotency key.
- Internal attorney or originator notes never appear in buyer or seller activity.
- Professional-shared comments appear once in every authorised professional workspace.
- Client-visible comments require explicit buyer/seller recipients and client-safe wording.
- An activity item is produced from the canonical event; screens do not maintain independent activity truth.
- A comment that also changes workflow state must use a workflow command and a comment event, linked by one command/idempotency identifier.

## Refresh and delivery rules

The canonical signal is `transaction_version_changed`, scoped by `transaction_id`.

- Target propagation latency: two seconds for connected workspaces.
- Polling fallback: 30 seconds.
- The signal is emitted after durable event, lane, rollup, and activity projection updates.
- Reconnect performs a version comparison and reloads when the local version is behind.
- Retried commands cannot duplicate events, activities, notifications, or transitions.
- Failed projections enter a recoverable queue and are visible in propagation health reporting.

The current Supabase Realtime contract must use application-owned objects in an exposed application schema; it must not attempt to create or modify objects in Supabase's locked `realtime` schema.

## Action coverage

The matrix freezes actions for:

- buyer transaction profile, onboarding, documents, and OTP signing;
- seller transaction profile, onboarding, and documents;
- agent transaction changes, role-player assignments, client updates, and overrides;
- bond-originator progress, document requests, bank submissions, outcomes, offers, and grants;
- transfer-attorney stages, comments, document review, lodgement, and registration;
- bond-attorney stages, guarantees, and comments;
- cancellation-attorney stages, guarantees, and comments; and
- system evidence reconciliation.

Each action names exactly one owner, one authoritative source table, one canonical event type, one affected lane, its audiences, visibility rule, idempotency scope, and current implementation state.

## Explicit non-goals

Phase 0 does not:

- create or alter Supabase tables, functions, triggers, policies, publications, or data;
- repair the production gaps found by the synchronization audit;
- remove legacy journey fallbacks;
- make internal content client-visible;
- collapse account identity, transaction participation, and legal evidence into one profile record; or
- allow originator progress commentary to invent a bank outcome, offer, grant, or macro milestone.

## Acceptance gate

Phase 0 is complete when:

- the machine-readable matrix passes validation;
- every required role and transaction lane owns at least one action;
- every action has the required ownership, authority, event, lane, audience, visibility, idempotency, refresh, and audit contract;
- client-visible actions are explicitly safe-projection actions;
- disconnected and partial paths are retained as Phase 1 remediation inputs; and
- no runtime or production data change is included in the Phase 0 change set.

## Verification

```bash
npm run test:transaction-sync-phase0
```
