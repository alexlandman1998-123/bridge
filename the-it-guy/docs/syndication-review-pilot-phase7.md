# Syndication Review Pilot: Phase 7

Phase 7 scopes the review rollout to individual portals for each opted-in organisation.

Set the existing global and organisation values from Phase 1, then optionally set:

```text
ARCH9_SYNDICATION_REVIEW_PILOT_CHANNELS=private-property
```

Accepted channel values are `private-property` and `property24`, separated by commas. When the value is omitted, an already opted-in organisation retains the Phase 6 behaviour for both channels. This preserves backward compatibility while allowing a new pilot to prove Private Property before enabling Property24.

This configuration changes only whether Arch9 requires the review workflow. Portal configuration, credentials, payload validation, and the actual publish request remain server-side and unchanged.
