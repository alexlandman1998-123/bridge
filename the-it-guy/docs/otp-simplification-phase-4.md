# OTP simplification — Phase 4

Phase 4 connects the canonical 2026 OTP template to the existing transaction, buyer-onboarding and document-generation runtime. It does not activate the canonical template for production.

## Runtime contract

`kingstons_2026_otp_runtime_v1` binds all 118 Word placeholders from:

- transaction and property records;
- the structured buyer onboarding payload, including individual, co-purchaser, company and trust branches;
- seller, agency, agent, principal and conveyancer data supplied in the packet source context;
- approved special-condition records; and
- explicit canonical token overrides for controlled migrations and testing.

The binding produces both the populated placeholder object and a non-PII preflight report containing missing required tokens, unresolved optional tokens, attorney-review requirements and an overall ready verdict.

## Formatting and calculations

- Currency is rendered as South African rand values with two decimals.
- Dates are rendered as `D MMMM YYYY`; signing dates are split to match the existing form.
- The purchase price in words is calculated from the numeric price.
- Entity type is populated into the purchaser fields and never selects a separate template.
- Marital and employment choices populate the existing `X` marks.
- Optional values resolve to blank strings so Docxtemplater cannot leave raw tags behind.

## Legal safety

Free-text special conditions are not inserted into a canonical OTP unless the source context explicitly records attorney approval. Approved clause records may supply the wording directly. Missing required data or unapproved legal wording returns `CANONICAL_OTP_BINDING_BLOCKED` before the document is rendered or uploaded.

## Compatibility and activation boundary

The `generate-otp` function continues to build the legacy placeholders. It adds canonical placeholders in parallel, which is harmless to the current live template.

Strict preflight and canonical template storage are selected only when the resolved template has `document_model = single_master_document`. Legacy templates do not send a canonical runtime version and continue through the existing production path.

## Verification

Run:

```bash
npm run test:otp-canonical-template-phase4
```

The tests cover exact manifest parity, individual and company binding, entity/classification separation, currency/date/amount-in-words formatting, complete token resolution, attorney approval enforcement, missing-field preflight and runtime integration.
