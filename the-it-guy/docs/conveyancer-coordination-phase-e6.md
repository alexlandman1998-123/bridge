# Conveyancer Phase E6 — Escalations and replacement

## Outcome

E6 adds a controlled recovery path when cross-firm coordination is overdue, blocked or no longer viable.

It keeps two decisions separate:

- an **escalation** asks the responsible lane to respond or remediate an E1, E4 or E5 issue; and
- an **attorney replacement referral** asks the lawful appointing authority to confirm a replacement firm.

Neither path lets the transfer attorney, another professional firm or the platform appoint a bank-selected attorney.

## Escalatable sources

An escalation must bind to an actual source signal:

- an E1 request whose acknowledgement SLA has expired;
- acknowledged or in-progress E1 work whose delivery SLA has expired;
- an explicitly blocked E1 handoff;
- an E4 guarantee-workspace issue; or
- a blocking E5 simultaneous-lodgement issue.

Draft or otherwise healthy coordination records cannot be escalated merely because a user supplied a reason. The source artifact, issue code, source state, timestamp and fingerprint are pinned into the escalation.

## Escalation lifecycle

The lifecycle is:

1. `open`
2. `acknowledged`
3. `resolved` or `cancelled`

Escalation levels are sequential. Level three requires a firm manager. Only the bound owner lane can acknowledge or resolve, and resolution requires a reference and SHA-256 evidence hash. The raising user—or a manager from the same raising firm—may cancel with a reason.

Severity determines response and resolution SLAs:

- medium: 24-hour acknowledgement and 120-hour resolution;
- high: 8-hour acknowledgement and 48-hour resolution; and
- critical: 2-hour acknowledgement and 12-hour resolution.

Blocked, expired and materially mismatched work is critical. Overdue handoffs are high priority.

Commands require the current revision and fingerprint. Reusing a command ID with the same payload is idempotent; changing the payload under the same ID is rejected.

## Replacement referrals

Replacement preserves the existing legal-role authority matrix:

- the seller appoints a replacement transfer attorney;
- the new lending bank appoints a replacement bond attorney; and
- the existing bank appoints a replacement cancellation attorney.

The transfer or affected lane may open a referral when the current appointment is `declined` or `replacement_required`. Persistent non-response may also be referred after a live level-two escalation owned by that lane.

The referral deliberately contains no proposed replacement firm. It records the current firm, reason, trigger, evidence, appointing authority and response SLA.

## Appointment confirmation

Only the authority defined for that legal role can confirm a distinct new firm. Confirmation requires:

- the external authority's role and actor identity;
- a different firm ID;
- appointment evidence reference and SHA-256 hash; and
- a timestamp after the referral.

Confirmation does not immediately change the matter. It produces an immutable appointment packet marked `dependencyModelRegenerationRequired`. A later controlled integration must rebuild E2, reconcile or supersede open E1 records, revoke old access and invite the confirmed firm in the correct order.

This prevents a partially replaced matter where old E3–E5 projections continue to appear valid against changed firms.

## Access and privacy

Escalations are available only to professionals bound to an E2 lane and firm. Escalation commands are limited to the raising and owning participant lanes. Replacement referrals require a legal professional or firm manager; operational users cannot initiate a legal appointment replacement.

Events contain reasons and opaque references, not document bodies, bank-account details, personal identity data or new-firm contact details.

## Side-effect boundary

E6 is an in-memory command and contract layer. It does not:

- send reminders or escalation notices;
- choose or appoint a firm;
- revoke the old firm's access;
- send replacement invitations;
- mutate E1, E2, E4 or E5;
- write to the database; or
- lodge or submit documents.

## Verification

Run:

```bash
npm run test:conveyancer-coordination-e6
```

The suite covers overdue and blocked escalation, owner-only acknowledgement and evidence-backed resolution, sequential escalation, level-three authority, idempotency, replacement after decline or sustained non-response, seller and bank appointment boundaries, distinct-firm confirmation, regeneration flags, outsider denial and tamper detection.

## Database boundary

E6 requires no migration. Durable escalation history, notification delivery, access revocation and replacement activation remain later integration work.
