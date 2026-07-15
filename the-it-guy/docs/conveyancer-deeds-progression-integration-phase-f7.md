# Conveyancer Phase F7 — Deeds progression integration

## Outcome

F7 adds a provider-neutral deeds progression boundary on top of F1 and the E5 simultaneous-lodgement gate. It can prepare an approved lodgement command, reconcile signed deeds events, enforce an append-only progression chain and produce legally reviewed coordination evidence. It does not lodge, declare registration, mutate a matter stage or write to the database.

## Legal and operating model

South African deeds and documents are prepared and lodged by a conveyancer or notary and are examined for legal compliance. The Electronic Deeds Registration System supports electronic preparation, lodgement, registration, execution and storage. F7 therefore treats provider messages as source evidence, never self-authenticating legal truth:

- [South African Government — land reform and deeds examination](https://www.gov.za/issues/land-reform)
- [South African Government — eDRS implementation](https://www.gov.za/news/media-statements/land-reform-and-rural-development-implements-electronic-deeds-registration)
- [Deeds Registries Act 47 of 1937](https://www.gov.za/documents/deeds-registries-act-26-may-1937-0000)

## Controlled lodgement preparation

The transfer attorney remains the coordinating practitioner. F7 only prepares a reference-only F1 command when:

- E5 says the transfer, bond and cancellation lanes are jointly ready;
- the proposed lodgement time and every lane attestation match E5;
- the batch contains exactly one component for every required lane and appointed firm;
- an authorised member of the appointed transfer firm approves the command; and
- the command is idempotent.

`deedsSubmissionPerformed` and `externalWritePerformed` remain false. Dispatch requires a separately governed provider adapter and durable outbox.

## Progression chain

F7 accepts signed, replay-protected F1 events for:

`lodged → examination → preparation → execution → registered`

The chain also supports deeds notes, note clearance, rejection and withdrawal. Every revision binds the same matter, submission, provider batch and transfer/bond/cancellation component set. Skipped states, altered firms, altered batch references, stale events and terminal-state transitions fail closed.

## Registration assurance

A provider `registered` event is not enough. Registration review requires:

- the valid preceding progression chain;
- an official registration-notice reference and hash;
- a registration time no later than the signed provider event;
- legal review by the appointed transfer firm; and
- an append-only evidence fingerprint.

The resulting evidence projects exact registration-confirmation keys to all required lanes. It remains coordination evidence: it does not manufacture a registration outcome, settle guarantees, close a bank instruction, update the financial model, send notices or advance the workflow.

## Privacy and governance

Payloads, deeds and notices are held by reference and cryptographic hash. F1 rejects inline payloads and raw secrets. The profile is manager-approved for the exact appointed transfer firm, organisation, provider connection, deeds office and hashed practitioner reference.

## Persistence

No database migration is required. F7 is an immutable validation and evidence contract. Durable profiles, encrypted credentials, inbox/outbox records, progression storage, user interface, notifications and live eDRS/provider dispatch require a later controlled persistence phase.
