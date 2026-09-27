# Signing classification register

This register is the Phase 0 engineering control for signing workflows. It is not legal advice and does not itself approve electronic signing.

Every workflow must have a legal classification, named legal decision owner, approval reference, and approval date before an electronic-signature route can be enabled. Unclassified workflows fail closed.

The machine-readable register is maintained in `src/core/documents/signingClassificationPolicy.js`.

| Workflow | Current engineering treatment | Decision owner | Required decision |
| --- | --- | --- | --- |
| Seller mandate | Physical route available; separate portal route implemented and release gated | Legal counsel + seller-document operations | Recorded approval reference/date: `2026-09-27`; verify the legal decision record and complete the pilot before enabling dispatch. |
| Seller mandatory disclosure / defects form | Physical route available; separate portal route implemented and release gated | Legal counsel + seller-document operations | Recorded approval reference/date: `2026-09-27`; verify the prescribed form and pilot evidence before enabling dispatch. |
| Seller FICA declaration | Physical route available; separate portal route implemented and release gated | Legal counsel + compliance operations | Recorded approval reference/date: `2026-09-27`; verify declaration wording and pilot evidence before enabling dispatch. |
| Offer to purchase / addenda | Legal review required | Legal counsel + transaction operations | Classify execution form and downstream transaction rule. |
| Legal document packets / Signer Portal | Legal review required | Legal counsel + document-platform operations | Classify each packet type before any signature dispatch. |
| Rental lease | Legal review required | Legal counsel + rental operations | Classify lease execution and acknowledgement requirements. |
| Buyer onboarding | Acknowledgement only | Legal counsel + buyer-journey owner | Define wording and ensure it never purports to be a signature. |
| Seller onboarding | Acknowledgement only | Legal counsel + seller-document operations | Define wording and ensure it never purports to be a signature. |
| Legacy combined seller FICA / disclosure workflow | Legal review required | Legal counsel + compliance operations | Retain classification for historical records; new signing decisions are per document above. |

The requester supplied `2026-09-27` as both the approval reference and date for these three documents. Confirm that this is the intended legal decision identifier before release. No implementation phase may change another workflow to `electronic_signature_approved` without attaching its legal decision reference and date in a reviewed change.

The prospective seller-document contract is `src/core/documents/sellerDocumentSigningContract.js`. It covers the mandate, FICA declaration, and mandatory disclosure separately. Both `generate_download` and `send_for_signature` require an agent-reviewed, frozen version and known required signers; the mandate also requires confirmed commercial terms. A submitted onboarding form, downloaded copy, or sent link is not signature evidence. Only signed evidence for the same frozen version can move a document to `signed`, and an identified reviewer must record the final review. Portal dispatch remains disabled until each document has a recorded approval and a working delivery path. The offer to purchase is outside this contract.

Phase 2 freezes a SHA-256 content and signer version for each signing copy when the agent approves the seller pack. Disclosure and FICA use submitted onboarding facts; the mandate also includes the agent-confirmed commission, VAT treatment, asking price when captured, period when captured, and special conditions. The copies map to separate legal requirement rows and remain outstanding until signed evidence is reviewed. The reviewed version is stored with the onboarding form data for download and portal-signing routes. This client-side digest detects content drift; it is not server attestation or a signature. The portal route stores token hashes and append-only signature evidence separately; both client and server release flags default off. The retired mandate-signing service and OTP route remain disabled for these documents.
