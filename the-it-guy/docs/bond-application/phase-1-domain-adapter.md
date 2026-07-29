# Phase 1 Domain Adapter

Phase 1 creates the bond application domain boundary needed before a guided buyer UI exists. The current buyer-facing portal remains unchanged: `/client/:token/bond-application` still renders the legacy Client Portal application, offers and grant experience.

## Purpose

The domain module separates pure bond application logic from `src/pages/ClientPortal.jsx` and introduces a lossless adapter between:

- Current legacy `form_data.bond_application` JSON.
- Clean internal Arch9 bond application state.

The clean state is preparation for Phase 2. It is not persisted directly in Phase 1.

## Module Structure

The Phase 1 module lives under `src/modules/bond/application/`.

- `index.js` exposes the public API.
- `bondApplicationState.js` defines clean state helpers and cloning.
- `bondApplicationSelectors.js` exposes small clean-state selectors.
- `bondApplicationCompletion.js` contains current legacy completion calculations.
- `bondApplicationValidation.js` contains current legacy submit validation.
- `bondApplicationPersistence.js` builds the existing form-data persistence payload.
- `legacy/buildLegacyBondApplicationDraft.js` contains the extracted legacy draft builder.
- `legacy/bondApplicationLegacyAdapter.js` contains the two-way compatibility adapter.

## Public Exports

- `buildLegacyBondApplicationDraft`
- `getBondApplicationApplicantDefault`
- `resolveBondApplicationStatus`
- `normalizeBondOfferDecisionState`
- `buildBondApplicationState`
- `fromLegacyBondApplication`
- `toLegacyBondApplication`
- `calculateLegacyBondApplicationCompletion`
- `validateLegacyBondApplicationSubmission`
- `mergeBondApplicationIntoFormData`
- `buildLegacyBondApplicationPersistencePayload`
- `getPrimaryApplicant`
- `getCoApplicant`
- `getPropertySummary`
- `getFinanceSummary`
- `getSelectedBankIds`
- `getLegacySubmissionInfo`
- `getApplicationStatus`
- `getAdapterDiagnostics`

## Clean State Shape

The internal state uses `schemaVersion: 2` and separates:

- `meta`: legacy source schema, status and submitted timestamp.
- `application`: transaction id, property, finance and selected banks.
- `participants`: primary applicant, optional co-applicant and future surety array.
- `legacySubmission`: current typed signature, legacy consents, status and submitted timestamp.
- `compatibility`: internal-only legacy base, unmapped paths, warnings and diagnostics.

The compatibility object must not be written back into `form_data.bond_application`.

## Legacy Compatibility Strategy

The adapter is deliberately conservative:

1. Clone the legacy application into `compatibility.legacyBase`.
2. Map known stable fields into clean state.
3. Keep ambiguous or unknown fields in the cloned legacy base.
4. On `toLegacyBondApplication()`, clone the legacy base again.
5. Overlay only known clean-state fields.
6. Return legacy JSON without `compatibility`.

This preserves unknown keys, nested metadata, array order, empty values, `false`, `0`, `null`, empty strings and existing ids.

## Mapping Table

| Clean state path | Legacy path | Direction | Transformation | Confidence | Notes |
| --- | --- | --- | --- | --- | --- |
| `meta.status` | `status` | both | direct copy | high | Current legacy statuses retained. |
| `meta.submittedAt` | `submitted_at` | both | direct copy | high | Date string is not reformatted. |
| `application.property.developmentName` | `summary.development_name` | both | direct copy | high | Falls back to portal context during build. |
| `application.property.unitReference` | `summary.unit_reference` | both | direct copy | high | Existing saved summary wins. |
| `application.property.propertyReference` | `summary.property_reference` | both | direct copy | high | Existing saved summary wins. |
| `application.finance.purchasePrice` | `summary.purchase_price` | both | direct copy | high | Numeric strings remain strings. |
| `application.finance.depositAmount` | `summary.deposit_contribution` | both | direct copy | medium | Existing legacy variants are preserved through base. |
| `application.finance.requestedBondAmount` | `loan_details.amount_to_be_registered` | both | direct copy | high | No recalculation. |
| `application.finance.financeType` | `summary.finance_type` | both | direct copy | high | Builder still uses existing finance normalizer. |
| `application.selectedBankIds` | `selected_banks` | both | direct array copy | high | `selectedBanks` is still read by the builder as fallback. |
| `participants.primaryApplicant.personal` | `applicants[key=primary]` | both | object copy/upsert | high | Unknown applicant fields preserved in base. |
| `participants.coApplicant.personal` | `applicants[key=co_applicant]` | both | object copy/upsert | medium | Co-applicant ownership is still legacy. |
| `participants.primaryApplicant.address` | `contact_address` | both | object copy | high | Current single contact/address section remains. |
| `participants.*.employment` | `employment.primary/co_applicant` | both | object copy | high | No employment branch logic added. |
| `participants.*.expenses` | `income_deductions_expenses.primary/co_applicant` | both | object copy | high | Includes current income and expense fields. |
| `participants.primaryApplicant.bankAccounts[primary]` | `banking_liabilities.primary_*` | both | keyed field mapping | medium | Only current primary bank account is modelled. |
| `participants.primaryApplicant.debts` | `banking_liabilities.home_loan_1/other_finance_1/retail_*` | legacy to clean | keyed object list | medium | Reverse mapping is limited to current account overlay. |
| `participants.primaryApplicant.assets` | `assets_liabilities.*` | legacy to clean | keyed object list | medium | Totals remain in legacy passthrough. |
| `participants.primaryApplicant.credit` | `credit_history` | both | object copy | high | Surety-like answers remain credit-history answers. |
| `legacySubmission.consents` | `declarations_consents`, `consent` | both | object copy | high | Typed signature fields remain legacy. |

