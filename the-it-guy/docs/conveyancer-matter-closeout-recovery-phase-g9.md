# Conveyancer matter close-out, migration and recovery — Phase G9

G9 makes the end and recovery of a matter evidence-backed. It covers the operational gaps that usually appear only at launch: closing, original-document custody, archiving, reopening, historical migration, duplicate review, failed-job administration, approved support access and continuity evidence.

## Matter close-out

A close-out assessment requires:

- registration evidence with an immutable reference and hash;
- an approved D7 final account;
- a zero-balance, approved trust reconciliation;
- no unresolved exceptions;
- reconstructable correspondence history;
- resolved original-document custody and disposition;
- a valid G2 retention schedule; and
- completed close-out actions in the matter plan.

The original-document register preserves custody movements, authorisation and evidence. Destruction is prohibited under legal hold.

A defensible archive is a versioned, classified, retention-bound manifest of record references and hashes. Excluded records require reasons. G9 prepares a close command but does not close the matter or write an archive.

Reopening requires an authorised attorney or firm manager, a reason, the immutable prior closure fingerprint and a new plan-definition version. Closed evidence remains immutable.

## Historical migration

Historical imports bind every source matter and bulk-document manifest to source references, hashes and a mapping version. Exact and probable duplicate matters are flagged for human review and are never merged automatically.

Import reconciliation accounts for every source item and expected document as imported, rejected or quarantined. Unbalanced document counts block acceptance.

## Recovery and support

Failed jobs and webhook events produce retry intents only. Retry requires:

- the failed job fingerprint and evidence;
- an idempotency key;
- operations and security approval by different people;
- a disabled kill switch; and
- verified webhook signature and provider-event hash where applicable.

Support access is restricted to redacted diagnostics for named matters, requires independent manager and privacy approval, expires within four hours and never grants payload, credential, privileged-content or export access.

Operational recovery evidence binds tested backup, restore, rollback and business-continuity records to RPO/RTO objectives and independent operations, security and legal sign-off. It records readiness without restoring a database or executing rollback.

## Exit gate

G9 is complete when matters can be assessed for closing, archived and reopened through explicit evidence; historical imports reconcile exactly; failed jobs and webhooks have controlled replay intents; and recovery/support activity is independently approved and auditable without undocumented database intervention.

The G9 contract is in-memory and reference-only. Durable registers, archive storage, import workers, admin screens, support-session enforcement and recovery execution remain productisation responsibilities. No database migration is introduced by this phase.
