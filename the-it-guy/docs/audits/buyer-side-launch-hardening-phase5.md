# Buyer-Side Launch Hardening Phase 5

Implemented on 2026-07-11.

## Goal

Implement the buyer-side document and privacy verification gate for the launch journey from buyer lead to registration.

Phase 5 verifies that buyer document requirements are not only generated and uploadable, but also private by default. It covers buyer FICA requests, buyer finance requests, buyer-uploaded files, review-state files, downloadable files, document access grants, raw table RLS, storage-path privacy, and unrelated-user denial.

## Commands

Local contract verification:

```bash
npm run verify:buyer-side-phase5-document-privacy
```

Static-only preflight:

```bash
node scripts/buyer-side-phase5-document-privacy-verification.mjs --static-only
```

Strict live staging document privacy evidence:

```bash
node scripts/buyer-side-phase5-document-privacy-verification.mjs --live --confirm-staging --require-live
```

## Document Evidence Matrix

| Evidence | Source | Required live proof |
| --- | --- | --- |
| Primary buyer document request | `document_requests` | Configured request row belongs to the configured buyer transaction. |
| Buyer FICA request | `document_requests` | Configured request row belongs to the transaction and clearly maps to FICA, identity, or proof-of-address evidence. |
| Buyer finance request | `document_requests` | Configured request row belongs to the transaction and clearly maps to finance, bond, bank, income, or proof-of-funds evidence. |
| Buyer uploaded document | `documents` | Configured uploaded document row belongs to the transaction and has a file path. |
| Buyer review document | `documents` | Configured review document row belongs to the transaction and has a review/upload status. |
| Buyer download document | `documents` | Configured download document row belongs to the transaction and matches the configured storage path. |
| Document access grants | `transaction_document_access_grants` | Request/document grants prove buyer upload, professional review, and view/download permissions. |
| Storage path privacy | `documents.file_path` plus portal signing guard | The path is only exposed through token-scoped portal payloads and the signer checks the path belongs to the portal transaction. |

## Privacy Access Matrix

| Persona | Raw document metadata | Raw document file path | Expected result |
| --- | --- | --- | --- |
| Buyer | `document_requests`, `documents` | `documents.file_path` lookup | Denied outside token-scoped portal flows. |
| Assigned agent | `document_requests`, `documents` | `documents.file_path` lookup | Allowed for assigned transaction evidence. |
| Transfer attorney | `document_requests`, `documents` | `documents.file_path` lookup | Allowed for assigned transaction evidence. |
| Bond user | `document_requests`, `documents` | `documents.file_path` lookup | Allowed for assigned bond/finance transaction evidence. |
| Unrelated user | `document_requests`, `documents` | `documents.file_path` lookup | Denied with zero rows or database denial. |

## Live Evidence Contract

Real values must live in `.env.staging.local` or managed deployment secrets. `.env.example` only contains empty placeholders.

Required strict-live document/privacy evidence:

