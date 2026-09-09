# Attorney automation and sharing verification

Date: 9 September 2026

## Verdict

Not a live cross-role release sign-off. Twenty-five targeted automated suites passed after repairing one stale migration filename in the upload contract test. A separate failure-injection diagnostic reproduced misleading failure reporting after a successful document approval.

Production records were not changed. No live request, upload, approval, task transition or invitation was sent. Hosted checks were limited to staging authentication and reads.

## Action coverage

| Action | Evidence obtained | Remaining live proof |
| --- | --- | --- |
| Request | Buyer/seller document-centre request overlays, audience filtering, duplicate/container handling, cross-workspace parity and automation contracts pass. | Create a controlled request and observe its delivery and appearance in each authorised session. |
| Upload | Atomic upload SQL/client contract and seller promotion/idempotency checks pass; canonical document lifecycle tests pass. | Actual storage upload, request fulfilment, automation recovery and visibility in all linked sessions. |
| Approval | Inline approval/correction UI tests and canonical review contracts pass. Failure injection reproduced the post-commit error described below. | Approval and correction on a controlled uploaded file, followed by independent role reads and reloads. |
| Completion | Actual atomic SQL, saved task-handler remounts, progress calculations and five-audience rendering/projections pass. | One live task completion observed independently by all linked roles. |
| N/A | Atomic SQL, reason preservation, applicable-count calculation, remount and five-recipient projection checks pass. | Same live staging transition and reload proof. |
| Reopen | Atomic SQL, task-handler remount, high-level journey regression and five-recipient projection checks pass. | Same live staging transition and reload proof. |

The projection tests now explicitly compare completed, not_applicable and not_started (reopened) states at the same revision across attorney, agent, developer, buyer and the separate seller-session reader. Six routing scenarios cover cash/bond/hybrid with individual/company buyers. Role permissions in these isolated SQL fixtures are controlled stand-ins, not five real signed-in accounts.

## Confirmed defect: approval can save but be reported as failed

`reviewCanonicalDocumentRequirement` in `src/lib/api.js` commits `bridge_review_canonical_requirement`, then performs a document lookup. A non-schema error from that lookup is thrown at line 52565. The task UI consequently receives a rejected promise despite the successful approval.

Failure injection against the actual extracted service function produced:

```json
{"check":"approval-postcommit-read-failure","approvalCommitted":true,"promiseRejected":true,"message":"Read failed after approval committed"}
```

Recommended fix: distinguish the committed review from subsequent refresh/automation work, return an explicit saved-with-refresh-warning outcome, and avoid encouraging duplicate approval. Verify downstream evidence processing recovery separately. No product fix was made during this verification request.

## Refresh and automation limitations

- The buyer/seller portal uses its authorised loader with a 15-second visible-page polling interval, not WebSocket push. Offline/hidden-page recovery, retry, stale-revision rejection and refresh coalescing tests pass. These are controlled hook tests, not measured multi-browser delivery latency.
- Buyer upload persists the document and canonical requirement atomically. Additional request projection, automation and notifications run in a detached browser async continuation (`src/lib/api.js`, around line 49424). Errors are logged after the upload has already succeeded. Browser-close/network-failure recovery for these follow-ups still needs a live test; passing the upload contract does not prove their eventual delivery.
- Private notes are excluded from shared journey projections. Confirmation-note SQL tests verify authorised reads, denial after assignment removal, no anonymous table read, and no direct authenticated insert. Buyer/seller correspondence and revoked-session tests also pass in isolation.
- Completing or marking a task N/A is an operational outcome, not proof that a missing document was uploaded or approved. Those states must remain distinct.

## Staging preflight

- Host verified as the configured non-production staging project before connecting.
- Saved staging attorney login succeeded; three sampled visible matters returned shared journey snapshots successfully (revision 0).
- Confirmation table read was accessible to the staging attorney.
- Saved staging agent login succeeded but the sampled subprocess query returned no visible matters.
- No shared staging fixture with verified developer, buyer and seller sessions was available for this run. Existing staging acceptance code uses real organisation contacts and can issue notifications; it was not executed in write mode as a substitute for a controlled no-external-delivery test.
- These read checks do not certify the current local candidate in deployed browsers.

## Suites run

All passed on the local working tree:

1. shared-matter-journey-contract
2. shared-matter-journey-plan
3. shared-matter-journey-atomic
4. shared-matter-journey-reader
5. shared-matter-journey-views
6. shared-matter-journey-live-refresh
7. shared-matter-journey-live-hook
8. shared-matter-conversation
9. shared-matter-conversation-ui
10. shared-matter-reconciliation
11. shared-matter-reconciliation-service
12. high-level-journey-audiences
13. high-level-journey-integration
14. atomic-buyer-portal-document-upload
15. client-portal-canonical-document-request-phase5
16. document-request-phase8-client-portal-container-adoption
17. buyer-portal-phase4-canonical-documents
18. legal-task-inline-work
19. legal-task-save-reliability
20. canonical-document-lifecycle
21. canonical-document-review-ui
22. document-request-phase14-cross-workspace-parity
23. document-request-canonical-phase16-automation-contract
24. kingstons-seller-documents-phase10-idempotent-portal-sync
25. full-transaction-portal-staging-acceptance (contract checks only; write-mode acceptance not run)

The upload test initially failed because it referenced migration `20260831132002`; the actual reconciled migration is `20260831125409_atomic_buyer_portal_document_upload.sql`. Only the test reference was corrected. No migration history was changed.

## Next gate

Fix the confirmed approval error-reporting defect, then use a disposable staging matter linked to five controlled identities with safe recipient addresses. Exercise request → upload → approve/correct → complete → N/A → reopen, observing the same task ID and committed revision in each role, reload persistence, document ownership/privacy and failed-delivery recovery. Only that provides the missing live sign-off.
