# Phase 3 Conditional Sole Applicant Flow

## Purpose

Phase 3 extends the guided buyer bond application from the Phase 2 vertical slice into a declarative, conditional data-collection journey for supported sole applicants.

It covers guided collection for:

- Your application.
- Applicants.
- About you.
- Employment and income.
- Monthly commitments.
- Accounts and assets.

The existing application remains responsible for Documents, declarations, typed signature and final submission.

No database, document, signing, participant-table, originator or bank workflow changes were introduced.

## Supported Applicants

Guided Phase 3 supports sole applicants whose answers can be represented through the Phase 1 clean state and converted back to the existing `form_data.bond_application` JSON.

Supported main income types:

- Permanent employee.
- Contract employee.
- Self-employed.
- Commission-based.
- Retired.
- Other recurring income.

Unsupported participant structures still hand off to the existing full application:

- Joint applications.
- Co-applicant applications.
- Surety applications.
- Submitted or locked applications.
- Applications with completed guided handoff metadata.
- Applications whose participant ownership cannot be mapped safely.

## Flow Contract

The declarative flow lives under `src/modules/bond/application/flow/`.

Public modules:

- `bondApplicationFlowContract.js`
- `bondApplicationRuleEvaluator.js`
- `resolveBondApplicationFlow.js`
- `bondApplicationScreenValidation.js`
- `bondApplicationDerivedValues.js`
- `bondApplicationBranchChanges.js`

The contract defines:

- Steps with stable `key`, `label` and `order`.
- Screens with stable `key`, `stepKey`, `title` and `questionKeys`.
- Questions with stable `key`, clean-state `path`, `type`, labels, options, `visibleWhen`, `requiredWhen` and validation hints.
- Repeatable groups with stable group keys, record paths and item field definitions.

The guided renderer consumes the resolved contract. It does not write arbitrary legacy JSON paths directly.

## Rule Language

Rules are deterministic JSON-like objects. They do not execute arbitrary code and do not use `eval`.

Supported operators:

- `equals`
- `notEquals`
- `in`
- `notIn`
- `exists`
- `notExists`
- `truthy`
- `falsy`
- `greaterThan`
- `greaterThanOrEqual`
- `lessThan`
- `lessThanOrEqual`
- `collectionNotEmpty`
- `collectionEmpty`
- `collectionCountAtLeast`
- `all`
- `any`
- `not`

Missing paths resolve safely. `false` and `0` are preserved as real values, not treated as missing. Empty strings are not considered present for required-field checks.

## Flow Resolution

`resolveBondApplicationFlow()` returns:

- Visible steps.
- Visible screens.
- Visible questions.
- Required questions.
- Current screen.
- Previous and next applicable screen.
- Step statuses.
- Overall guided progress.
- Diagnostics placeholder.

Hidden screens are skipped. Edit-only screens, such as About You edit, are visible only when explicitly entered. Persisted stale screen keys fall back safely.

## Hidden Answer Policy

Hidden questions:

- Are not validated.
- Do not count toward progress.
- Do not block Continue.
- Are not shown as active guided answers.
- Are not deleted automatically.

Branch-specific stale data is handled by the employment branch-change policy.

## Branch-Change Policy

When the main income type changes and the previous branch contains known branch-specific answers, the UI asks for confirmation.

On confirmation:

- Only known branch-specific paths are cleared.
- Unrelated personal, property, finance and financial records are preserved.
- Unknown legacy keys remain preserved through the compatibility adapter.
- The new answer is saved through the existing onboarding form save path.

The current implementation covers employment-branch changes. Wider branch-clearing rules can be expanded as the contract grows.

## Clean State Extensions

Phase 3 uses the Phase 1 clean state and extends usage around:

- `participants.primaryApplicant.incomeSources`
- `participants.primaryApplicant.monthlyCommitments`
- `participants.primaryApplicant.bankAccounts`
- `participants.primaryApplicant.debts`
- `participants.primaryApplicant.assets`
- `participants.primaryApplicant.liabilities`
- `participants.primaryApplicant.existingProperties`
- `participants.primaryApplicant.credit`

No normalized participant or application tables were added.

## Legacy Mapping Extensions

Buyer answers still persist under:

`onboarding_form_data.form_data.bond_application`

Fixed legacy fields continue to map through the Phase 1 adapter.

Additional guided repeatable records are preserved under:

`bond_application._guided_repeatables`

Current keys:

- `income_sources`
- `monthly_commitments`
- `bank_accounts`
- `debts`
- `existing_properties`
- `assets`
- `liabilities`

This remains inside the existing legacy-compatible bond application JSON. It is not a new table, not a bank workflow record and not an external OOBA adapter.

## Field Coverage

