# OTP Template vNext Phase 3 Legal Wording Draft

Generated: 2026-08-03T00:00:00.000Z
Version: otp_legal_wording_draft_phase3_v1
Status: OTP_LEGAL_WORDING_DRAFT_READY_FOR_COUNSEL_REVIEW
Mutated data: false

## Decision

Phase 3 creates route-specific recommended OTP wording for attorney/counsel review. It does not approve the wording, publish templates, mutate Supabase, or authorise live generation.

The draft covers both frozen OTP routes:

| Route | Draft section count | Signature model |
| --- | ---: | --- |
| `resale_existing_property` | 14 | Purchaser + Seller |
| `new_development` | 14 | Purchaser + Developer authorised signatory |

## Draft Coverage

The draft wording includes:

- definitions
- written agreement and signature formalities
- party capacity and authority
- resale property wording
- development unit wording
- purchase price, deposit and guarantees
- development VAT treatment
- finance and suspensive conditions
- subject-to-sale condition
- resale occupation, risk and occupational rent
- development handover, inspection and snagging
- resale mandatory disclosure, defects and fixtures
- development compliance, body-corporate rules and costs
- transfer and conveyancer obligations
- agency commission and FFC details
- special conditions and annexures
- POPIA, FICA and transaction records
- route-specific acceptance/signature blocks

## Legal Anchors

The draft is anchored to official South African source material:

| Anchor | Source |
| --- | --- |
| Alienation of Land Act 68 of 1981 | https://www.gov.za/documents/alienation-land-act-24-mar-2015-1035 |
| Property Practitioners Act 22 of 2019 | https://www.gov.za/sites/default/files/gcis_document/201910/42746gon1295.pdf |
| Property Practitioners Regulations, Regulation 36 | https://www.gov.za/sites/default/files/gcis_document/202201/45735pr47.pdf |
| Electronic Communications and Transactions Act 25 of 2002 | https://www.gov.za/sites/default/files/gcis_document/201409/a25-02.pdf |

## Review Gates

Every draft section is marked:

- `draft_status: draft_for_counsel_review`
- `legal_review_required: true`
- `counsel_approval_required: true`
- `render_validation_required: true`

The wording must still be reviewed by counsel for:

- enforceability of electronic vs wet-ink signature workflows
- sale-formality wording
- route-specific disclosure and defect language
- CPA and voetstoots/as-is risk balance
- development-specific handover, snagging, NHBRC and delay wording
- VAT and development-price treatment
- commission trigger and mandate alignment
- POPIA/FICA processor and privacy-policy alignment

## Verification

Run:

```bash
npm run test:otp-legal-wording-draft-phase3
npm run verify:otp-template-vnext
```
