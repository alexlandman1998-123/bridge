# Signing classification register

This register is the Phase 0 engineering control for signing workflows. It is not legal advice and does not itself approve electronic signing.

Every workflow must have a legal classification, named legal decision owner, approval reference, and approval date before an electronic-signature route can be enabled. Unclassified workflows fail closed.

The machine-readable register is maintained in `src/core/documents/signingClassificationPolicy.js`.

| Workflow | Current engineering treatment | Decision owner | Required decision |
| --- | --- | --- | --- |
| Seller mandate | Wet ink required | Legal counsel + seller-document operations | Confirm physical-signature evidence and retention standard. |
| Offer to purchase / addenda | Legal review required | Legal counsel + transaction operations | Classify execution form and downstream transaction rule. |
| Legal document packets / Signer Portal | Legal review required | Legal counsel + document-platform operations | Classify each packet type before any signature dispatch. |
| Rental lease | Legal review required | Legal counsel + rental operations | Classify lease execution and acknowledgement requirements. |
| Buyer onboarding | Acknowledgement only | Legal counsel + buyer-journey owner | Define wording and ensure it never purports to be a signature. |
| Seller onboarding | Acknowledgement only | Legal counsel + seller-document operations | Define wording and ensure it never purports to be a signature. |
| Seller FICA / disclosure | Legal review required | Legal counsel + compliance operations | Classify declaration, consent, and evidence requirements. |

No implementation phase may change a workflow to `electronic_signature_approved` without attaching the legal decision reference and date in a reviewed change.
