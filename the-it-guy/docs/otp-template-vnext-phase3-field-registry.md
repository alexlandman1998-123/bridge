# OTP Template vNext Phase 3 Field Registry

Generated: 2026-08-05T00:00:00.000Z
Version: otp_field_registry_phase3_v1
Status: OTP_FIELD_REGISTRY_PHASE3_READY_FOR_DATA_LOCK
Mutated data: false

## Purpose

Phase 3 turns the Phase 1 resale reference extraction into an enforceable OTP field registry contract.

The goal is not to write legal wording yet. The goal is to make sure later wording, layout and runtime work can only use canonical fields with known owners, route eligibility, source paths and policies.

## Pipeline Position

Phase 3 now runs before legal wording draft checks:

```text
Phase 0 target lock
Phase 1 reference extraction
Phase 1 shell target
Phase 2 route split
Phase 3 field registry
Phase 3 legal wording draft
Phase 4 field/data lock
```

## Reference Family Bindings

| Reference family | Owner | Canonical field keys |
| --- | --- | --- |
| purchaser_identity_capacity | buyer_onboarding | buyer_full_name; buyer_id_number; buyer_domicilium_address; buyer_income_tax_number; buyer_vat_number; buyer_marital_status; buyer_marital_regime |
| property_identity | listing_property_record | property_address; erf_number; property_township; homeowners_association_name |
| commercial_offer_terms | transaction_offer_terms | purchase_price; purchase_price_words; deposit_amount; deposit_due_date; cash_amount; irrevocable_offer_expiry |
| structured_suspensive_conditions | transaction_offer_terms | structured_suspensive_conditions; bond_amount; bond_approval_deadline; subject_sale_property; subject_sale_minimum_price; subject_sale_fulfilment_date |
| occupation_rental_guarantees | transaction_offer_terms | occupation_date; occupational_rent_payable; occupational_rent_amount; guarantee_delivery_deadline; guarantee_delivery_period |
| fixtures_fittings | seller_onboarding | fixtures_included; fixtures_excluded |
| agent_agency_commission | organisation_agent_settings | organisation_trading_name; agent_full_name; agent_ffc_number; gross_commission_amount |
| seller_identity_admin | seller_onboarding | seller_full_name; seller_id_number; seller_domicilium_address; seller_vat_number; seller_bond_institution; seller_bond_account_number; seller_outstanding_bond_amount; seller_rates_taxes_up_to_date; rates_and_taxes_account_number |
| conveyancing_attorneys | conveyancer_transfer_assignment | transfer_attorney_company_name; transfer_attorney_contact_person; transfer_attorney_email; transfer_attorney_phone; trust_account_recipient |
| bond_originator_documents | buyer_onboarding | buyer_employment_type; buyer_employer_name; buyer_occupation; buyer_gross_monthly_income; buyer_banking_institution; bond_documents_required; bond_originator_acknowledgement |

## Ownership Boundaries

- Buyer onboarding owns purchaser identity, capacity, bond-document inputs and buyer-side finance readiness.
- Seller onboarding owns seller identity, seller VAT, seller bond/rates details, disclosure, fixtures and resale compliance inputs.
- Listing/property owns property identity, township and HOA/property metadata.
- Transaction offer terms owns price, deposit, expiry, occupation, rent, guarantees and structured conditions.
- Conveyancer transfer assignment owns transfer attorney contact and trust-account recipient fields.
- Organisation/agent settings owns agency, agent and commission-facing fields.

Buyer onboarding explicitly must not own seller facts, development facts, conveyancer facts, agent/FFC, commission or property metadata.

## Added Coverage

Phase 3 adds canonical merge-field and OTP registry coverage for reference schedule gaps:

- purchaser current/domicilium address, income tax number and VAT number
- property township and homeowners association
- seller domicilium address, VAT number, bond institution/account/outstanding amount and rates/taxes account status
- transfer attorney contact person, email and phone
- purchaser employment, income, bank, bond-document checklist and bond-originator acknowledgement

## Audit Checks

`buildOtpFieldRegistryPhase3Audit()` blocks when it finds:

- a Phase 1 reference field family without a registry binding
- a binding that does not correspond to a Phase 1 reference family
- missing OTP registry fields
- source-owner mismatches
- resale route gaps
- missing source paths
- unknown field policies
- merge-field registry gaps
- buyer ownership boundary violations

## Verification

```bash
npm run test:otp-field-registry-phase3
npm run verify:otp-template-vnext
```
