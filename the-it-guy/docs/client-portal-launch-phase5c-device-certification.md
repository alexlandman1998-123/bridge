# Client portal launch — Phase 5C physical-device certification

## Outcome

Phase 5C binds physical iOS and Android testing to the immutable Phase 5B preview candidate. Desktop emulation does not satisfy this gate. Both buyer and seller journeys must pass on a real iPhone using Safari and a real Android phone using Chrome.

## Test procedure

1. Open the candidate URL on the physical device and complete Vercel Authentication.
2. Test the buyer and seller routes recorded in the certification packet.
3. Exercise every item in `requiredChecks`, including navigation, documents, journey information, support actions, offline recovery, rotation, safe areas, text scaling, and overflow.
4. Record the exact device, OS, browser version, tester, timestamp, immutable evidence URL, and persona results.
5. Run the certification report and then its enforced form.

Evidence must not include portal tokens, client identifiers, contact details, transaction information, or authentication material. Screenshots and recordings should use the supplied demo routes only.

## Commands

```bash
npm run test:client-portal-launch-phase5c
npm run report:client-portal-launch-phase5c
npm run gate:client-portal-launch-phase5c
```

The final command returns non-zero until both platforms have complete evidence and both personas are marked `passed`. Only then may the matching physical-device section in the Phase 5 evidence file be promoted from `pending` to `passed`.
