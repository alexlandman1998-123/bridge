# Seller profile field alignment audit

11 October 2026. Primary Arch9 seller lead, listing and private transaction workspaces.

**Local repair status:** Phases 1–3 now implement the ownership contract,
revision-checked atomic contact saving, shared current seller profile views and
complete entity/person handoff. The findings below record the original audit
baseline. Their local repair evidence is in the
[saving repair report](seller-saving-repair-2026-10-11.md#phase-3-profile-alignment).
No hosted records have been inspected or reconciled, and nothing is deployed.

At the original audit baseline, the three screens were not equivalent views of the same seller information. Local execution reproduced eight mismatch scenarios: stale lead contact details, incomplete transaction handoff, missing identity fields, inconsistent transaction copies and an unguarded transaction contact save. These are implementation findings from synthetic records, not a count of affected live records.

The original saving repair protected lead, listing and seller portal saves but did not establish a common seller field model or synchronise transaction seller details. This audit made no application changes or hosted migration/deployment; the subsequent phased repair is recorded separately.

## Field comparison

| Information | Seller lead profile | Listing seller profile | Transaction seller details |
| --- | --- | --- | --- |
| Legal owner and primary contact | Separate ownership/contact summary and personal cards | Separate legal owner and primary contact groups | Basic seller name plus a separately captured party snapshot; owner and contact can become confused during handoff |
| Email and mobile | Personal card prefers CRM contact/lead; ownership card prefers saved seller details | Saved listing/onboarding details | Transaction columns, onboarding form and participant records are separate copies |
| Individual ID or passport | Profile/ownership details | Shown and editable | Structured party snapshot supports identity; basic seller editor does not expose it |
| Date of birth, nationality and residential address | Shown in the relevant profile cards | Editable, but absent from the main individual Seller Information display | Absent from the transaction party person schema and basic seller editor |
| Tax number, tax residence, VAT and FICA questions | Tax/compliance cards | Captured in the editor; only part is surfaced on the main profile view | Absent from the basic seller editor and party snapshot schema |
| Company/trust name and registration | Relevant entity cards | Relevant entity groups | Handoff misses the canonical nested registration fields |
| Directors, trustees and signing representatives | Person/authority cards | Relevant people/authority groups | Handoff does not map the full company/trust roster |
| Marriage and spouse | Route/authority information, with uneven person detail presentation | Marital and spouse fields | Marriage regime can carry through while the spouse disappears |
| Property ownership and existing bond | Lead/profile property information | Listing-owned property information | Separate transaction routing values; contact saving does not reconcile them |

Equivalent seller fields should have the same meaning and saved value across this linked journey. Property operations, transaction legal decisions and signed document versions still require their own records. A company name must not replace a contact person's name, and changing current details must not rewrite a signed instrument.

## Confirmed mismatches

### Lead contact cards can contradict each other

With a saved onboarding email of `current@example.test` and a CRM email of `old@example.test`, the lead's Personal Information card displays the old email. Its Legal Ownership contact and the listing display the current email. Mobile behaves the same way. This executes the actual personal-card construction from the lead screen, together with the current seller subject and listing models.

The personal card reads `selectedLeadContact` and lead fields rather than the saved onboarding contact. See [AgencyPipelinePage.jsx](/Users/alexanderlandman/the-it-guy/the-it-guy/src/pages/agency/AgencyPipelinePage.jsx:18224).

### Listing to transaction conversion uses a different seller shape

The current canonical seller facts store legal type under `seller.legal_type` / `seller.owner_structure_type`, company details under `seller.company`, trust details under `seller.trust`, and contact under `seller.contact`.

The transaction converter looks for other names, including `seller.profile_type`, flat company/trust registration fields and `seller.primary_contact`. Using the actual listing form mapper and canonical transformer, a confirmed company listing becomes an `unknown` transaction seller. Even when the company type is supplied explicitly, registration and directors are omitted. The corresponding trust registration and trustee details are omitted too. Historical shapes that contain the converter's expected aliases can behave differently.

A married fixture retains `in_community` but creates only one owner and no spouse. Powers of attorney also need an explicit mapping of principal and representative; the common model should keep legal entity type separate from signing authority.

See [AgentNewDealWizard.jsx](/Users/alexanderlandman/the-it-guy/the-it-guy/src/components/AgentNewDealWizard.jsx:1274), [transactionPartyProfile.js](/Users/alexanderlandman/the-it-guy/the-it-guy/src/core/transactions/transactionPartyProfile.js:148) and [sellerOnboardingFactTransformer.js](/Users/alexanderlandman/the-it-guy/the-it-guy/src/services/documents/sellerOnboardingFactTransformer.js:505).

### Transaction saving leaves competing copies

The transaction seller editor saves name, email and phone. Its service updates the transaction row, then the onboarding form, then seller participants through separate requests. It does not send a shared seller save command for the linked listing, seller onboarding or CRM contact, and it leaves `__bridge_transaction_parties.seller` unchanged.

Executing that actual service against synthetic tables confirmed:

- Transaction email becomes the new value while the structured seller person email stays old.
- Participant phone stays old because the participant update contains only name and email.
- Every participant with `role_type = seller` receives the same name and email, including a distinct second owner.
- A later save from an older form is accepted and restores old contact details. There is no expected editor revision check on this path.

The inspected database continuity functions connect portal contexts and promote documents; the client identity trigger indexes source records. These mechanisms do not make this contact service a complete shared profile save. Hosted trigger definitions were not inspected.

See [DealSetupPanel.jsx](/Users/alexanderlandman/the-it-guy/the-it-guy/src/components/transaction/DealSetupPanel.jsx:114), [AttorneyTransactionDetail.jsx](/Users/alexanderlandman/the-it-guy/the-it-guy/src/pages/AttorneyTransactionDetail.jsx:22745) and [api.js](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/api.js:39710).

### Visible and saved field sets differ

The listing editor captures identity, address, tax and FICA fields that its main Seller Information groups omit. The transaction party normaliser keeps a smaller person schema and discards date of birth, nationality, residential address and tax number. A field hidden on one screen can therefore look missing even if it remains saved on the listing; fields omitted from the transaction snapshot are a separate continuity problem.

See [listingSellerInformationModel.js](/Users/alexanderlandman/the-it-guy/the-it-guy/src/services/listings/listingSellerInformationModel.js:38), [ListingSellerInformationEditor.jsx](/Users/alexanderlandman/the-it-guy/the-it-guy/src/components/listings/ListingSellerInformationEditor.jsx:133) and [transactionPartyProfile.js](/Users/alexanderlandman/the-it-guy/the-it-guy/src/core/transactions/transactionPartyProfile.js:47).

## Repair order

1. Define the common seller profile fields and aliases: legal owner, contact, people, identity, tax/FICA, marital relationships and signing authority. Use the same read model and relevant field groups on all three screens.
2. Repair the transaction handoff against the actual canonical facts. Preserve company/trust registration, each person's identity and role, spouse relationships, and principal/representative distinctions. Keep source person identities stable.
3. Route transaction seller editing through a guarded command that updates the linked current seller record and its required projections together. Update only the intended person; reject stale edits while retaining the form.
4. Review existing linked records for differences before reconciling them. Retain provenance and require review for conflicting identity/authority values. Preserve signed documents and transaction-specific legal decisions.

Acceptance requires save/reopen comparisons from each of the three screens, both directions of propagation, explicit blank clearing, multiple people, all supported ownership routes and two concurrent agent/seller sessions.

## Checks and limits

- Existing field, hydration, alignment, listing authority, transaction tracking and model checks: **15 passed, 2 failed** out of 17 entries. The failures are outdated check harnesses: `agent-leads-seller-profile-workspace.test.mjs` expects a removed implementation in the lead wrapper, and `seller-profile-onboarding-hydration.test.mjs` omits the `sellerYesNoValue` dependency from its extracted-function harness. They do not establish new runtime failures, and they are not counted as passes.
- Existing transaction Deal Setup component checks: **11 passed**.
- Additional local audit execution: **8 mismatch scenarios reproduced**. These assertions confirm discrepancies; they are not a claim that the requested alignment passes.
- Reproducer: [arch9-seller-field-alignment-audit.mjs](/tmp/arch9-seller-field-alignment-audit.mjs). [Synthetic evidence and source fingerprints](/tmp/arch9-seller-field-alignment-evidence.json).

No live seller records were scanned. No application source, database records, deployments, emails or signed documents changed in this audit.


## Phase 3 resolution and remaining comparison

The current lead, listing, transaction profile and seller portal use the shared
saved-field reader. The linked capture has precedence over older CRM aliases.
The transaction handoff now reads nested canonical company/trust/contact facts
and current raw capture together, preserving full identity, address, tax,
marriage/spouse, roster and authority information with saved person references.
Canonical transformation preserves those roster ids. Current transaction profile
reads are permission checked and do not substitute historical party snapshots.

The Phase 2 atomic save keeps current contact projections together and rejects
stale writes. Phase 3 keeps SA residency/tax residency and section/unit number
separate, preserves marriage regime and representative phones, and makes
transaction identity correction use the linked listing's guarded profile.
Pending proposals, accepted document versions and transaction signer/routing
choices retain their existing boundaries.

These repairs pass local model/hydration, SQL and browser fixture checks as
recorded in the repair report. Older records with missing source ids, conflicting
facts or ambiguous links are shown for review rather than automatically merged.
The deployed schema and existing record values still require the Phase 4
read-only comparison; local synthetic results do not establish a live impact
count or certify hosted concurrent sessions.
