# Attorney Leads — Phase 7 Lead-to-Matter Conversion

Phase 7 adds an explicit, idempotent conversion from a qualified Attorney Lead into a firm-originated active Matter.

## Conversion model

The existing Attorney operational workspace treats an active transaction plus an active `transaction_attorney_assignments` row as a Matter. The conversion command creates that canonical pair directly and records `instruction_status = accepted`.

It does not create a pending network instruction and never places the record in Incoming Matters.

## Delivered

- Explicit user confirmation and selection of Transfer, Bond Registration, or Bond Cancellation.
- Matter-type-specific client roles and Attorney-qualified Matter owner validation.
- Required property address and bounded optional Matter value.
- Reuse of the Lead's canonical tenant-scoped Contact as the transaction party linkage.
- Transaction creation with an Attorney-facing matter number supplied by the existing matter-number trigger.
- Active, accepted firm assignment for the selected Attorney and legal lane.
- Durable one-to-one lineage across Lead, conversion, transaction, and Attorney assignment.
- Lead is marked Won only after transaction and assignment creation succeed.
- Completed conversions are idempotently returned rather than duplicated.
- Existing valid `converted_transaction_id` linkage can be reconciled into the new lineage table.
- Started, completed, and failed conversion activity history.

## Security and atomicity

- Conversion requires authenticated Lead assignment authority.
- The database rechecks tenant, Lead domain, firm, active Matter owner membership, Attorney qualification, stage, client role, property context, and values.
- The command runs under a fixed search path and holds a Lead row lock.
- Transaction, assignment, Lead state, and completed lineage commit together.
- The inner conversion block rolls back partial work before recording a failed attempt.
- Clients can read permitted lineage rows but cannot directly insert, update, or delete them.

## Client/party decision

`contacts` remains the canonical CRM identity and is linked through `buyer_contact_id` or `seller_contact_id`. A transaction-scoped `buyers` projection is also created because the existing Attorney Matter read model uses `transactions.buyer_id` for its primary client label. This does not merge or replace the canonical Contact.

## Deferred

- Quote generation and acceptance as a prerequisite.
- Multi-party capture and full FICA onboarding during conversion.
- Automatic department or workload routing.
- Notifications and post-conversion task templates.
- Cross-vertical extraction for Bond Originator or Developer conversions.