| Guided question key | Clean state path | Legacy path | Visible condition | Required condition | Notes |
| --- | --- | --- | --- | --- | --- |
| `purchase_price` | `application.finance.purchasePrice` | `summary.purchase_price` | Always | Yes | Property IDs remain transaction-owned. |
| `deposit_amount` | `application.finance.depositAmount` | `summary.deposit_contribution` | Always | No | No silent recalculation. |
| `requested_bond_amount` | `application.finance.requestedBondAmount` | `loan_details.amount_to_be_registered` | Always | Yes | Existing value preserved. |
| `applicant_structure` | `application.applicantStructure` | `summary.has_co_applicant`, `summary.has_surety` | Always | Yes | Joint and surety hand off. |
| `first_name` | `participants.primaryApplicant.personal.first_name` | `applicants[primary].first_name` | Always | Yes | Confirmation-first UI. |
| `surname` | `participants.primaryApplicant.personal.surname` | `applicants[primary].surname` | Always | Yes | Confirmation-first UI. |
| `email` | `participants.primaryApplicant.contact.email` | `contact_address.email_address` | Always | Yes | Also mirrors applicant email. |
| `phone` | `participants.primaryApplicant.contact.phone` | `contact_address.cellphone_number` | Always | Yes | Also mirrors applicant phone. |
| `employment_type` | `participants.primaryApplicant.employment.occupation_status` | `employment.primary.occupation_status` | Always | Yes | Drives employment branches. |
| `employer_name` | `participants.primaryApplicant.employment.employer_name` | `employment.primary.employer_name` | Permanent, contract, commission | Yes | Also used as business name for self-employed. |
| `occupation` | `participants.primaryApplicant.employment.nature_of_occupation` | `employment.primary.nature_of_occupation` | Permanent, contract, commission | Yes | Plain-language occupation label. |
| `gross_salary` | `participants.primaryApplicant.expenses.gross_salary` | `income_deductions_expenses.primary.gross_salary` | Permanent, contract, commission | Yes | Currency preserved as entered. |
| `contract_start_date` | `participants.primaryApplicant.employment.contract_start_date` | `employment.primary.contract_start_date` | Contract | Yes | No derived duration. |
| `contract_end_date` | `participants.primaryApplicant.employment.contract_end_date` | `employment.primary.contract_end_date` | Contract | Yes | Must not precede start date. |
| `business_name` | `participants.primaryApplicant.employment.employer_name` | `employment.primary.employer_name` | Self-employed | Yes | Reuses existing legacy field. |
| `business_income` | `participants.primaryApplicant.expenses.gross_salary` | `income_deductions_expenses.primary.gross_salary` | Self-employed | Yes | Average monthly income. |
| `retirement_income_sources` | `participants.primaryApplicant.incomeSources` | `_guided_repeatables.income_sources` | Retired | Yes | Repeatable records. |
| `other_income_sources` | `participants.primaryApplicant.incomeSources` | `_guided_repeatables.income_sources` | Other | Yes | Controlled repeatable structure. |
| `additional_income_sources` | `participants.primaryApplicant.incomeSources` | `_guided_repeatables.income_sources` | Additional income Yes | Yes | Does not duplicate main income. |
| `maintenance_paid` | `participants.primaryApplicant.expenses.maintenance_paid` | `income_deductions_expenses.primary.maintenance_paid` | Always | Yes | Gate question. |
| `maintenance_amount` | `participants.primaryApplicant.expenses.maintenance_amount` | `income_deductions_expenses.primary.maintenance_amount` | Maintenance Yes | Yes | Hidden when No. |
| `rent_paid` | `participants.primaryApplicant.expenses.pays_rent` | `income_deductions_expenses.primary.pays_rent` | Always | Yes | Gate question. |
| `rent_amount` | `participants.primaryApplicant.expenses.rental_expense` | `income_deductions_expenses.primary.rental_expense` | Rent Yes | Yes | Hidden when No. |
| `groceries` | `participants.primaryApplicant.expenses.groceries` | `income_deductions_expenses.primary.groceries` | Always | Yes | Existing expense field. |
| `bank_accounts` | `participants.primaryApplicant.bankAccounts` | `banking_liabilities` and `_guided_repeatables.bank_accounts` | Always | Yes | First legacy account remains mapped. |
| `has_debts` | `participants.primaryApplicant.credit.has_debts` | `credit_history.has_debts` | Always | Yes | Explicit No preserved. |
| `debts` | `participants.primaryApplicant.debts` | `banking_liabilities` and `_guided_repeatables.debts` | Debt Yes | Yes | Repeatable records. |
| `owns_property` | `participants.primaryApplicant.credit.owns_property` | `credit_history.owns_property` | Always | Yes | Does not create listing or transaction records. |
| `existing_properties` | `participants.primaryApplicant.existingProperties` | `_guided_repeatables.existing_properties` | Owns property Yes | Yes | Bond application answers only. |
| `assets` | `participants.primaryApplicant.assets` | `assets_liabilities` and `_guided_repeatables.assets` | Always | No | Summary only, not verified valuation. |
| `liabilities` | `participants.primaryApplicant.liabilities` | `assets_liabilities` and `_guided_repeatables.liabilities` | Always | No | Separate from debts where represented. |
| `under_debt_review` | `participants.primaryApplicant.credit.under_debt_review` | `credit_history.under_debt_review` | Always | Yes | Conditional follow-up. |
| `has_judgment` | `participants.primaryApplicant.credit.has_judgment` | `credit_history.has_judgment` | Always | Yes | Conditional follow-up. |
| `has_arrears` | `participants.primaryApplicant.credit.has_arrears` | `credit_history.has_arrears` | Always | Yes | Conditional follow-up. |
| `declared_insolvent` | `participants.primaryApplicant.credit.declared_insolvent` | `credit_history.declared_insolvent` | Always | Yes | Existing submission semantics unchanged. |