- `BUYER_SIDE_LAUNCH_SUPABASE_PROJECT_REF`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL` or `VITE_SUPABASE_URL`
- `SUPABASE_ANON_KEY`, `VITE_SUPABASE_ANON_KEY`, or `VITE_SUPABASE_KEY`
- `BUYER_SIDE_STAGING_TRANSACTION_ID`
- `BUYER_SIDE_STAGING_DOCUMENT_REQUEST_ID`
- `BUYER_SIDE_STAGING_BUYER_FICA_DOCUMENT_REQUEST_ID`
- `BUYER_SIDE_STAGING_BUYER_FINANCE_DOCUMENT_REQUEST_ID`
- `BUYER_SIDE_STAGING_BUYER_UPLOADED_DOCUMENT_ID`
- `BUYER_SIDE_STAGING_BUYER_REVIEW_DOCUMENT_ID`
- `BUYER_SIDE_STAGING_BUYER_DOWNLOAD_DOCUMENT_ID`
- `BUYER_SIDE_STAGING_BUYER_DOCUMENT_STORAGE_PATH`
- `BUYER_SIDE_STAGING_BUYER_EMAIL`
- `BUYER_SIDE_STAGING_BUYER_PASSWORD`
- `BUYER_SIDE_STAGING_AGENT_EMAIL`
- `BUYER_SIDE_STAGING_AGENT_PASSWORD`
- `BUYER_SIDE_STAGING_ATTORNEY_EMAIL`
- `BUYER_SIDE_STAGING_ATTORNEY_PASSWORD`
- `BUYER_SIDE_STAGING_BOND_EMAIL`
- `BUYER_SIDE_STAGING_BOND_PASSWORD`
- `BUYER_SIDE_STAGING_UNRELATED_EMAIL`
- `BUYER_SIDE_STAGING_UNRELATED_PASSWORD`

## Static Contracts

Phase 5 gates these contracts before live evidence:

- Buyer document requirement scenarios include FICA, finance, bond, cash, hybrid, company, trust, and foreign purchaser branches.
- Buyer portal document centre exposes FICA, finance, sales, property, additional request, upload, and open-document actions.
- Buyer portal uploads preserve document request IDs and canonical requirement metadata.
- Portal document signing verifies the requested path belongs to the portal transaction before creating a signed URL.
- Document access grants model view, upload, review, download, manage, request, requirement, and document inheritance.
- Raw `document_requests` and `documents` inherit transaction-spine RLS.
- Canonical document metadata tables have direct anonymous grants revoked.
- Phase 2 raw document RLS probes remain in the buyer launch evidence chain.

## Acceptance

- [x] Phase 5 harness is implemented.
- [x] Phase 5 package command is exposed.
- [x] Buyer portal document signing is transaction-scoped.
- [x] Phase 5 static document, portal, RLS, access-grant, and anon-hardening contracts are gated.
- [x] Phase 5 reuses Phase 4 as a prerequisite.
- [x] Phase 5 live command is read-only and staging-confirmed.
- [ ] Buyer FICA, finance, upload, review, download, and storage-path fixture IDs are supplied.
- [ ] Buyer upload, professional review, and document download grants are supplied.
- [ ] Live staging document privacy evidence passes with `READY_LIVE` or `READY_LIVE_WITH_WARNINGS`.

## Current Result

2026-07-11 local contract result: `READY_LOCAL_CONTRACT`.

- Static checks: 14 passed, 0 blocked.
- Local prerequisite commands: 1 passed, 0 blocked.
- Command run: `npm run verify:buyer-side-phase5-document-privacy`

2026-07-11 static preflight result: `READY_STATIC_ONLY`.

- Command run: `node scripts/buyer-side-phase5-document-privacy-verification.mjs --static-only`

2026-07-11 strict live result: `BLOCKED` as expected until live buyer document/privacy fixtures are supplied.

- Command run: `node scripts/buyer-side-phase5-document-privacy-verification.mjs --live --confirm-staging --require-live --skip-prerequisites`
- Blocking configuration still required:
  - `BUYER_SIDE_STAGING_TRANSACTION_ID`
  - `BUYER_SIDE_STAGING_DOCUMENT_REQUEST_ID`
  - `BUYER_SIDE_STAGING_BUYER_FICA_DOCUMENT_REQUEST_ID`
  - `BUYER_SIDE_STAGING_BUYER_FINANCE_DOCUMENT_REQUEST_ID`
  - `BUYER_SIDE_STAGING_BUYER_UPLOADED_DOCUMENT_ID`
  - `BUYER_SIDE_STAGING_BUYER_REVIEW_DOCUMENT_ID`
  - `BUYER_SIDE_STAGING_BUYER_DOWNLOAD_DOCUMENT_ID`
  - `BUYER_SIDE_STAGING_BUYER_DOCUMENT_STORAGE_PATH`
  - `BUYER_SIDE_STAGING_BUYER_EMAIL`
  - `BUYER_SIDE_STAGING_BUYER_PASSWORD`
  - `BUYER_SIDE_STAGING_AGENT_EMAIL`
  - `BUYER_SIDE_STAGING_AGENT_PASSWORD`
  - `BUYER_SIDE_STAGING_ATTORNEY_EMAIL`
  - `BUYER_SIDE_STAGING_ATTORNEY_PASSWORD`
  - `BUYER_SIDE_STAGING_BOND_EMAIL`
  - `BUYER_SIDE_STAGING_BOND_PASSWORD`
  - `BUYER_SIDE_STAGING_UNRELATED_EMAIL`
  - `BUYER_SIDE_STAGING_UNRELATED_PASSWORD`

Live staging document/privacy evidence is still required because real document request IDs, uploaded document IDs, review/download evidence, storage paths, and persona credentials are not stored in the repository.

## Phase 5 Decision

Decision: PHASE 5 HARNESS IMPLEMENTED; LIVE DOCUMENT PRIVACY EVIDENCE REQUIRED.
