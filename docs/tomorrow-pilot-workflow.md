# Arch9 tomorrow workflow — controlled pilot

**Scope:** two agencies, two attorney firms, one transaction at a time; maximum **two live transactions per agency** initially.
**Pilot lead:** _to be named_ · **Escalation channel:** _to be named_

## Start-of-session gate

1. Confirm you are in the correct Arch9 organisation and signed in as the assigned primary agent or backup.
2. Confirm the assigned attorney firm has a primary and backup contact.
3. Run and save the session check before opening **each** batch:

   ```bash
   node scripts/mvp-pilot-session-check.mjs > pilot-session-<date>-<batch>.json
   ```

   Proceed only when its decision is `go_for_controlled_pilot`. Record the check time and output filename with the batch evidence. A check from an earlier batch does not authorise the next one.
4. Open the transaction health panel before starting work.
5. Begin only when the release/session checks are green. If the application says conversion is unavailable, stop—do not use a workaround or create a manual transaction.

## Normal transaction path

1. **Capture the seller lead.** Confirm the seller’s contact details are visible and the lead remains in the agency pipeline.
2. **Create the mandate and listing.** Check property details, mandate status, assigned agent, and listing visibility before sending it to buyers.
3. **Capture or match the buyer.** Record the buyer contact details and make the buyer eligible for the listing.
4. **Create and accept the offer.** Confirm the offer is for the correct buyer and listing. Acceptance is the only permitted route to transaction creation.
5. **Create the transaction.** Wait for the conversion confirmation; do not click again if it is slow. Record the transaction reference.
6. **Assign the role players.** Confirm seller, buyer, agency, transfer attorney, bond attorney (if applicable), and any other required participant are present with the right contact details.
7. **Complete the working packet.** Upload/download required documents, follow the workflow lane assigned to your role, and use the health panel’s next action and gate to progress.
8. **Registration.** Keep working through the transaction’s visible gates until registration is recorded. Do not mark a stage complete merely to clear a warning.

## Every conversion: two-minute check

- Transaction reference, parties, and property match the accepted offer.
- Participants, required documents, workflow lanes, and gates are visible.
- The health panel has a sensible next action and no unexplained blocker.
- Notifications are addressed to the intended person. A **TEST — DO NOT ACTION** label means do not contact or retry anyone.
- The pilot operator must run and save the transaction audit before any further work on the next transaction:

  ```bash
  node scripts/mvp-postdeploy-transaction-check.mjs --transaction-id=<transaction-uuid> > transaction-<reference>-audit.json
  ```

  Run this only from the configured operator environment, where the required Supabase credentials already exist; never paste keys into the command, evidence file, or chat. Continue only when `passed` is `true`, then attach the returned `batchRecord` to the current batch evidence.

## Stop and escalate immediately

- The session check is missing, stale, or does not return `go_for_controlled_pilot`.
- Accepted-offer conversion is unavailable, fails, or returns an error; do not use a manual conversion fallback.
- No transaction appears after an accepted offer, or a duplicate is suspected.
- The post-creation health/audit check fails or reports missing participants, documents, workflow lanes, routing facts, or idempotency data.
- A participant cannot see their transaction, documents, or assigned lane.
- A document upload/download fails, or a notification goes to the wrong recipient.
- Any record shows **TEST — DO NOT ACTION** during real work.
- The agency has reached its two-live-transaction pilot limit.
- The same problem recurs after one guided recovery attempt, or anyone proposes a database edit, direct RPC call, password sharing, or stage override.

Pause new transactions. Capture the transaction/offer reference and a screenshot of the health panel. Escalate through the named channel. **Never edit the database or create a second transaction to retry.**

**Batch rule:** no recorded green session check means no new live transaction may be created in that batch.
**Transaction rule:** no recorded passing health/audit check means no subsequent live transaction may be created in that batch.

## Unsupported actions and safe fallbacks

| Do not do this | Safe fallback |
| --- | --- |
| Create a transaction manually, or convert without a confirmed accepted offer. | Leave the accepted offer unchanged, record its reference, and escalate. Conversion remains paused until the normal conversion path is available. |
| Click conversion again when it is slow, or create a second offer/transaction to “try again”. | Wait for the result, search by accepted-offer and transaction reference, then escalate a suspected duplicate. |
| Edit the database, call an internal RPC directly, or change a stage merely to clear a warning. | Capture the health-panel blocker and follow its assigned recovery action. Only the pilot operator may approve a resumed attempt. |
| Send a `TEST — DO NOT ACTION` notification, document, or link to a real person. | Stop immediately and escalate. Test data stays isolated from live work. |
| Automatically resend a failed notification. | Verify recipient and content, prepare it for review, then have an operator explicitly send it; if urgent, make a verified phone call and log it. |
| Share passwords or identity documents to solve access or document issues. | The named backup contact takes over access work; keep documents in the firm’s approved secure channel and upload to Arch9 once service is restored. |

## Controlled manual creation fallback

Use this only when the normal conversion UI is unavailable but the operator has confirmed the accepted offer is valid and no linked transaction already exists. It is **not** an alternative to a failed database/RPC deployment.

1. The named pilot operator (an active agency owner, principal, or administrator) records the incident reference and reason.
2. Preserve the accepted offer and use its verified atomic-creation payload; do not hand-create a generic transaction or alter the payload to bypass validation.
3. From the configured operator environment, run `scripts/mvp-operator-transaction-fallback.mjs` with the payload and incident reason. Do not paste credentials into chat or evidence files.
4. Record the returned transaction ID and `manual_fallback.audit_id`, then immediately run the required transaction health/audit check.

Every successful fallback is persisted in `mvp_transaction_creation_fallback_audit`. If the fallback fails, stop at the accepted offer and escalate—do not try the generic New Transaction wizard or a database edit.

**Current release gate:** until the pending migration is deployed and a named operator is confirmed, manual fallback is unavailable; pause at the accepted offer.
