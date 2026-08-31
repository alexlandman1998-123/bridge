# Developer document portal

## Purpose

The developer document portal is the external document-collection surface for a developer sale. It is separate from private-seller onboarding because the developer is an organisational seller supplying entity, authority, development, sale-pack, property and transfer records—not an individual seller completing a mandate journey.

## Access boundary

- One hashed bearer link is scoped to one developer-sale transaction.
- Links expire after 14 days by default, can be revoked, and a newly issued link revokes the previous active link for the same transaction and email.
- The portal returns development, unit and transaction labels; canonical developer/seller-side requirements; and documents uploaded through this portal.
- It never returns buyer details, buyer onboarding, finance terms, private-seller onboarding, comments, or transaction workflow controls.
- The bearer token cannot read the link table or update transaction/workflow rows directly.
- Storage writes are limited to `developer-document-portal/{link_id}/{transaction_id}/...`.

## Workflow

1. An authorised transaction operator selects **Send Developer Document Portal** on a developer sale.
2. Arch9 requires a developer representative email, creates a scoped link, and emails it using the transaction document-request template.
3. The portal reads canonical `transaction_document_requirements` assigned to the developer/seller side. Legacy `transaction_required_documents` rows are not used as the source of truth.
4. A developer can upload against a requirement or add another developer document.
5. Registration of the upload, canonical requirement status, canonical instance and legacy projection are updated in one database transaction.
6. Uploaded documents enter `under_review` when review is required; they are not marked verified automatically.

## Internal developer workspace

Authenticated developer users retain the full `/documents` workspace for reviewing and managing development and transaction documents. The external portal is intentionally upload-focused and cannot perform internal review or workflow actions.
