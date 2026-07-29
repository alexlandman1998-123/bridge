# Phase 6: Participants and Co-Applicants

## Purpose

Phase 6 moves new guided buyer bond applications from one transaction-level JSON draft into a normalized application domain with participant ownership. It supports one primary applicant and one co-applicant. Sureties, post-submission revisions, OOBA exports and bank-specific payload mapping remain out of scope.

## Supported Roles

| Role | Internal value | Phase 6 support |
| --- | --- | --- |
| Primary applicant | `primary_applicant` | Supported |
| Co-applicant | `co_applicant` | Supported, maximum one |
| Surety | `surety` | Not supported in Phase 6 |

The primary applicant must explicitly select a joint application. Spouse details alone do not create a co-applicant.

## Normalized Domain

```
transactions
  -> bond_applications
      -> bond_application_participants
      -> bond_application_sections
      -> bond_application_document_requirements
      -> bond_application_participant_invites
  -> transaction_bond_application_submissions
```

`bond_applications` stores the buyer application lifecycle, storage mode, revision and compatibility projection status. It does not replace `transaction_bond_applications` and does not store bank workflow state.

`bond_application_participants` stores one active primary applicant and, in Phase 6, at most one active co-applicant. Participant records store status and access state, not full financial answers.

`bond_application_sections` stores application-level and participant-level answer sections. Application sections include finance, applicant structure, selected banks and property summary. Participant sections include personal/contact, address/residency, employment/income, commitments, accounts/assets, credit history and declaration draft state.

`bond_application_document_requirements` links participant-aware requirement ownership to existing `transaction_required_documents` and `documents`. It does not introduce new document storage.

`bond_application_participant_invites` is used where a participant-scoped client portal token is required. Raw tokens are not stored.

## Status Lifecycles

Application statuses:

```
draft -> awaiting_participants -> ready_for_review -> preparing_submission
      -> awaiting_signatures -> submitted
```

Terminal or exceptional state:

```
cancelled
```

Participant statuses:

```
pending_invite -> invited -> accepted -> in_progress -> ready_for_submission
               -> awaiting_signature -> signed -> completed
```

Exceptional participant states:

```
declined
removed
```

## Feature Flags

Phase 6 uses the existing `guided_bond_application_v2` flag and adds:

```
guided_bond_application_participants_v1
VITE_FEATURE_GUIDED_BOND_APPLICATION_PARTICIPANTS_V1
```

Both default to disabled. There is no public query-string override.

## Lazy Normalization

New normalized applications are created through `ensureClientPortalNormalizedBondApplication()`. The operation:

1. Loads the current authorized portal transaction.
2. Builds the clean application state through the existing Phase 1 adapter.
3. Creates a normalized `bond_applications` record.
4. Creates the primary participant and the co-applicant only when joint mode is explicitly requested.
5. Splits shared and participant sections.
6. Projects the normalized state back into `onboarding_form_data.form_data.bond_application`.

Historic submitted applications, Phase 5 awaiting-signature/submitted applications and legacy joint applications with ambiguous ownership are not bulk migrated.

## Source Of Truth

For normalized applications:

```
bond_applications + sections + participants
  -> trusted compatibility projection
  -> onboarding_form_data.form_data.bond_application
```

The compatibility JSON remains for Unit Detail, originator and legacy readers. Participant browsers do not build or submit the combined legacy projection.

## Participant Access

Primary applicant access resolves through the existing client portal token. Co-applicant access resolves through a participant invite token hash. The token resolves server-side to exactly one application participant.

Tokens:

- are generated with secure random values;
- are hashed before storage;
- have expiry and revocation fields;
- are not written to application JSON, snapshots or logs;
- are returned only once to the trusted invitation flow.

## Privacy Matrix

Primary applicant can read shared application data, their own sections and safe co-applicant status. They cannot read co-applicant draft income, debts, bank accounts, credit explanations, private documents or declarations.

Co-applicant can read the shared purchase summary, their own sections and safe primary status. They cannot edit shared finance fields, participant structure, primary private answers, primary private documents or primary signing access.

The boundary is enforced by participant-scoped loaders and RLS. React hiding is not the security boundary.

## Flow Contract

The Phase 3 flow resolver now accepts participant context. It rewrites primary-participant paths to co-applicant paths where the viewer is the co-applicant, removes the Applicants management step for the co-applicant, and treats shared finance screens as read-only outside the primary applicant context.

Sole-applicant Phase 5 behavior remains compatible.

## Invitations

Primary applicants can invite one co-applicant from the guided Applicants step when participant mode is enabled. Invite creation is idempotent by caller key, supersedes prior active invites, stores only the token hash, and records delivery metadata without private application answers.

