# Attorney coordination Phase 6 — staging end-to-end acceptance

Phase 6 is the release-evidence boundary. Its default checker is read-only and refuses any target that is not positively identified as staging.

The walkthrough uses one transaction and three distinct, genuinely assigned users: transfer, bond and cancellation attorneys. It proves firm nomination/allocation, direct lane progression, controlled delegation, delegated action propagation, revocation and expiry denial, client visibility isolation, attribution integrity, and desktop/mobile/keyboard usability.

Copy `docs/attorney-coordination-phase6-evidence.example.json` to `output/attorney-coordination/phase6-evidence.json`, populate every scenario with a `passed` status and a concrete evidence reference, then run:

```bash
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
SUPABASE_STAGING_PROJECT_REF=... \
VITE_PRODUCTION_SUPABASE_PROJECT_REF=... \
ATTORNEY_RELEASE_ENVIRONMENT=staging \
npm run check:attorney-coordination-phase6
```

`BLOCKED` means the staging target or Phase 3–4 database foundation is unavailable. `READY_TO_RUN` means the schema is ready but evidence has not been supplied. `FAILED` means the walkthrough exposed a gap. Only `PASSED` is Phase 6 complete; source-level tests alone cannot produce that result.
