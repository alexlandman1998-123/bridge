# Phase 7 - Sureties, Revisions and Change Requests

## Purpose

Phase 7 extends the normalized guided bond application with surety participants and a formal correction workflow. It does not add OOBA exports, bank-specific mapping, direct bank submission, finance-stage progression, or new bank workflow rows.

## Supported Roles

- `primary_applicant`
- `co_applicant`
- `surety`

The schema supports multiple surety participants through `role`, `ordinal`, and stable `participant_key`. The first rollout is centrally limited by `maximum_active_sureties`, currently defaulted to `1`.

## Feature Flags

- `guided_bond_application_v2`
- `guided_bond_application_participants_v1`
- `guided_bond_application_sureties_v1`
- `guided_bond_application_change_requests_v1`

The Phase 7 flags default to disabled. Sureties require participant mode. Change requests require normalized application mode.

## Domain Overview

```text
transactions
  -> bond_applications
       -> bond_application_participants
       -> bond_application_sections
       -> bond_application_document_requirements
       -> bond_application_change_requests
            -> bond_application_change_request_items
       -> transaction_bond_application_submissions
            -> transaction_bond_application_submission_documents
```

`bond_applications` remains the normalized buyer application source of truth. `onboarding_form_data.form_data.bond_application` remains a server-authoritative compatibility projection. Bank workflow tables remain separate.

## Surety Model

Sureties are participants with `role = 'surety'`. Surety records preserve invitation state, participant status, stable participant keys, participant-owned sections, document requirements, declaration evidence, and signing evidence. Withdrawn, declined, removed, or superseded sureties are preserved for audit and excluded from active readiness.

## Surety Invitation

```text
Create surety participant
  -> create hashed participant invite
  -> send through existing notification infrastructure
  -> surety opens secure token
  -> server resolves exactly one participant
  -> surety accepts, declines, or withdraws
```

Raw invite tokens are not stored in participant records or application JSON. Resend/revocation continues to use the participant invitation lifecycle introduced in Phase 6.

## Surety Access And Privacy

Sureties may load safe shared application context, their own sections, their own documents, their own declarations, and their own signing status. They may not receive applicant private draft financial answers, applicant documents, applicant request details, or any other participant's access/signing token.

Applicants may see the surety name, invitation status, high-level completion status, and signing status. They may not see surety private financial answers, documents, credit explanations, or optional consent.

Privacy is enforced by participant-scoped loaders, API filtering helpers, and RLS policies. React hiding is not the boundary.

## Surety Guided Flow

The flow resolver supports `participantRole: 'surety'` and participant paths such as `participants.sureties.0`. Purchaser-only screens such as applicant management and shared application setup are hidden for sureties. Common participant questions can be reused, while surety-specific sections are stored in participant-owned section rows.

Potential surety sections include:

- `personal_contact`
- `address_residency`
- `relationship_context`
- `employment_income`
- `financial_position`
- `accounts_assets`
- `liabilities`
- `credit_history`
- `surety_terms_confirmation`
- `review_declarations_draft`

## Surety Documents

Document resolution is participant-context aware for `surety`. Requirement keys include the participant key, for example `surety:1:bond_application_surety_identity`. Existing `transaction_required_documents` and `documents` remain the storage and review systems.

The implementation does not invent a production surety document matrix. Approved surety rule contracts can be supplied to the existing resolver. Applicant documents cannot satisfy surety requirements unless a rule is explicitly application-scoped and approved.

## Surety Declarations

The declaration contract recognizes the `surety` role, but surety signing readiness is blocked unless approved surety declaration wording is present. Current code exposes `approved_surety_declaration_unavailable` so production rollout cannot proceed on invented legal text.

## Approved Signing Document Requirement

Phase 7 supports a signing package manifest and signer-to-document assignments. The surety signer is assigned `surety_undertaking`; applicants remain assigned `main_application`.

Production surety signing remains blocked until approved surety undertaking templates and visibility policy are available. No legal document layout or surety wording was invented.

## Signing Package

```text
Immutable submission snapshot
  -> package document: main_application
  -> package document: surety_undertaking
  -> signer assignment: applicants -> main_application
  -> signer assignment: surety -> surety_undertaking
  -> existing signing infrastructure
```

`transaction_bond_application_submission_documents` records package document roles, generated/signed document references, signer participant IDs, signing references, and status. It does not replace the signing system.

## Change Request Domain

`bond_application_change_requests` stores one formal request with buyer-visible copy separated from internal notes.

`bond_application_change_request_items` stores stable targets:

- shared application
- primary applicant
- co-applicant
- surety
- application documents
- participant documents

Targets may be sections, fields, repeatable records, document requirements, participant structure, declarations, or general items.

