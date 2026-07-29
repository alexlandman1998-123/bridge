# Phase 0 Current State Baseline

This document records the current buyer bond application contracts before the guided application refactor begins. Phase 0 introduces safety rails only. It does not change the buyer-facing bond application, offers, grant, signing, documents, or bank workflow behaviour.

## Current Buyer Route

The buyer bond application route is:

`/client/:token/bond-application`

The route is declared in `src/App.jsx` and still renders `src/pages/ClientPortal.jsx` through the existing client token route gate and app error boundary.

## Main Components And Files

- `src/App.jsx` defines the client portal route.
- `src/pages/ClientPortal.jsx` owns the current buyer portal bond application experience, including the application, offers and grant tabs.
- `src/lib/api.js` owns the current client portal onboarding draft save path.
- `src/pages/UnitDetail.jsx` consumes the current persisted bond application JSON for transaction review.
- `src/modules/bond/utils/bondApplicationViewModel.js` builds the read-only bond application view model used by originator-facing surfaces.

## Current Answer Persistence Location

Buyer bond application answers are persisted under:

`onboarding_form_data.form_data.bond_application`

The current form data object also contains unrelated buyer onboarding answers. Those keys must be preserved when the bond application draft is saved.

## Current Save Path

The current buyer save path is:

1. `persistBondApplicationDraft()` in `src/pages/ClientPortal.jsx`.
2. `saveClientPortalOnboardingDraft()` in `src/lib/api.js`.
3. `upsertClientPortalOnboardingForm()` in `src/lib/api.js`.

The save path clones the existing portal onboarding form data, assigns the next draft to `formData.bond_application`, refreshes finance readiness fields, and persists through the existing onboarding form upsert path.

## Current Submission Behaviour

The current submit action remains a typed digital-signature style flow. It checks:

- Loan processing consent.
- Credit bureau, fraud and bank data retrieval consent.
- Declaration accepted.
- Digital signature name.
- Digital signature date.
- At least one selected bank.

On successful submit, the current implementation persists the draft with `status: 'Submitted'` and sets `submitted_at` to the current timestamp.

Phase 0 intentionally does not create immutable submission snapshots, declaration versions, or `/sign/:token` signing requests.

## Existing Consumers

`src/pages/UnitDetail.jsx` reads:

`onboardingFormData.formData.bond_application`

It derives primary applicant, co-applicant, selected banks, status, accepted offers and signed offer references from the current legacy JSON.

`src/modules/bond/utils/bondApplicationViewModel.js` continues to accept representative legacy bond application data for read-only review and PDF-style summary surfaces.

## Existing Document Infrastructure

Bond application and transaction documents continue to use the existing transaction document infrastructure:

- `transaction_required_documents`
- `documents`
- `ensureTransactionRequiredDocuments()`

Phase 0 does not create dynamic document rules and does not create duplicate document storage.

## Existing Signing Infrastructure

The stronger signing flow already exists under:

`/sign/:token`

Phase 0 does not connect the buyer bond application submission to that signing flow. The current typed signature fields remain unchanged.

## Bank Workflow Records Kept Separate

The following workflow records remain separate from buyer answer persistence:

- `transaction_bond_applications`
- `transaction_bond_quotes`
- `transaction_bond_offer_decisions`
- `transaction_bond_instructions`

`transaction_bond_applications` remains a bank and originator workflow record, not a buyer answer store.

## Known Current Limitations

- The form is section-based rather than conversational.
- Conditional logic is mostly inline.
- Buyer answers live in a transaction-level JSON object.
- Co-applicant state is not independently owned.
- Surety is not yet a participant model.
- Typed signature fields are used.
- Submission does not yet create an immutable snapshot.
- No formal OOBA export adapter currently exists.

These limitations are documented here and intentionally not fixed in Phase 0.

## Behavioural Invariants Protected By Phase 0 Tests

- `guided_bond_application_v2` defaults to false.
- Invalid or missing flag configuration resolves safely to false.
- Explicit test configuration can resolve the flag to true.
- `/client/:token/bond-application` still resolves to the current Client Portal experience.
- The current route is not switched to any guided V2 UI.
- `buildBondApplicationDraft(portal)` still reads from portal buyer, onboarding form data, transaction, unit, development and existing `bond_application` sources.
- Draft persistence writes to `form_data.bond_application`.
- Unrelated form data remains part of the cloned form data object.
- Buyer draft persistence does not write to `transaction_bond_applications`.
- Current submission validation remains consent, typed signature, signature date and selected-bank based.
- The current read-only view model remains compatible with representative legacy application data.
- Unit Detail still consumes `form_data.bond_application`.
- Offers and grant tabs remain present in the Client Portal bond application area.

## Feature Flag

The dormant feature flag is:

`guided_bond_application_v2`

It is exposed to runtime configuration through:

`VITE_FEATURE_GUIDED_BOND_APPLICATION_V2`

The flag defaults to false. It is surfaced through the existing `FEATURE_FLAGS` export as `guidedBondApplicationV2`, but Phase 0 does not use it to render or route a new buyer experience.

## Buyer-Facing Change Statement

No buyer-facing changes were introduced in Phase 0. The current buyer bond application, offers and grant experiences remain the active experiences.
