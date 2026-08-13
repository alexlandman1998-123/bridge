# Document Request Phase 12: Seller Compliance Cleanup

Phase 12 cleans up seller compliance and VAT upload ownership.

## Scope

- Seller compliance certificates are seller-owned uploads.
- Agents can upload these documents on behalf of the seller.
- VAT status confirmation is seller-owned and seller/client visible.
- Seller external upload rows are accepted as upload-only decisions, not legal wording sign-off work.
- Acquisition and capital-improvement records remain outside canonical request policy.

## Seller External Upload Keys

- `electrical_compliance_certificate`
- `gas_compliance_certificate`
- `electric_fence_certificate`
- `water_installation_certificate`
- `beetle_certificate`
- `solar_compliance_documents`
- `approved_building_plans`
- `occupation_certificate`
- `vat_status_confirmation`

## Out Of Scope

- No document generator changes.
- No OTP, mandate, or legal pack generation changes.
- No legal wording changes.
- No broad parent/child container splitting; that remains Phase 13.

## Gate

Run:

```sh
npm run verify:document-request-phase12-seller-compliance-cleanup
```

The report is written to:

```text
output/document-request-phase12-seller-compliance-cleanup.json
```
