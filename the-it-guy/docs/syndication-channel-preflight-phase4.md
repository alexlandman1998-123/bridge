# Syndication channel preflight: Phase 4

Phase 4 adds a deterministic, server-side review model for the two listing
channels. It reads the shared facts introduced in Phase 2 and the compatible
onboarding values saved by Phase 3. It does not write a listing, call either
portal, change a publish button, or treat browser data as authority.

`buildSyndicationChannelPreflight` returns separate Private Property and
Property24 results. Each result includes the channel-ready mapping, warnings,
and blockers. Property24 uses the existing category contract, so commercial,
industrial, farm/agricultural and land listings remain blocked until their
official mapping contracts are verified. It also blocks non-monthly rentals,
Offers From, Negotiable, auction and tender cases that do not have a verified
Property24 representation.

Private Property can remain ready when its own supported mapping is complete.
For example, a weekly rental is valid for Private Property but deliberately
blocked for Property24. The response always states that channel configuration,
credentials, agent mapping, and final validation remain server-side checks at
submission time.

The review rollout is still disabled by default. Phase 5 can display this
response in the publishing review without replacing the existing publish path.

## Verification

```bash
npm run test:syndication-channel-preflight-phase4
```
