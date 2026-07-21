# Tomorrow Morning Phase 9: Mandate Completion

Phase 9 proves the launch mandate can be fully signed, finalised, attached to a transaction context, and exposed back to the seller portal.

## What is live

- Both required mandate signers are `signed`.
- The mandate packet is `completed`.
- The final signed PDF has immutable F2 artifact evidence.
- The launch listing is linked to an idempotent transaction record.
- F3 transaction publication is complete.
- F4 completion receipt is complete.
- Seller portal publication evidence is complete.
- The seller portal resolves the mandate as `fully_signed`.
- The verifier closes older already-signed controlled signer sessions before finalisation, which heals stale Phase 7/8 signer-session state.

## Live evidence

- Project ref: `isdowlnollckzvltkasn`
- Organisation: `Kingstons Real Estate` (`ec19d0a6-bcba-4eef-aa72-9972de88204d`)
- Listing: `0091d90c-83d9-41f2-b458-e55b4878184f`
- Listing reference: `PHASE3-LAUNCH-SELLER-ONBOARDING`
- Mandate packet: `575b5e18-f6b4-45e1-a99a-4ee1c388ebb6`
- Packet status: `completed`
- Signing status: `completed`
- Transaction: `26f10c15-99f8-463a-8085-ee0ee9e830db`
- Transaction reference: `PHASE9-PHASE3-LAUNCH-SELLER-ONBOARDING`
- Generated version: `d5a4d7e5-3736-42d7-a116-7a45be23e75b`
- Final signed document: `781b169f-3aa9-4d4e-bb61-86d0034a6bf7`
- Final signed file: `mandate-v2-final-signed.pdf`
- Final artifact sha256: `40b1dd002ded7cd91adc4817979fa3f86d78b873f9749384e2f93b8589412f67`
- Final artifact bytes: `8288`
- Agent signer: `d4da71e6-0627-4144-a4fd-a827d6de2b4c`
- Seller signer: `9b1987ad-bfbd-4a01-81b6-a02105d8c163`
- Seller signed at: `2026-07-20T22:02:02.15+00:00`
- Finalised at: `2026-07-20T22:06:34.471+00:00`

## Runtime fixes applied

- `signer-signing-action` now uses service-role auth when invoking final signed document generation.
- `signer-signing-action` now returns nested finaliser details when finalisation fails.
- `generate-final-signed-document` now serialises thrown Supabase errors instead of returning `[object Object]`.
- `dispatch-final-signed-document` and `retry-final-document-completion` are deployed in the launch project.
- F3 final transaction publication now writes the accepted document status `approved`.

## Verification

Run:

```sh
npm --prefix the-it-guy run verify:launch-mandate-completion
```

Expected result:

```json
{
  "status": "MANDATE_COMPLETION_READY",
  "packet": {
    "status": "completed",
    "signingStatus": "completed"
  },
  "transaction": {
    "id": "26f10c15-99f8-463a-8085-ee0ee9e830db"
  },
  "finalArtifact": {
    "evidenceReady": true
  },
  "publication": {
    "transactionPublicationReady": true,
    "completionReceiptReady": true,
    "portalPublicationReady": true,
    "portalSurface": "seller_portal"
  },
  "portalVerification": {
    "mandatePacketResolved": true,
    "mandatePacketState": "fully_signed"
  },
  "blockers": []
}
```

## Operational note

The verifier intentionally does not print tokenized signing URLs or final signed download URLs. Final signed email delivery is tracked separately from the hard launch gate; Phase 9 requires the signed packet, final artifact, transaction publication, completion receipt, and seller portal publication.
