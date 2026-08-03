# OTP Template vNext Phase 4: Field Registry And Definitions

## Purpose

Phase 4 turns the Phase 1 inventory, Phase 2 route universe, and Phase 3 buyer/offer-link upgrade into an OTP-specific field contract. The mandate generator now has enforceable content gates; OTP needs the same foundation before clause rules, fallback locks, and launch-readiness checks can be trusted.

This phase adds `src/core/documents/otpFieldRegistry.js` as the canonical OTP field registry and definition map.

## Registry Version

- `OTP_FIELD_REGISTRY_VERSION`: `otp_field_registry_phase4_v1`
- Audit ready state: `OTP_FIELD_REGISTRY_READY_FOR_CONTENT_RULES`
- Remediation state: `OTP_FIELD_REGISTRY_REMEDIATION_REQUIRED`

The registry audit is intentionally read-only and returns `mutatedData: false`.

## What The Registry Covers

Shared OTP fields:

- `otp_document_variant`
- buyer identity and capacity fields
- purchase price, deposit, finance, guarantee, offer-expiry, occupation, and structured suspensive-condition fields
- transfer attorney, conveyancer trust account, organisation logo, agent FFC, commission, and runtime signature fields

Resale / existing-property fields:

- seller identity and capacity
- property address and title type
- mandatory disclosure annexure/status
- fixtures included/excluded
- occupational rent payable/amount
- subject-to-sale fields
- seller compliance certificate schedule

New-development fields:

- developer name and company registration
- contractor company
- development name
- unit/section number
- sectional plan status
- body corporate name and rules annexure
- participation quota
- parking/garage allocation
- VAT-inclusive purchase price
- NHBRC certificate number
- levy/rates estimates
- utility connection charges
- snagging period

## Definitions

The definition catalog is route-aware. Shared definitions include:

- Agreement
- Agent
- Conveyancer
- Deposit
- Guarantees
- Occupation Date
- Purchase Price
- Property
- Purchaser
- Seller
- Suspensive Conditions
- VAT
- Compliance Certificates

Resale-only definitions include:

- Fixtures
- Mandatory Disclosure Form
- Occupational Rental
- Voetstoots

New-development-only definitions include:

- Sectional Titles Act
- Architect
- Body Corporate
- Common Property
- Contractor
- Development
- NHBRC
- Parking Bay
- Participation Quota
- Rules
- Section / Unit
- Sectional Plan

## Clause Definition Map

The registry maps clause families to required definition terms:

- `offer_acceptance`
- `parties`
- `purchase_price`
- `finance`
- `suspensive_conditions`
- `occupation_rent`
- `fixtures_defects_disclosure`
- `compliance_certificates`
- `transfer_conveyancer`
- `development_unit`
- `body_corporate`
- `development_defects`

This is the contract Phase 5 content rules should use to block clause packs that refer to undefined concepts.

## Ownership Rules

Phase 4 keeps buyer onboarding from becoming the dumping ground:

- buyer onboarding owns buyer identity/capacity and buyer finance signals only
- seller onboarding owns seller facts, disclosure, defects, fixtures, and resale compliance inputs
- development setup owns developer, contractor, development, body corporate, NHBRC, sectional-plan, and snagging data
- development unit setup owns unit-specific title, parking, participation quota, levies, rates, and utility charge data
- transaction offer terms owns price, deposit, guarantees, expiry, occupation, subject-to-sale, and structured suspensive conditions
- conveyancer transfer assignment owns transfer attorney and trust account recipient data
- organisation/agent settings owns logo, FFC, and commission inputs
- signing runtime owns generated signature fields

## Audit Checks

`buildOtpFieldRegistryAudit()` blocks when it finds:

- duplicate OTP field keys
- field owners that are not in the Phase 2 route universe
- renderable OTP fields missing from the canonical merge-field registry
- fields referencing definition terms that do not exist for their variant
- clause families requiring definition terms that do not exist for their variant
- missing Phase 3 buyer/offer-link fields

## Verification

Run:

```bash
npm run test:otp-field-registry-phase4
npm run verify:otp-template-vnext
```

Phase 4 is complete when both pass and the registry audit returns `OTP_FIELD_REGISTRY_READY_FOR_CONTENT_RULES`.

## Still Carried Forward

Phase 4 does not write clauses and does not approve templates. It prepares the enforceable field and definition contract for the next phases:

- Phase 5: OTP content rules and scanner
- Phase 6: OTP shell/layout and route-aware template build
- Phase 7: OTP launch-readiness panel and publish blockers
- Phase 8: runtime lock, fallback approval enforcement, and live corrective migration after audit