Acceptance validates token hash, expiry and status, then marks the invite accepted and the participant in progress. Decline, revoke and resend are represented in the schema and API boundary; full notification delivery remains tied to the existing notification infrastructure.

## Section Saving

Normalized section saves use `saveClientPortalBondApplicationSection()` and the pure `saveNormalizedBondApplicationSection()` domain helper.

Each save:

- authorizes participant scope;
- checks `expectedSectionVersion`;
- writes only the target section;
- increments material application revision;
- invalidates stale readiness;
- updates the compatibility projection through a trusted boundary.

Last-write-wins across devices is not used.

## Review Context

`calculateBondApplicationReviewContextHash()` hashes material application state:

- schema and revision;
- shared sections;
- active participant section material;
- active document requirement material;
- declaration contract version.

Navigation metadata, tokens, signed URLs, analytics and focus state are excluded.

Participants become ready only against the current review context hash. Material changes invalidate stale ready states.

## Documents

Document rules now support participant context. Participant-scoped requirement keys include the participant key, for example:

```
primary_applicant:1:identity_document
co_applicant:1:identity_document
```

Existing `transaction_required_documents` and `documents` remain the document infrastructure. Shared requirements remain application-scoped. Participant-specific identity, income and bank-statement requirements cannot be satisfied by the other participant’s document.

## Declarations

Phase 5 declarations now support both `primary_applicant` and `co_applicant`. Each participant accepts their own required and optional declarations. Declaration evidence records participant role, optional participant identifiers, version, text and acceptance state.

Primary declaration acceptance does not satisfy co-applicant acceptance.

## Joint Submission

Joint submission preparation requires:

- one active primary applicant;
- one active co-applicant;
- both ready against the same review context hash;
- selected banks preserved;
- no submitted active application;
- no outstanding active submission conflict.

The joint snapshot contains shared data, both participant answer sets, participant document manifests, participant declaration evidence, selected banks, both signer manifests, application revision and review context hash.

The snapshot excludes invite tokens, portal tokens, signing tokens, signed URLs, storage paths, removed participant data, navigation state and analytics.

## Multi-Signer Signing

The existing document packet signing infrastructure is reused. Phase 6 creates signer rows for:

- `purchaser_1` -> primary applicant;
- `purchaser_2` -> co-applicant.

Each participant receives or resumes only their own signer token. Partial signature state keeps the application locked and does not finalize until all required signer rows are signed.

## Finalization

Finalization verifies the signing packet and required signer completion through existing signing records. After all signers complete, it:

1. records the signed document reference;
2. marks participants signed/completed;
3. marks the normalized application submitted;
4. marks the submission submitted;
5. updates the legacy compatibility projection;
6. keeps bank workflow untouched.

Duplicate callbacks remain idempotent.

## Pre-Sign Changes, Removal And Withdrawal

Before signing, an unsigned prepared version may be cancelled or superseded without mutating the snapshot. After partial signing, the signed evidence is preserved and any changed application must prepare a new version requiring both signatures again.

Co-applicant removal or withdrawal before submission preserves audit data, revokes access where applicable and blocks joint readiness. Removal after final submission is not implemented.

## Unit Detail And Originator Compatibility

Existing readers continue to receive compatibility JSON under `onboarding_form_data.form_data.bond_application`. Internal read-only views can use the submitted snapshot when present and fall back to the compatibility projection otherwise.

No offer, grant, bank application, finance-stage or originator assignment behavior is changed.

## RLS And Security

The migration enables RLS on the normalized tables and uses existing transaction portal access plus participant-token access helpers. Immutable submission fields remain protected by the Phase 5 guard, extended with normalized application references.

No raw token storage, public document URLs, localStorage financial data, participant impersonation or client-side combined projection is introduced.

## Known Limitations

- Only one co-applicant is supported.
- Sureties are not supported.
- Joint signable-document visibility depends on the existing approved joint document format.
- Full resend/rate-limit notification policy remains tied to existing delivery infrastructure.
- No originator Request changes workflow exists.
- Submitted applications cannot be formally reopened.
- No post-submission revision workflow exists.
- No formal OOBA export exists.
- No bank-specific mapping exists.
- Historic legacy joint applications are not automatically normalized.
- Offer and grant decision rights were not redesigned.

## Deferred To Phase 7

- Surety participants.
- Surety invitations.
- Surety documents.
- Surety declarations.
- Surety signatures.
- Originator Request changes.
- Participant-specific correction requests.
- Section-specific correction requests.
- Controlled reopening.
- Post-submission revisions.
- New signed submission versions after correction.
- Superseded submitted versions.
- Revision history.
- Participant changes after submission.

## Explicit Non-Changes

Phase 6 did not introduce surety behavior, post-submission revision workflows, OOBA mapping, bank-specific payload mapping, automatic bank submission, bank application rows, finance-stage progression, offer redesign or grant redesign.
