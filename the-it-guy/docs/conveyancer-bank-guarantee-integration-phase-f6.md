# Conveyancer Phase F6 — Bank and guarantee integrations

## Outcome

F6 adds a governed conveyancing-bank integration family on top of F1. It reconciles bank-appointed instructions, cancellation figures, guarantee issuance and approval-to-lodge evidence while preserving the lane ownership established in E1–E5.

F6 provides:

- an F1 banking adapter for bond and cancellation lanes;
- manager-approved, bank-specific lane profiles;
- signed bank appointment and instruction reconciliation;
- signed cancellation figures projected into E4 requirements;
- independently approved, idempotent guarantee issue and replacement requests;
- signed guarantee issuance, replacement, withdrawal, expiry and revocation evidence;
- reviewed E4 bank-guarantee instruments; and
- reviewed E5 `bank_approval_to_lodge` evidence.

It does not appoint attorneys, satisfy bank conditions, calculate cancellation figures, issue or accept guarantees, dispatch bank commands, move money, confirm settlement or mutate coordination and readiness state.

## Guarantee model

South African conveyancing uses guarantees to bridge the timing difference between transfer and payment. The courts describe the usual property-transfer guarantee as an undertaking that payment will occur on registration, with suitability depending on the sale agreement and guarantee terms. See [Basson v Reddy](https://www.saflii.org/za/cases/ZAKZDHC/2018/9.html) and [C F and P S Investments v PPA Lightco](https://www.saflii.org/za/cases/ZAGPPHC/2019/995.html).

F6 therefore treats amount, beneficiary, wording, issue date, expiry and document identity as independently reviewable terms. A bank event cannot make a guarantee acceptable by itself.

## Appointment boundary

The bank appoints the bond and cancellation firms. F6 only verifies that the signed instruction identifies the firm already bound to the relevant E2 lane.

Every profile binds:

- the bank reference and integration connection;
- the bank portal registration;
- the bank's conveyancer-panel reference;
- the organisation and matter;
- either the bond or cancellation lane; and
- the exact E2-appointed firm.

A manager in that firm and lane must approve the profile. Creating it does not register the firm with the bank or appoint it to the matter.

## Bank instruction

A signed instruction retains the exact:

- E2 matter, plan and organisation;
- F1 profile and bank reference;
- appointed lane and firm;
- provider instruction and appointment evidence;
- customer and property references and hashes; and
- approved bond amount where the instruction is for registration.

Cancellation instructions do not invent an approved amount; the bank's later cancellation figures remain the authoritative amount evidence.

Raw customer names, identity numbers, account numbers, property addresses and instruction bodies are prohibited from integration records.

Downstream F6 records recalculate the complete instruction fingerprint and validate its profile, bank, firm and matter binding. Recognising the shape of a fingerprint is never sufficient.

## Cancellation figures

Signed cancellation figures require:

- an active cancellation-lane instruction;
- exact amount and ZAR currency;
- beneficiary and wording hashes;
- provider and document references and hashes;
- issue and expiry dates; and
- append-only replacement lineage.

F6 projects this evidence into an E4 `cancellation_settlement` requirement owned by the cancellation lane. It does not calculate the amount or mark the E1 hand-off accepted.

## Guarantee requests

The bond lane may prepare an issue or replacement command only when:

- its bank instruction remains active;
- an exact current E4 requirement exists;
- the requested amount equals the E4 remaining amount;
- beneficiary and wording hashes match E4;
- preparation and legal approval are independent; and
- replacement binds the previous issued guarantee and a change reason.

The resulting F1 command is `prepared` or `duplicate`. F6 never dispatches it.

The cancellation lane cannot issue a bank guarantee through this contract, and no direct bond-to-cancellation mutation is introduced. The transfer lane remains the E1/E4 coordination hub.

## Guarantee outcomes and E4 evidence

A signed guarantee outcome remains provider evidence until an authorised bond attorney reviews it. Validation covers:

- expected signed event type;
- instruction and approved request fingerprints;
- exact amount, currency, beneficiary and wording;
- provider guarantee reference;
- immutable document reference and hash;
- issue and expiry chronology; and
- append-only replacement or status lineage.

Only a current, unexpired, reviewed guarantee becomes an E4 `bank_guarantee` instrument. F6 does not allocate it, accept wording or approve a cancellation guarantee.

Withdrawal, expiry and revocation retain the historical document lineage while removing review eligibility.

## Approval to lodge

A signed bank approval-to-lodge outcome requires an active bond instruction, approval document, conditions-evidence reference, issue time and validity date.

After independent legal review it becomes E5 `bank_approval_to_lodge` evidence with the provider's `validUntil` date. F6 does not create the E5 attestation or mark the bond lane ready. A later revocation or expiry removes eligibility and preserves the prior document reference and hash.

## Safety boundary

F6 cannot:

- choose or appoint a bond or cancellation attorney;
- invent a bank instruction or mark bank conditions satisfied;
- calculate cancellation figures;
- issue, replace, allocate or accept a guarantee;
- dispatch a bank command;
- initiate payment or confirm settlement;
- mutate E1, E4, E5, registration or workflow state; or
- write integration data to the database.

## Verification

Run:

```bash
npm run test:conveyancer-integrations-f6
```

The suite covers adapter and profile governance, bank-appointed firms, signed instruction provenance, privacy, cancellation figures and replacements, E4 requirement binding, idempotent guarantee requests, cross-lane denial, exact guarantee terms, reviewed E4 instruments, guarantee replacements, E5 approval evidence, revocation lineage and tamper detection.

## Database boundary

F6 requires no database migration. Profiles, instructions, cancellation figures, command intents, signed outcomes and reviewed evidence remain immutable in-memory contracts. Durable encrypted storage, provider credentials, live bank adapters, webhook persistence, command dispatch, polling, retry handling, registration advice, settlement reconciliation and operational UI remain later-phase work.
