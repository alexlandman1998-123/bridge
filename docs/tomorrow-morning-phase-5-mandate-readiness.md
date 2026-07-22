# Tomorrow Morning Phase 5: Mandate Readiness

Phase 5 makes the completed seller-onboarding path mandate-ready for the launch listing.

## What is live

- The launch listing `PHASE3-LAUNCH-SELLER-ONBOARDING` is linked to a mandate packet.
- Completed seller onboarding maps into mandate generation data with no missing required fields.
- The accepted transfer attorney, Young Law Inc, is carried into the mandate context.
- Seller and agent signer rows are staged against the mandate draft.
- The seller portal payload resolves the mandate packet and accepted attorney context.
- The runtime actor can create the packet through the normal authenticated client path as an `agent`.

## Live evidence

- Project ref: `isdowlnollckzvltkasn`
- Organisation: `Kingstons Real Estate` (`ec19d0a6-bcba-4eef-aa72-9972de88204d`)
- Listing: `0091d90c-83d9-41f2-b458-e55b4878184f`
- Listing status: `mandate_ready`
- Mandate status: `ready`
- Mandate packet: `575b5e18-f6b4-45e1-a99a-4ee1c388ebb6`
- Draft version: `10061328-4f12-4fea-891e-1fc882c6f598`
- Transfer-attorney allocation: `c2360bb4-a936-466b-a44d-4ddb47b78958`
- Transfer-attorney role configuration: `bc5054e9-039e-45b1-be48-5cf873c9d32c`
- Seller signer: `57e4e2d2-7bcc-41bb-907f-61ddf370ea4e`
- Agent signer: `1f25e967-b7ea-466c-a6a3-19d912d21f7d`

## Verification

Run:

```sh
npm --prefix the-it-guy run verify:launch-mandate-readiness
```

Expected result:

```json
{
  "status": "MANDATE_READINESS_READY",
  "listing": {
    "status": "mandate_ready",
    "mandateStatus": "ready"
  },
  "packet": {
    "status": "ready_for_generation",
    "currentVersionNumber": 1,
    "renderStatus": "draft"
  },
  "portalVerification": {
    "mandatePacketResolved": true,
    "acceptedAttorneyResolved": true
  }
}
```

## Policy repair

The live blocker was authenticated `document_packets.insert(...).select()` failing RLS during `INSERT RETURNING`.

Migration `202607200012_phase5_launch_packet_authority.sql` restores least-privilege packet authority:

- active members may create packets assigned to or created by themselves;
- organisation admins may manage organisation packets;
- direct packet SELECT authority allows the created row to be returned by the normal app client;
- child packet tables inherit parent packet authority.
