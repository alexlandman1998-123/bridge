# Tomorrow Morning Phase 7: Mandate Signing Dispatch

Phase 7 moves the generated mandate PDF into the signing workflow without skipping the required agent-first sequence.

## What is live

- The launch mandate packet is now in `sent` state with signing status `sent_to_agent`.
- The generated Phase 6 PDF version is bound to a verified signing envelope.
- Agent and seller signer rows are bound to the generated PDF version.
- The applied visual signing layout has one required agent signature block and one required seller signature block.
- The agent has a secure signing token and signing link.
- The seller is queued as `ready_to_send` with no seller token yet.
- The E4 dispatch is marked `delivered` with staging delivery evidence.
- H4 public signer-surface diagnostics pass with no invalid tokens, missing fields, or unscoped ambiguous fields.

## Live evidence

- Project ref: `isdowlnollckzvltkasn`
- Organisation: `Kingstons Real Estate` (`ec19d0a6-bcba-4eef-aa72-9972de88204d`)
- Listing: `0091d90c-83d9-41f2-b458-e55b4878184f`
- Mandate packet: `575b5e18-f6b4-45e1-a99a-4ee1c388ebb6`
- Packet status: `sent`
- Signing status: `sent_to_agent`
- Generated version: `d5a4d7e5-3736-42d7-a116-7a45be23e75b`
- Rendered document record: `e23c8494-428b-49e3-88ce-bc39ab8177dd`
- Signing layout: `6a43d5bf-d741-46d5-941c-4ec97ab9a541`
- Dispatch: `839f977d-9cfc-4ef8-890e-f48a88865665`
- Agent signer: `d4da71e6-0627-4144-a4fd-a827d6de2b4c`
- Seller signer: `9b1987ad-bfbd-4a01-81b6-a02105d8c163`

## Verification

Run:

```sh
npm --prefix the-it-guy run verify:launch-mandate-signing-dispatch
```

Expected result:

```json
{
  "status": "MANDATE_SIGNING_DISPATCH_READY",
  "packet": {
    "status": "sent",
    "signingStatus": "sent_to_agent"
  },
  "envelope": {
    "placementVerified": true,
    "appliedFieldCount": 2,
    "signerStatuses": {
      "agent": "sent",
      "seller": "ready_to_send"
    }
  },
  "dispatch": {
    "status": "delivered",
    "targetSignerRole": "agent"
  },
  "publicSurface": {
    "publicSurfaceReady": true
  }
}
```

## Operational note

Phase 7 intentionally does not issue the seller signing token. The mandate workflow blocks seller-side signing until the agency representative has signed first. The next phase should complete the agent signing session and then issue the seller signing link.
