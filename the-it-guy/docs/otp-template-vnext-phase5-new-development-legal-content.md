# OTP Template vNext Phase 5 New Development Legal Content

Generated: 2026-08-05T00:00:00.000Z
Version: otp_new_development_legal_content_phase5_v1
Status: OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_READY_FOR_COUNSEL_REVIEW
Route: new_development
Mutated data: false

## Purpose

Phase 5 adapts the current Samlin/Junoah `AGREEMENT OF SALE - final.doc` into a new-development-only legal-content contract.

This phase keeps new development separate from resale. The Samlin/Junoah agreement includes seller/developer, purchaser, building contractor, sectional-title unit, VAT-inclusive price, utility connection charges, body-corporate rules, NHBRC, snagging, CPA/direct-marketing and multi-party signature content that must not be folded into the resale OTP.

## Reference Source

| Field | Value |
| --- | --- |
| Source | `/Users/alexanderlandman/Desktop/Samlin/Junoah Sales/Templates/AGREEMENT OF SALE - final.doc` |
| SHA-256 | `62d6776d8689ea6fd62cfba6963e1d6acb9586633f3e1abfb8ef57e478f48654` |
| Format | legacy Word `.doc` |
| Page count | 23 |
| Word count | 6001 |
| Project signal | JUNOAH ESTATE |
| Seller signal | JUANFANY CC |
| Contractor signal | SAMLIN CONSTRUCTION CC |
| Conveyancer signal | TUCKERS INCORPORATED |

## Covered Topics

The contract covers 27 new-development topics:

1. front_schedule_parties
2. sectional_title_property
3. vat_inclusive_purchase_price
4. mortgage_finance
5. conveyancers_and_trust_investment
6. utility_connection_charges
7. building_contractor_nhbrc
8. recordal_and_interpretation
9. sale
10. transfer_delivery_mortgage_bond
11. occupation_before_transfer
12. rectification_of_defects
13. body_corporate_before_transfer
14. selling_agent_commission
15. jurisdiction_costs
16. joint_and_several_liability
17. company_to_be_formed
18. company_close_corporation_trust
19. breach
20. notice_address
21. general_conditions
22. offer_acceptance
23. direct_marketing_cpa
24. consumer_protection_acknowledgement
25. nhbrc_certificate
26. marketing_and_annexures
27. multi_party_signatures

## Added Registry Coverage

Phase 5 adds or expands fields needed by the current development agreement:

- `developer_representative`
- `developer_contact_email`
- `contractor_registration_number`
- `contractor_signature`
- `agent_signature`
- buyer spouse/representative/capacity and domicilium fields are now valid for both resale and new-development routes

## Locked Rules

- Every section is scoped to `new_development`.
- Every section carries the reference source path, hash and topic key.
- Every placeholder must be canonical in the merge-field registry and present in the OTP field registry.
- Resale-only fields are forbidden in new-development legal content.
- Contractor/NHBRC, body-corporate, snagging/defects, CPA/direct-marketing and multi-party signatures are required coverage.
- Every section remains marked as draft-only, legal-review required and counsel-approval required.

## Verification

```bash
npm run test:otp-new-development-legal-content-phase5
npm run verify:otp-template-vnext
```

## Boundary

Phase 5 does not mutate Supabase, publish templates, approve legal wording, replace the resale content contract, or bypass branded PDF/render/signature validation.
