# Conveyancer Phase F4 — SARS/transfer-duty integration

## Outcome

F4 adds a vendor-neutral SARS transfer-duty integration family on top of F1. It prepares independently approved transfer-duty declarations, reconciles signed SARS outcomes and turns a verified receipt or exemption into reviewable lodgement evidence.

F4 provides:

- an F1 tax-authority adapter manifest;
- a firm-manager-approved SARS filing profile;
- a TDC01 application evidence contract bound to E2 and D5;
- idempotent declaration and pre-payment correction commands;
- signed assessment, payment, receipt and revocation reconciliation;
- request-scoped supporting-document batches; and
- independently reviewed transfer-duty compliance evidence.

It does not connect to SARS, calculate statutory duty, file a declaration, upload a document, make a payment or mutate lodgement readiness.

## Official workflow modelled

The contract follows the SARS eFiling transfer-duty workflow described in the [SARS Guide for Transfer Duty via eFiling](https://www.sars.gov.za/guide-for-transfer-duty-via-efiling/): a TDC01 is calculated and submitted, SARS may accept, revise, request supporting documents or reject it, payment follows an accepted assessment, and a receipt follows confirmed payment or acceptance of a no-payment outcome.

Supporting documents are retained by default and become eligible for a prepared upload only after a signed SARS request identifies the required categories. Corrections are append-only and restricted to pre-payment outcomes. Once payment or receipt evidence exists, an ordinary correction is blocked so a later cancellation, resubmission and refund workflow cannot be bypassed.

## E2 and D5 binding

Every application retains the exact:

- E2 dependency-model ID and fingerprint;
- matter, plan, organisation and transfer-lane identity;
- approved D5 financial-model ID, revision and fingerprint;
- purchase price, currency and transfer-duty treatment;
- F1 adapter, connection and filing-profile fingerprints; and
- appointed transfer firm.

VAT and unknown tax treatments are rejected. F4 accepts only an approved D5 `transfer_duty` or `exempt` treatment and does not infer the treatment itself.

## Filing profile and privacy

The filing profile references the firm's SARS financial account, conveyancer registration and eFiling profile by identifier and hash. A transfer-lane firm manager must approve it.

Applications retain party, tax identity, declaration, property and document evidence as references and hashes. Raw taxpayer names, identity or tax numbers, property descriptions and document bodies are rejected from the integration record.

## TDC01 application

The application contract requires:

- at least one seller and purchaser;
- complete reference/hash evidence for each party and tax identity;
- one or more properties whose allocated consideration totals the approved D5 purchase price;
- non-authoritative calculation evidence completed before preparation;
- retained supporting documents available before approval; and
- independent legal approval by a different authorised user.

The platform calculation is evidence only. It never replaces the SARS calculation or assessment.

## Submission and corrections

An approved initial application prepares an F1 `sars_transfer_duty_declaration_submission_requested` command. A valid later revision prepares `sars_transfer_duty_correction_requested`.

Both commands are idempotent and retain only an approved payload reference and hash. F4 never dispatches them. Each correction binds to the exact earlier application and a signed, non-compliant pre-payment SARS outcome; the earlier revision remains immutable.

## Outcome reconciliation

F4 records signed provider outcomes as separate lifecycle states, including:

- submitted;
- supporting documents requested;
- assessment issued or accepted;
- payment pending or received;
- receipt or exemption issued;
- correction required, rejected or cancelled; and
- receipt revoked.

Transitions must be chronological, bind to the same provider reference and carry the expected signed F1 event type. An assessment or payment status is never treated as a receipt.

Compliance eligibility requires either:

- an available receipt backed by confirmed full payment; or
- an available no-payment/exemption document with explicit SARS acceptance evidence.

A payment reversal or locked/revoked receipt removes eligibility.

## Supporting documents

A batch can be prepared only when a valid signed SARS request exists. Its document categories must be a subset of the requested categories and must resolve to retained application documents. Preparation and independent approval are both required.

The resulting F1 command remains prepared or duplicate. No upload occurs inside F4.

## Lodgement evidence

An eligible receipt or exemption still requires independent legal review. The resulting evidence binds the application, SARS outcome, receipt hash, provider reference and reviewer decision.

This evidence is an input for the later lodgement-readiness workflow. F4 does not mark the matter ready, lodge it or update registration.

## Safety boundary

F4 cannot:

- calculate an authoritative statutory rate or liability;
- submit to SARS or upload supporting documents;
- initiate or confirm payment;
- synthesize a SARS receipt or exemption;
- accept an external status as compliance without review;
- mutate D5, workflow, registration or lodgement-readiness state; or
- write integration data to the database.

## Verification

Run:

```bash
npm run test:conveyancer-integrations-f4
```

The suite covers adapter and profile governance, exact E2/D5 binding, tax routing, independent approval, privacy controls, append-only corrections, post-payment blocking, command idempotency, signed outcome transitions, assessment/payment/receipt separation, request-scoped supporting documents, exemption acceptance, revocation, legal review and tamper detection.

## Database boundary

F4 requires no database migration. Filing profiles, applications, submission packets, signed outcomes, supporting-document batches and compliance evidence remain immutable in-memory contracts. Durable encrypted storage, provider credentials, live third-party conveyancing adapters, webhook persistence, dispatch, polling, retries, payment execution, cancellation/refund processing and operational UI remain later-phase work.
