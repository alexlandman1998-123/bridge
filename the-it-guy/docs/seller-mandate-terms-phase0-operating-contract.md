# Seller Mandate Terms Phase 0 Operating Contract

## Outcome

Phase 0 freezes the decisions needed to add one combined seller terms document,
acknowledgements, a primary document contact, and safe document replacement in
later phases. It introduces no runtime behaviour, database schema, legal text
activation, signing requirement, email, or deployment.

The machine-readable decision source is
[`config/seller-mandate-terms-phase0-decision-matrix.json`](../config/seller-mandate-terms-phase0-decision-matrix.json).

## Chosen operating model

The default future workflow is hybrid:

1. The agent pre-fills the seller and property information already held by the agency.
2. One nominated primary document contact completes or corrects shared facts.
3. The signing pack freezes.
4. Every required signer reviews that same frozen pack, makes their own required acknowledgements, and signs separately.

The primary contact coordinates shared facts; they do not gain authority to sign
for another seller. A secondary signer can confirm and sign, or flag an issue.
Flagging an issue must stop completion until a replacement pack is prepared.

## Change-control decision

Drafts may be edited. Sent, partially signed, and completed packs must never be
edited in place. A material change creates a replacement version, records the
reason and initiator, invalidates open signing sessions, and retains the prior
pack as superseded evidence.

Material changes are seller/signatory identity or authority, material property
details, commercial mandate terms, selected transfer attorney, and the approved
terms/notice version.

## Combined document boundary

The proposed title is **Seller Mandate Terms, Privacy & Electronic Signing
Notice**. It will contain the mandate terms, a privacy notice summary, PAIA
access information, electronic-signing and communications terms, records and
audit-trail terms, a conditional transfer-attorney clause, and a clearly
separate optional marketing preference section.

The document is not approved wording yet. Each agency must supply an approved
effective version, privacy-notice link, PAIA Manual link, and Information
Officer details. The exact version and content must be frozen into every later
signing pack.

## Acknowledgement policy

Required acknowledgements will be compact rather than a collection of separate
legal documents:

- terms acceptance;
- accuracy and authority;
- privacy/PAIA notice availability;
- electronic communications and signing;
- secondary-signer shared-information review, where applicable;
- proposed transfer-attorney acknowledgement, where applicable.

Marketing is never a required acknowledgement, cannot be bundled into mandatory
terms, and defaults to unticked.

## Counsel gate

No later phase may activate new seller terms or acknowledgements until counsel
has approved the agency-specific wording, lawful processing basis, PAIA and
Information Officer details, electronic-signature route, authority-evidence
rules, proposed-attorney clause, and optional marketing wording.

The existing seller-compliance approval model remains the approval authority:
`src/core/documents/sellerCompliancePolicy.js`. This contract adds the product
decisions that future phases must implement; it does not replace that model.

## Verification

Run:

```bash
npm run test:seller-mandate-terms-phase0
```
