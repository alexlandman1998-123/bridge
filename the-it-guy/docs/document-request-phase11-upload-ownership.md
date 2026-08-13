# Document Request Phase 11: Upload Ownership

Phase 11 defines who is responsible for uploading each canonical document.

## Scope

- Add one upload ownership model for canonical document requests.
- Attach ownership metadata to request containers.
- Allow agent uploads on behalf of buyer/seller-owned documents.
- Mark professional-only documents as professional upload work, not client upload debt.
- Keep bond documents buyer-owned while allowing bond-originator upload assistance.

## Out Of Scope

- No document generator work.
- No OTP, mandate, or legal pack generation changes.
- No legal/policy wording changes.
- No removal of legacy UI fallbacks.

## Rules

- Buyer-owned documents can be uploaded by the buyer or by the agent on behalf of the buyer.
- Seller-owned documents can be uploaded by the seller or by the agent on behalf of the seller.
- Seller external/compliance documents are seller-owned uploads.
- Attorney-owned documents are professional uploads.
- Bond-originator assistance is allowed for bond upload documents without changing buyer ownership.

## Gate

Run:

```sh
npm run verify:document-request-phase11-upload-ownership
```

The report is written to:

```text
output/document-request-phase11-upload-ownership.json
```

Phase 11 can pass with warnings because visibility cleanup for seller compliance/VAT rows is Phase 12 work.