## Source Precedence

The extracted legacy builder preserves the current precedence:

1. Existing saved `form_data.bond_application` values.
2. Buyer onboarding form data.
3. Portal buyer information.
4. Transaction information.
5. Unit and development information.
6. Current defaults.

Specific examples protected by tests:

- Saved applicant values override onboarding values.
- Saved property summary overrides fresh transaction or unit values.
- `selected_banks` overrides legacy camelCase `selectedBanks`.
- Saved co-applicant array data overrides spouse prefill data.

## Passthrough Handling

Unknown or unsupported legacy fields remain in `compatibility.legacyBase` and survive a clean-state round trip. Diagnostics mark them as `passthrough_preserved`, which is informational rather than an error.

## Adapter Diagnostics

Diagnostics contain issue type, field path and a non-sensitive message. They do not log applicant values.

Current diagnostic categories include:

- `passthrough_preserved`
- `unsupported_legacy_type`
- `ambiguous_surety_mapping`
- `unsupported_participant_mapping`

## Confidently Mapped Fields

The adapter confidently maps status, submitted timestamp, selected banks, primary applicant, co-applicant object, property summary, finance summary, employment, income/expenses, contact address, credit history, consents and current typed signature fields.

## Legacy-Only Or Ambiguous Fields

The following remain partly or fully legacy-passthrough in Phase 1:

- Extra applicants beyond primary and co-applicant.
- Surety fields embedded in `credit_history`.
- Older alias fields such as `selectedBanks` and camelCase offer fields.
- Offer/grant decision metadata that remains part of the current portal compatibility JSON.
- Any unknown nested metadata from historical applications.

## Consent And Typed Signature Handling

Phase 1 preserves current typed signature behaviour:

- `declarations_consents.digital_signature_name`
- `declarations_consents.digital_signature_date`
- `declarations_consents.*` consent checkboxes
- legacy `consent.*` compatibility booleans

No immutable snapshot, declaration versioning, or `/sign/:token` integration was added.

## Persistence Boundary

Buyer answers still save under:

`onboarding_form_data.form_data.bond_application`

`buildLegacyBondApplicationPersistencePayload()` preserves unrelated `form_data` keys and builds the same draft/status/submitted payload expected by `saveClientPortalOnboardingDraft()`.

The existing API side-effect path remains:

`persistBondApplicationDraft()` -> `saveClientPortalOnboardingDraft()` -> `upsertClientPortalOnboardingForm()`

## Bank Workflow Separation

The domain module does not write to or model:

- `transaction_bond_applications`
- `transaction_bond_quotes`
- `transaction_bond_offer_decisions`
- `transaction_bond_instructions`

Selected banks remain buyer answer data. Actual bank workflow status remains outside the application state.

## Known Limitations

- The current form remains section-based.
- Conditional logic remains legacy behaviour.
- Buyer answers are still transaction-level JSON.
- Co-applicants do not yet own separate drafts.
- Sureties are not yet full participants.
- Typed signatures are still used.
- No immutable submission snapshot exists.
- No formal OOBA export adapter exists.
- No guided progress persistence exists.

## Phase 2 Consumption Guidance

Phase 2 should build the guided buyer shell against `buildBondApplicationState()` and clean-state selectors, then persist through `toLegacyBondApplication()` and the existing form-data save path. It should not read OOBA-shaped legacy paths directly in new UI components.

Phase 3 extends this boundary with `bond_application._guided_repeatables` for guided repeatable records that do not have a safe one-to-one fixed legacy slot. These records are still stored inside the existing `form_data.bond_application` JSON and continue to round-trip through the adapter; no new answer table or bank workflow mapping exists.

## Phase 2 Guided Metadata

Phase 2 stores additive guided-flow metadata under `_meta.guided_bond_application_v2` inside the existing legacy `bond_application` JSON. The adapter treats `_meta` as compatibility metadata: it is preserved during legacy-to-clean-to-legacy round trips and is not interpreted as a buyer answer, OOBA field or bank workflow record.

The metadata records the Phase 2 flow version, current step key, current screen key, completed screen keys, started/saved timestamps and optional legacy handoff reason/timestamp. Existing readers continue to consume the legacy application fields they already understand.

## No Behaviour Change Statement

Phase 1 introduced no buyer-facing UI changes, no database changes, no dynamic document changes, and no submission semantics changes. The feature flag remains dormant and false by default.
