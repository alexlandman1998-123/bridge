# Conveyancer Phase F3 — Trust-accounting integration

## Outcome

F3 adds a vendor-neutral trust-accounting integration family on top of F1. It connects the approved D-series financial truth to signed trust-ledger evidence without allowing the platform to move money or silently alter a law firm ledger.

F3 provides:

- an F1 trust-accounting adapter manifest;
- firm-manager-approved chart-of-account mappings;
- verified matter-to-trust-ledger links;
- three-way D6, bank-evidence and trust-ledger reconciliation; and
- independently approved, balanced posting batches for missing ledger entries.

It does not connect to a live accounting product, release a payment or dispatch a posting.

## D-series boundary

F3 consumes an independently approved D6 reconciliation. It does not recreate D5 expectations or weaken D6 matching.

The binding retains the exact:

- D6 reconciliation ID, evidence-binding fingerprint and runtime fingerprint;
- D5 matter, plan, organisation, currency and professional lane inherited through D6;
- E2 dependency-model ID and fingerprint;
- F1 connection and adapter fingerprints; and
- appointed firm and lane.

An unapproved, changed, rejected or cross-matter D6 record is blocked.

## Adapter and posting profile

`buildTrustAccountingAdapterManifest` declares F1 capabilities for receiving trust-ledger snapshots, preparing trust postings and linking trust accounts.

A posting profile maps two accounting controls by reference and hash:

- the trust-bank control account; and
- the client-matter liability/subledger control account.

The accounts must be distinct, ZAR scoped and approved by a firm manager in the same lane and firm. Automatic posting is permanently disabled in F3.

## Matter-account link

A matter link binds the E2 matter to:

- a hashed trust-bank account reference;
- a provider matter-ledger reference and hash;
- verification evidence and hash; and
- a manager who belongs to the appointed firm and lane.

Creating the link does not change beneficiary details, bank details, firm access or the provider ledger.

## Three-way reconciliation

F3 compares:

1. approved D6 cash movements and their bank-reference hashes;
2. the D6 matter-scoped bank statement evidence; and
3. a signed F1 trust-ledger snapshot and its explicit matches.

It verifies:

- exact bank-account, matter-ledger and statement-period binding;
- statement chronology and arithmetic;
- opening and closing balance parity between bank evidence and ledger evidence;
- full coverage of every D6 cash movement and active ledger entry;
- direction, amount and bank-reference compatibility;
- unique entries and matches; and
- explicit exclusion of guarantees and other instruments from trust cash.

There is no variance tolerance. A fully supported snapshot is `matched`; missing, orphaned, partial or incompatible accounting evidence is `review_required`.

## Instruments are not cash

D6 guarantee and instrument entries remain visible through `instrumentEntryIds`, but F3 will not match or post them as trust-account cash. This prevents a guarantee letter or lender confirmation from being mistaken for money held in trust.

## Missing posting workflow

Where D6 proves a cash movement but the signed provider ledger does not contain it, F3 may prepare a journal batch for review. Each journal is derived—not typed—from the unmatched D6 amount:

- inflow: debit trust-bank control, credit client-matter liability;
- outflow: debit client-matter liability, credit trust-bank control.

Every journal must reproduce the approved account mappings, D6 source evidence and exact remaining amount. Debits and credits must balance to the cent.

Preparation requires an authorised accounts/legal user in the appointed firm and lane. Approval requires an independent lane-authorised attorney or firm manager and an approval reference. The resulting F1 command remains `prepared` or `duplicate`; it is never dispatched by F3.

## Safety boundary

F3 cannot:

- initiate a bank movement;
- change a beneficiary;
- release a payment;
- mutate a trust ledger;
- alter D5, D6 or registration state;
- issue a client statement; or
- write integration data to the database.

Signed provider events, ledger values and financial identifiers remain reference/hash based. Audit and UI layers should continue redacting these identifiers.

## Verification

Run:

```bash
npm run test:conveyancer-integrations-f3
```

The suite covers adapter/profile governance, manager-controlled links, exact E2/D6 binding, three-way matching, statement arithmetic, guarantees, missing and orphan postings, bank-reference mismatches, signed inbound provenance, balanced journals, independent approval, F1 idempotency and tamper detection.

## Database boundary

F3 requires no database migration. Posting profiles, account links, signed snapshot records, reconciliation results and posting batches remain immutable in-memory contracts. Durable encrypted storage, provider OAuth, webhooks, polling, dispatch, retry handling and vendor-specific accounting adapters remain later-phase work.
