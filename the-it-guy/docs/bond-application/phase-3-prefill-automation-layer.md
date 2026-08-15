# Phase 3 - Buyer Bond Application Prefill Automation Layer

## Purpose

This phase turns the Phase 1 source audit into a runtime prefill layer. The buyer bond application is now prepared from existing structured data before the buyer sees the form.

## Delivered Behaviour

- `buildBondApplicationPrefillDraft` builds the buyer-facing legacy application draft.
- Existing saved bond application answers remain the highest priority and are not overwritten.
- Buyer/bio onboarding fields prefill applicant, contact, income, address, and finance values.
- Agent transaction setup fields prefill finance, property, and purchaser values when onboarding data is missing.
- Signed OTP structured transaction values can prefill the same transaction-backed finance/property fields once the OTP workflow hydrates them.
- Prefill metadata is attached to the draft under `prefill_metadata` for later source badges and missing-information UX.

## Runtime Wiring

| Surface | Change |
| --- | --- |
| Buyer portal bond application | Uses `buildBondApplicationPrefillDraft(portal).application` instead of directly calling the legacy draft builder. |
| Guided application state | `buildBondApplicationState` now starts from the prefilled legacy application draft. |
| Module exports | Prefill builder, matrix, and OTP gate helpers are exported from the bond application barrel. |

## Source Metadata

The builder records:

- `sourceByPath`: source evidence for each audited field.
- `sourceCounts`: count of fields resolved from each source type.
- `appliedFields`: fields that were filled by the automation layer.
- `preservedFields`: fields that already had values and were left intact.
- `missingFields`: required fields still missing after automation.

This metadata is intentionally separated from validation. Phase 4 can use it for source badges and confirmation cards.

## Phase 1 Gap Closed

Purchaser entity name and registration number now include transaction-backed fallbacks:

- `portal.transaction.buyer_entity_name`
- `portal.transaction.purchaser_entity_name`
- `portal.transaction.company_name`
- `portal.transaction.trust_name`
- `portal.transaction.buyer_entity_registration_number`
- `portal.transaction.purchaser_entity_registration_number`
- `portal.transaction.company_registration_number`
- `portal.transaction.trust_registration_number`
- `portal.transaction.registration_number`

## Guardrails

- Do not overwrite saved buyer answers with onboarding, agent, or OTP values.
- Do not parse raw OTP PDFs in this layer.
- Keep the persisted legacy bond application shape compatible with the existing originator handoff.
- Treat `prefill_metadata` as support metadata for UI/source badges, not as buyer-entered application data.
