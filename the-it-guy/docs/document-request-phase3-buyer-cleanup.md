# Document Request Phase 3: Buyer-Side Cleanup

## Status

Implemented as a buyer canonical cleanup service, portal filter, and read-only gate.

Phase 3 keeps the legacy buyer engine available as a fallback, but it makes the buyer upload surface canonical. Buyer upload requests should come from buyer-owned, client-visible canonical requirements.

## Command

```bash
npm run verify:document-request-phase3-buyer-cleanup
```

This runs Phases 0-2, the buyer cleanup contract, and writes:

```bash
output/document-request-phase3-buyer-cleanup.json
```

The report is read-only:

```json
{
  "commit": false,
  "mutatedData": false
}
```

## Behaviour Now Enforced

- Buyer legacy rows must resolve to known canonical document keys.
- Buyer portal upload rows are filtered against canonical visibility and ownership.
- OTP and transfer documents are classified as professional/generated transaction documents, not buyer upload requests.
- Pending-policy rows, such as beneficial ownership and buyer ANC, remain tracked but not requestable by default.
- The canonical buyer plan fills buyer-policy gaps that legacy upload rows do not represent one-to-one, such as marital/source-of-funds declarations.
- Buyer containers are built through the Phase 2 shared container model.

## Scenario Coverage

The Phase 3 audit covers:

- individual cash buyer
- individual bond buyer
- hybrid self-employed buyer
- married in community buyer
- married out of community/ANC buyer
- foreign cash buyer
- company bond buyer
- trust bond buyer

## Known Warnings

The gate currently allows warnings because the legacy buyer profile still emits some professional/generated rows. That fallback remains intentional until migration and rollout remove legacy generation.

Warnings are expected for:

- `signed_otp`
- `transfer_documents`
- canonical-only buyer policy rows covered by portal overlay
- pending-policy rows waiting for legal/product signoff

## Exit Criteria

Phase 3 is complete when:

- all buyer legacy rows map to canonical keys
- buyer upload rows are filtered to buyer-owned, client-visible requirements
- professional/generated rows are not presented as buyer upload requests
- buyer request containers resolve through the Phase 2 model
- the report has zero unmapped buyer requirements

The next implementation phase is Phase 4: bond document model.
