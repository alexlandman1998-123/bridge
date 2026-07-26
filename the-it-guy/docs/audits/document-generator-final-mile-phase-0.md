# Document Generator Final-Mile Phase 0

Date: 2026-07-26

## Decision

Repair the existing final-mile flow today. Do not rebuild the document generator.

The staging evidence shows final signed artifact paths already exist for the affected OTP and mandate. The blocker is after generation: final completion status, recipient delivery evidence, final signed access resolution, and workspace UI truthfulness.

## Frozen Scope

Allowed fix areas:

- final signed completion status
- recipient delivery evidence
- controlled test-recipient delivery handling
- final signed access resolution
- workspace final completion UI
- document generator smoke harness
- affected staging packet recovery

Out of scope:

- new document generator architecture
- new template engine
- new signing provider
- unrelated document workspace refactors
- unrelated email workflows
- unrelated migration repair

## Affected Staging Packets

| Type | Packet | Version | Observed State |
| --- | --- | --- | --- |
| OTP | `9ea0cf58-0e0f-47f4-b120-c4cde8d70c7c` | `5f3dc0d7-7e6d-428e-8404-90bdc9bc3051` | `completed_everywhere` with `recipient_delivery_pending` |
| Mandate | `92d1a77a-26a6-4373-87d4-ec1871851f39` | `e06150db-596c-476d-a99d-d3f1cac442c9` | `completed_everywhere` with `recipient_delivery_pending` |

## Decision Owners

- Completed: `bridge_get_final_completion_status_f5`
- Delivered: `dispatch-final-signed-document` and `bridge_record_final_delivery_f3`
- Controlled test recipient: `assessControlledTestRecipient`
- Downloadable: `resolve-final-signed-document-access`
- Access fence: `resolvePublishedFinalSignedArtifact`
- Retryable: `retry-final-document-completion`
- Workspace UI: `LegalDocumentWorkspace`
- Smoke harness: `document-generator-phase-g2-browser-usability`

## Exit Criteria

Phase 0 is complete when `npm run test:document-generator-phase0` passes and the scope manifest remains the authority for Phase 1 onward.
