# Arch9 Bond Application Canonical Audit

Date: 2026-08-14

## Standard Bond Originator Journey

1. Lead or transaction is referred to the bond originator by an agency, agent, developer, or internal workflow.
2. Buyer starts the applicant-facing bond application in the buyer portal and captures the same underlying application data the consultant will review.
3. Buyer completes applicant, co-applicant, property, loan, affordability, consent, declaration, and document-upload steps.
4. The system normalizes the captured data into the guided bond application domain: one application record, shared application sections, participant-specific sections, document requirements, and submission snapshots.
5. Bond consultant reviews the canonical application workspace, resolves missing fields or documents, and assesses affordability and risk.
6. Consultant submits the application pack to selected banks or an originator intake channel.
7. Banks respond with quotes, declines, or document conditions.
8. Consultant compares quotes with the buyer, captures the selected offer, and moves the application into grant.
9. Grant is issued and accepted, transfer attorney instruction follows, and the application progresses toward registration.
10. Referral incentives or commissions are reconciled once the qualifying grant/registration event is reached.

## Canonical Model

The logical application model should be treated as:

`BondApplication > application, applicants[], property, loan, affordability, documents, declarations, consents, metadata`

In code, the closest implemented canonical domain is the guided normalized application:

- `bond_applications`: application header, version, status, revision, locks, source hash, active submission.
- `bond_application_participants`: primary applicant, co-applicant, and surety actors.
- `bond_application_sections`: shared application sections and participant-specific answers.
- `bond_application_document_requirements`: dynamic document requirements.
- `transaction_bond_application_submissions`: immutable submission snapshots for signing and bank/originator handoff.

The legacy buyer draft still lives in `onboarding_form_data.form_data.bond_application`. That draft is now treated as a compatibility source/projection, not the consultant workspace's preferred model.

## Field Matrix

| Canonical Field Group | Buyer Portal Capture | Consultant Application Tab | DB / Persistence | Bank Submission |
| --- | --- | --- | --- | --- |
| Application metadata | Portal token context, transaction, draft status | Workspace header, reference, lifecycle state | `bond_applications`, `transactions`, legacy draft metadata | Snapshot versions, transaction id, reference |
| Applicant structure | Sole/joint/surety guided flow and legacy `summary.has_co_applicant` | `applicants[]` register with role labels | `bond_application_participants` plus `applicant_structure` shared section | Participant manifest |
| Personal details | Primary/co-applicant/surety personal sections | Per-applicant ID/passport, marital, dependants | Participant `personal_contact`, `marital_details` sections | Participant answers |
| Contact details | Email, phone, residential/contact fields | Per-applicant email/phone | Participant `personal_contact`, `address_residency` sections | Participant answers |
| Employment and income | Employment fields and income sources | Per-applicant employment, employer, gross/total income | Participant `employment_income` section | Participant answers and affordability |
| Banking, liabilities, assets | Bank accounts, debts, assets, liabilities, existing properties | Per-applicant commitments, debt, assets summary | Participant `accounts_assets`, `monthly_commitments`, `liabilities` sections | Participant answers |
| Property and loan | Purchase price, deposit, loan, property summary | Property, purchase price, bond required, LTV | Shared `application_finance`, `shared_property_summary` sections | Shared finance/property snapshot |
| Affordability | Income, expenses, commitments, dependants | Aggregated totals, disposable income, risk factors | Derived from participant sections | Snapshot and bank payload inputs |
| Documents | Dynamic requirements and uploads | Readiness, document centre, action centre | `bond_application_document_requirements`, `transaction_required_documents`, `documents` | Document manifest |
| Consents and declarations | Review/signing step plus legacy declarations | Consent readiness and risk factor | Participant declaration evidence and submission declarations | Signer/declaration manifest |
| Co-applicant / surety | Same participant schema as primary | Same applicant register rows as primary | Participant rows with role-specific sections | Participant snapshots and signer manifest |
| Save and resume | Legacy draft plus guided section saves | Reads normalized bundle or legacy projection | `onboarding_form_data` compatibility plus normalized section versions | Immutable prepared snapshot |

## Audit Findings

- The normalized bond application domain already exists and is more complete than the older buyer draft model.
- The consultant Application tab previously rebuilt a single-applicant view from ad hoc field paths, which meant co-applicant/surety details and participant-scoped finance could drift from the buyer portal.
- The transaction detail API did not attach the normalized bond application bundle, even though the normalized fetch helper existed.
- The active Supabase migration chain for the normalized tables lives in `../supabase/migrations`, while the app folder also has a separate `sql/` folder. The split can make schema audits look incomplete if only `sql/` is searched.
- The legacy `saveClientPortalOnboardingDraft` remains a draft persistence path. Guided participant section saves are the correct normalized path; broad autosave mirroring from every legacy draft save should be handled as a separate migration/backfill concern.

## Refactor Applied

- `fetchTransactionById` now attaches `bondApplication` / `normalizedBondApplication` when a normalized bundle exists.
- `buildBondApplicationViewModel` now prefers the normalized application bundle, falls back to the legacy buyer draft projection, and exposes a canonical `applicants[]` register.
- The consultant Application tab now renders all canonical applicants rather than only the primary applicant.
- Aggregate affordability numbers are now derived across canonical participants while preserving the existing `applicant` and `financials` fields used by the rest of the workspace.

## Remaining Hardening

- Add a controlled forward-sync/backfill job from legacy `onboarding_form_data.form_data.bond_application` into normalized records for older applications.
- Make bank payload generation consume the immutable normalized submission snapshot only.
- Add consultant-side tests for a joint application showing both primary and co-applicant values in the Application tab.
- Decide whether the app-local `sql/` folder should mirror the Supabase migrations or be explicitly documented as legacy/reference SQL.
