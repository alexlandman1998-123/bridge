# Signing workflow inventory

This Phase 1 inventory maps each executable signing surface to the Phase 0 classification register. It prevents a new electronic dispatch or completion path from being treated as routine feature work.

The machine-readable inventory is [signingWorkflowInventory.js](../src/core/documents/signingWorkflowInventory.js). A workflow must be present in both registers before implementation. Electronic dispatch and completion remain blocked unless legal counsel adds a reviewed approval reference and date.

| Workflow | Current state | Primary surfaces |
| --- | --- | --- |
| Seller mandate | Physical available; separate portal route implemented, release gated | Listing detail, agency pipeline, seller document signer page and function; retired signing function stays disabled |
| Seller mandatory disclosure / defects form | Physical available; separate portal route implemented, release gated | Seller onboarding, seller portal Documents, seller document signer page and function |
| Seller FICA declaration | Physical available; separate portal route implemented, release gated | Post-onboarding drafts, seller portal Documents, seller document signer page and function |
| Offer to purchase | Frozen pending legal review | Legal Document Workspace, packet workflow, Signer Portal |
| Legal document packet | Frozen pending legal review | Legal Document Workspace, template settings, final-document resolver |
| Rental lease | Frozen pending legal review | Rental lease panel and repository |
| Buyer onboarding | Acknowledgement only | Buyer and mobile onboarding |
| Seller onboarding | Acknowledgement only | Seller onboarding and lifecycle model |
| Legacy combined seller FICA / disclosure | Frozen pending legal review | Formal pack dispatch and snapshot model |

When a new signing-related surface is proposed, add it to this inventory, add its legal classification, and obtain the Phase 0 decision before coding electronic dispatch or completion. The new seller route remains unavailable until its client and server release flags are enabled after verification; this inventory entry does not enable it.