Ambiguous or legacy-only fields remain preserved through adapter passthrough.

## Employment Branches

Permanent, contract, self-employed, commission-based, retired and other income paths are resolved from `employment_type`.

The renderer displays only screens whose rules match the clean state. Unsupported participant structures still transition to the existing full application.

## Repeatable Identity

New guided records receive stable client IDs with:

- `id`
- `guidedItemId`
- `source: "guided"`

Existing legacy records keep their `legacyKey` where applicable.

Item IDs are not exposed to buyers. They are preserved through save and resume.

## Derived Calculations

Named pure helpers calculate:

- Additional income total.
- Monthly commitment total.
- Asset total.
- Liability total.
- Requested bond amount where safe.

These are summaries of entered information only. They do not calculate affordability, approval likelihood, bank outcomes or guaranteed bond amounts.

## Validation And Progress

Validation is contract-driven and screen-scoped.

It supports:

- Required fields.
- Email format.
- Numeric min and max.
- Date validity.
- Contract date ordering.
- Required repeatable item counts.
- Conditional follow-up requirements.

Progress uses:

`completed required visible questions / total required visible questions`

The percentage is capped to the first six guided stages, so Step 6 completion does not show the full application as 100%. Documents and Review and Sign remain outstanding.

## Metadata

The guided metadata remains under:

`bond_application._meta.guided_bond_application_v2`

Current flow version:

`phase-3-v1`

Metadata stores screen keys, completed screen keys, save timestamps and handoff reason. It does not store personal, financial or portal-token data.

Completed handoff applications remain in the existing application and are not automatically migrated back into guided mode.

## Auto-Save And Resume

Phase 3 reuses the Phase 2 save controller:

- Debounced save after field changes.
- Immediate save on Continue.
- Immediate save on Save and exit.
- Immediate save before unsupported participant handoff.
- Immediate save before Documents handoff.
- Latest-request-wins stale-save protection.
- Visible retry on save failure.

Resume rebuilds clean state from the saved legacy JSON, reads guided metadata, resolves the current flow and falls back safely if a saved screen is no longer applicable.

## Documents Handoff

After Accounts and assets, the buyer sees a transition screen:

“Your application details are up to date”

The primary action is:

“Continue to documents”

On handoff:

- Guided Steps 1 through 6 are validated.
- Latest clean state is converted through `toLegacyBondApplication()`.
- Data is saved through the existing onboarding form API path.
- Metadata records `phase_3_documents`.
- The existing legacy Documents section opens.
- Existing selected banks, declarations, typed signature and documents are preserved.

No dynamic document rules are generated in Phase 3.

## Security And Accessibility

The guided UI:

- Does not log applicant answers.
- Does not put answers in URLs.
- Does not use localStorage or sessionStorage for financial answers.
- Masks account references in summaries.
- Uses labelled inputs and fieldsets.
- Announces save status with `aria-live`.
- Keeps option cards keyboard selectable.
- Uses inline confirmation for repeatable item removal and branch changes.

## Known Limitations

- Co-applicants still use the existing full application.
- Sureties still use the existing full application.
- Documents are not dynamically generated.
- Documents are not participant-scoped.
- Final review remains in the existing application.
- Typed signatures remain.
- No immutable submission snapshot exists.
- No separate participant access exists.
- No formal OOBA export adapter exists.
- Historic completed Phase 2 handoff applications are not automatically migrated back into guided mode.

## Deferred To Phase 4

- Dynamic document requirement rules.
- Reuse of previously uploaded documents in the guided checklist.
- Employment-specific document requirements.
- Participant-aware document requirement design preparation.
- Already received, Still required and Under review statuses.
- Document timing such as required before signature or bank submission.
- Replacement of the temporary Documents handoff with a guided Documents step.
