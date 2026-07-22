# Tomorrow Morning Phase 8: Agent Signing And Seller Dispatch

Phase 8 proves the mandate can move past agent-first signing and land with the seller for signature without manual database intervention.

## What is live

- The launch mandate packet is now `partially_signed`.
- The packet signing status is `sent_to_seller`.
- The agent signer completed the required signature field through the public signer action flow.
- The seller signing dispatch is delivered after agent completion.
- The seller signer has a valid tokenized `/sign/[verified-token]` path that resolves through the signer-token edge function.
- The seller onboarding portal still resolves the mandate packet for the listing.
- The verifier is idempotent and does not expose the raw seller signing token in console output.

## Live evidence

- Project ref: `isdowlnollckzvltkasn`
- Organisation: `Kingstons Real Estate` (`ec19d0a6-bcba-4eef-aa72-9972de88204d`)
- Listing: `0091d90c-83d9-41f2-b458-e55b4878184f`
- Listing reference: `PHASE3-LAUNCH-SELLER-ONBOARDING`
- Mandate packet: `575b5e18-f6b4-45e1-a99a-4ee1c388ebb6`
- Packet status: `partially_signed`
- Signing status: `sent_to_seller`
- Generated version: `d5a4d7e5-3736-42d7-a116-7a45be23e75b`
- Rendered document record: `e23c8494-428b-49e3-88ce-bc39ab8177dd`
- Agent signer: `d4da71e6-0627-4144-a4fd-a827d6de2b4c`
- Agent signature field: `39831fb4-ce03-4660-9c2d-7e27200e2a11`
- Agent signed at: `2026-07-20T21:56:35.065+00:00`
- Seller signer: `9b1987ad-bfbd-4a01-81b6-a02105d8c163`
- Seller dispatch: `432292f6-a470-469a-b0be-bee81712efb3`
- Seller token expiry: `2026-07-27T21:56:35.307+00:00`

## Verification

Run:

```sh
npm --prefix the-it-guy run verify:launch-mandate-seller-dispatch
```

Expected result:

```json
{
  "status": "MANDATE_SELLER_DISPATCH_READY",
  "packet": {
    "status": "partially_signed",
    "signingStatus": "sent_to_seller",
    "lastSigningRecipientRole": "seller"
  },
  "agentSigning": {
    "status": "signed",
    "alreadySigned": true
  },
  "sellerDispatch": {
    "status": "delivered",
    "targetSignerRole": "seller"
  },
  "sellerSigning": {
    "status": "viewed",
    "tokenFormatValid": true,
    "signingPath": "/sign/[verified-token]",
    "fallbackIssued": false,
    "resolveSucceeded": true
  },
  "portalVerification": {
    "mandatePacketResolved": true
  }
}
```

## Operational note

The seller portal RPC currently resolves the mandate packet but does not expose a `signPath` field in its payload. Phase 8 verifies the actual signing route through the public `/sign/:token` surface by resolving the seller token with `resolve-signer-token`; that is the signer action path the seller uses.