## Request Lifecycle

```text
draft -> sent -> in_progress -> awaiting_internal_review -> resolved
                       \-> needs_more_information
draft/sent -> withdrawn
sent/in_progress -> superseded or cancelled
```

Clients do not set arbitrary lifecycle states. Domain helpers classify effects, filter privacy, submit corrections, and record internal review decisions.

## Request Effect Classification

`SUPPLEMENTAL_ONLY` is used for additional/replacement documents that do not alter signable application content.

`NEW_SUBMISSION_REQUIRED` is used for application answers, participant structure, declarations, selected signable data, surety terms, or signer set changes.

The effect is resolved centrally. An override must be explicit and auditable.

## Supplemental Document Requests

```text
Originator requests document
  -> participant sees document request
  -> participant uploads through existing documents flow
  -> document review accepts/rejects
  -> request item resolves
  -> signed application snapshot remains unchanged
```

No new submission version is created for supplemental-only requests.

## Controlled Revisions

Material corrections open a controlled revision from the active submission:

```text
active submitted version remains active
  -> change request opens revision
  -> edit scope is calculated server-side
  -> affected participants correct allowed sections only
  -> originator reviews corrections
  -> all active required participants re-review
  -> new immutable snapshot is prepared
  -> all required signers sign again
  -> new submission finalizes
  -> previous submission is marked superseded
```

The previous signed snapshot and signed documents are never mutated.

## Edit Scope

Revision edit scope is server-authoritative and includes section, question, field, repeatable-record, and document targets. Section saves reject out-of-scope writes during active revisions.

Dependent rule changes may expand the scope. The browser is not authoritative for editability.

## Correction Submission And Review

Participants can submit corrections for their assigned items. Submission moves items to `awaiting_review`. Originators can accept, request more information, or withdraw an item. Accepting an item does not edit participant answers.

All blocking items must be accepted or withdrawn before a revision-required request can move to re-review/signing.

## Re-Review And Re-Signing

Any material correction invalidates readiness and prior declaration acceptance. All active required participants must review the new context and sign the new version. No signature carries forward across submission versions.

## Submission Supersession

```text
submission v1 submitted and active
  -> revision opens
  -> v1 remains active
  -> v2 prepared and signed
  -> v2 finalizes
  -> v1 marked superseded_by_submission_id = v2
  -> v2 records supersedes_submission_id = v1
```

Superseded submissions keep snapshots, declarations, document manifests, signer manifests, and signed documents.

## Revision Cancellation

An authorized internal cancellation preserves all audit data, cancels outstanding signing assignments where supported, restores the base submitted state, re-locks the application, and keeps the previous submission active.

## Unit Detail And Originator Compatibility

Internal read-only views can use normalized data and submitted snapshots as authoritative. They may display active participants, sureties, change requests, revision status, current submission, superseded submissions, package documents, and signature status. Existing permissions remain the access boundary.

## Legacy Projection

The compatibility projection may include active surety summary and safe revision metadata where supported. It excludes invite tokens, signing tokens, internal notes, private document links, removed participant private data, and superseded draft answers as active data.

## RLS

RLS policies were added for change requests, request items, and submission package documents. Participant request item access is scoped to the participant or safe shared request. Service role remains the trusted backend writer for formal request/revision lifecycle operations.

## Security And Privacy

- No raw invite tokens in application JSON.
- No signing tokens in snapshots.
- No public document URLs.
- No internal notes in participant-filtered request payloads.
- No cross-participant draft answer exposure.
- No signature reuse between versions.
- No mutation of historic signed snapshots.
- No bank workflow side effects.

## Known Limitations

- Controlled rollout currently limits active sureties to one.
- Multiple surety domain rows are supported, but multiple-surety UI rollout remains disabled.
- Production surety signing is blocked until approved surety declarations, surety undertaking templates, and visibility policy are available.
- Historic legacy applications are not automatically normalized.
- Legacy submitted applications do not automatically gain revision support.
- Supplemental document requests do not modify signed snapshots.
- Revised applications are not automatically resent to banks.

## Deferred To Phase 8

- Formal internal-to-OOBA field mapping.
- OOBA payload validation.
- OOBA export generation.
- Bank-specific mapping adapters.
- Bank-specific validation.
- Bank-specific document manifests.
- XML, CSV, or API payload generation.
- Submission payload versioning.
- Originator export review.
- Controlled delivery to external systems.
- Delivery audit.
- External response mapping.
- Automatic or assisted bank submission policies.

## Explicit Boundary

Phase 7 introduced no OOBA mapping, no bank payload generation, no direct bank API integration, no automatic bank submission, no bank application row creation, and no finance-stage progression.
