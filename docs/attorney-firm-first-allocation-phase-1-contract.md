# Attorney firm-first allocation — Phase 1 contract

Date: 2026-07-17

## Decision

Every legal instruction is owned by an attorney firm. A person inside that firm owns the operational work. Firm ownership and person responsibility are two levels of one assignment, not mutually exclusive allocation modes.

The canonical relationship is:

```text
transaction + legal role
  -> appointed attorney firm
    -> primary attorney
    -> optional supporting attorney, secretary and admin handler
```

Person-only allocation is invalid. Firm-only allocation is a valid temporary state but cannot become an active legal role.

## Legal-role authority

| Legal role | Appointment authority | Internal assignment authority |
| --- | --- | --- |
| Transfer attorney | Seller or authorised agent | Accepted firm |
| Bond attorney | Appointing bank | Accepted firm |
| Cancellation attorney | Appointing bank | Accepted firm |

A preferred contact or attorney may be nominated, but remains non-binding until the appointed firm assigns that active member.

## Canonical lifecycle

| State | Meaning | Required data |
| --- | --- | --- |
| `awaiting_firm_acceptance` | Firm has been nominated or invited | Legal role and firm/contact nomination |
| `awaiting_staff_assignment` | Firm accepted; no primary attorney yet | Firm and acceptance evidence |
| `staff_assigned` | Firm assigned its primary attorney | Firm and active member identity |
| `active` | All activation conditions are satisfied | Firm, primary attorney, module and instruction evidence |
| `declined` | Nominated firm or instruction was declined | Decline actor, time and reason |
| `replacement_required` | A new firm must be appointed | Supersession/replacement context |
| `completed` | Legal role finished | Completion evidence |
| `removed` | Assignment is no longer operational | Removal evidence |

Valid transitions are exported by `src/core/transactions/attorneyFirmFirstAllocation.js`. Direct `awaiting_firm_acceptance -> active` activation is invalid.

## Canonical vocabulary

- **Firm appointment:** external selection of the legal service provider.
- **Preferred attorney:** non-binding nomination used by the firm during allocation.
- **Primary attorney:** active firm member responsible for the legal role.
- **Supporting staff:** optional attorney, secretary or admin resources.
- **Internal reassignment:** changes staff without changing the appointed firm.
- **Firm replacement:** supersedes the appointed firm and clears its staff ownership.
- **Activation:** makes the legal role operational after every required gate passes.

## Compatibility mapping

The Phase 1 code is read-only and maps current records as follows:

- Existing active firm-and-person assignments map to `active`.
- Accepted bank appointments without a person map to `awaiting_staff_assignment`.
- Listing-level firm/contact nominations map to `awaiting_firm_acceptance`; contact text never becomes a platform-user assignment.
- `replacement_required`, declined, completed and removed legacy states retain their terminal meaning.
- `transfer_and_bond` is treated as the legacy transfer role for compatibility; later write phases continue using separate canonical transfer and bond rows.

## Activation invariants

Activation requires all of the following:

1. An appointed attorney firm.
2. Recorded firm acceptance.
3. A primary attorney.
4. The primary attorney is an active member of that firm.
5. The applicable firm service module is enabled.
6. External instruction confirmation where the legal role requires it.

## Phase 1 scope boundary

Phase 1 introduces the shared domain contract, legacy mapping and tests only. It does not:

- change database schema or RLS;
- alter current assignment write paths;
- change agent or attorney UI;
- backfill production data;
- activate a new feature flag.

Later phases must import this contract rather than introduce parallel state names or ownership rules.
