# Tomorrow Morning Phase 6: Mandate Generation

Phase 6 proves the launch listing can generate a governed mandate PDF from the Phase 5 packet and expose the generated mandate through the seller portal path.

## What is live

- The launch listing `PHASE3-LAUNCH-SELLER-ONBOARDING` has a generated mandate packet.
- The mandate packet uses an organisation-scoped, approved native structured mandate template.
- The native template has 16 renderable sections copied from the global starter.
- The generated PDF is stored in the `documents` bucket.
- The generated version passed the C4/D1/D2/D3/D4 certification chain.
- The seller portal payload resolves the generated mandate packet.
- The `generate-mandate` edge function now has a deterministic native-PDF fallback when `GOTENBERG_URL` is not configured; Gotenberg is still used automatically when configured.

## Live evidence

- Project ref: `isdowlnollckzvltkasn`
- Organisation: `Kingstons Real Estate` (`ec19d0a6-bcba-4eef-aa72-9972de88204d`)
- Listing: `0091d90c-83d9-41f2-b458-e55b4878184f`
- Listing status: `mandate_ready`
- Mandate status: `generated`
- Mandate packet: `575b5e18-f6b4-45e1-a99a-4ee1c388ebb6`
- Approved launch template: `bbc7898f-566f-441b-abad-11787946505b`
- Template key: `mandate_default_v1_phase6_launch_v2`
- Template version: `v2-phase6-v2`
- Generated version: `d5a4d7e5-3736-42d7-a116-7a45be23e75b`
- Rendered document record: `e23c8494-428b-49e3-88ce-bc39ab8177dd`
- PDF path: `packet-575b5e18-f6b4-45e1-a99a-4ee1c388ebb6/mandate-documents/phase-6-launch-mandate-85163777-b0df-4806-b5f7-7104e82bd94a.pdf`
- PDF sha256: `sha256:06e2b0cb8cd591ccc4984d3b164efabc2e8a16976416a474cee10b7f89544e7b`
- PDF bytes: `7858`

## Verification

Run:

```sh
npm --prefix the-it-guy run verify:launch-mandate-generation
```

Expected result:

```json
{
  "status": "MANDATE_GENERATION_READY",
  "listing": {
    "status": "mandate_ready",
    "mandateStatus": "generated"
  },
  "packet": {
    "status": "generated",
    "currentVersionNumber": 2
  },
  "generatedVersion": {
    "renderStatus": "generated",
    "source": "phase_6_launch_mandate_generation"
  },
  "certification": {
    "d4Authorized": true,
    "mediaType": "application/pdf"
  },
  "portalVerification": {
    "mandatePacketResolved": true
  }
}
```

## Runtime repair

Two live blockers were removed:

- the launch-scoped template was originally created as a published revision before its section rows existed, which left it immutable and empty;
- native PDF rendering failed when `GOTENBERG_URL` was absent.

The Phase 6 verifier now creates the launch template as a draft, copies section rows from the global native template, records approval metadata, then publishes the revision. The deployed `generate-mandate` function uses the configured Gotenberg converter when available and otherwise produces a deterministic native PDF from the frozen structured sections.
