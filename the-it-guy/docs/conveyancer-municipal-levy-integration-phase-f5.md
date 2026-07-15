# Conveyancer Phase F5 — Municipal and levy integrations

## Outcome

F5 adds governed municipal and community-scheme clearance integrations on top of F1. It prepares approved requests, reconciles signed figures and certificates, surfaces D5 financial differences and creates reviewable E5 evidence without allowing an external status to make the matter lodgement-ready automatically.

F5 provides:

- F1 municipal-authority and community-scheme adapter families;
- firm-manager-approved provider profiles;
- separate municipal, sectional-title levy and HOA levy streams;
- E2 and approved D5-bound clearance requests;
- idempotent figures-request and payment-evidence commands;
- signed figures, payment acknowledgement, certificate, expiry and revocation outcomes;
- D5 expectation reconciliation; and
- independently reviewed E5 `rates_clearance` or `levy_clearance` evidence.

It does not calculate provider figures, dispatch requests, upload proof, move money, issue a statutory or conveyancer certificate, update D5 or mutate lodgement readiness.

## Legal and operational model

Municipal and levy clearances are deliberately separate.

Section 118 of the Local Government: Municipal Systems Act requires the relevant municipal certificate before transfer. Municipal implementations may differ operationally; for example, [Overstrand Municipality's published process](https://www.overstrand.gov.za/obtaining-rates-clearance-certificates-from-the-municipality/) separates the application, figures, payment and certificate stages and states its own certificate validity period. F5 therefore records validity supplied by the provider and does not hard-code a universal number of days or advance-month calculation.

For sectional title, [section 15B(3)(a)(i)(aa) of the Sectional Titles Act](https://www.saflii.org/za/legis/consol_act/sta1986189/index.html) requires a conveyancer's certificate based on the body corporate certifying that amounts due have been paid or satisfactory provision has been made. F5 can record `provision_accepted` for a sectional-title or HOA provider but does not permit it as the settlement basis for a municipal certificate.

The platform never synthesises either certificate and does not issue the conveyancer's section 15B certificate.

## Provider profiles

F5 supports:

- `municipal` with a municipality;
- `sectional_levy` with a body corporate or managing agent; and
- `hoa_levy` with a homeowners association or managing agent.

Municipal adapters use the F1 `municipal_authority` category. Sectional-title and HOA adapters use `community_scheme`.

Every profile binds the provider, account namespace, organisation, appointed transfer firm, environment, F1 adapter and connection by reference and fingerprint. A transfer-firm manager must approve it.

## Clearance request

A request retains the exact:

- E2 model, matter, plan, organisation and transfer lane;
- approved D5 ID, revision and fingerprint;
- F1 connection and profile fingerprints;
- property, owner and provider account references and hashes;
- requested clearance period; and
- independent legal approval.

Sectional-title requests fail closed unless E2 confirms sectional tenure. HOA levy requests require an HOA or estate tenure signal. Municipal clearance remains required independently.

Raw property addresses, descriptions, owner names and account numbers are prohibited from the integration record.

## Commands

An approved request may prepare:

- `property_clearance_figures_request_requested`; or
- `property_clearance_payment_evidence_submission_requested`.

The payment-evidence command must bind the exact current figures outcome and exact amount due. Both commands inherit F1 idempotency and retain only approved payload references and hashes. F5 never dispatches or uploads them.

## Signed outcome lifecycle

F5 keeps these provider states distinct:

- figures issued;
- payment evidence acknowledged;
- certificate issued;
- rejected;
- expired; and
- revoked.

Each transition requires the expected signed F1 event, exact request and provider reference, monotonic revision and valid chronology. Figures or payment acknowledgement never constitute clearance.

A certificate becomes compliance-eligible only when it:

- is available and provider-issued;
- contains a document reference and hash;
- records an allowed settlement basis;
- has an issue date and future validity date; and
- remains neither expired nor revoked.

Expiry and revocation outcomes preserve the original certificate reference and hash for audit while removing eligibility.

## D5 reconciliation

Issued figures are compared with the approved D5 line appropriate to the stream:

- municipal: `rates_clearance`;
- sectional-title: `levy_clearance`; and
- HOA: `homeowners_association`.

The result is `matched`, `variance` or `no_approved_expectation`. F5 never edits D5. A variance or absent approved expectation requires an explicit financial-review reference before a lawyer can approve the certificate as lodgement evidence.

## E5 evidence

After independent legal review, an eligible certificate becomes:

- `rates_clearance` evidence for municipal clearance; or
- `levy_clearance` evidence for sectional-title and HOA clearance.

The evidence includes the provider certificate hash and `validUntil` date required by E5's expiring-check logic. It remains an input to E5; F5 does not create an attestation, mark a lane ready or lodge a deed.

## Safety boundary

F5 cannot:

- calculate municipal, body-corporate or HOA figures;
- dispatch a provider request or upload payment proof;
- initiate or confirm payment;
- synthesise a clearance certificate;
- issue a conveyancer certificate;
- mutate D5, workflow, E5, registration or lodgement state; or
- write integration data to the database.

## Verification

Run:

```bash
npm run test:conveyancer-integrations-f5
```

The suite covers three provider streams, profile governance, E2/D5 binding, tenure routing, privacy, independent approval, command idempotency, payment-evidence lineage, signed outcomes, financial matching and variance, certificate validity, settlement bases, E5 check mapping, expiry/revocation provenance and tamper detection.

## Database boundary

F5 requires no database migration. Profiles, requests, command packets, signed outcomes and compliance evidence remain immutable in-memory contracts. Durable encrypted storage, provider onboarding, live municipal or managing-agent adapters, webhook persistence, dispatch, polling, retries, payment execution, refund handling and operational UI remain later-phase work.
