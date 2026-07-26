# Document Generator Final-Mile Phase 8

## Scope

Phase 8 is the operational go/no-go handover for the repaired final-mile document generator flow.

It consumes the Phase 7 production observation report and returns one fail-closed decision: `keep_live` or `pause_final_mile_and_investigate`.

## Runbook

Run the full production verification and handover gate from the app package:

```bash
npm run verify:document-generator-final-mile:production
```

The first command refreshes the Phase 7 production observation with `--allow-local-release-drift` so documentation and tooling commits do not invalidate the pinned production release check. The second command writes the Phase 8 decision report.

## Safety Notes

Phase 8 does not send email and does not invoke dispatch. It reads the redacted Phase 7 evidence and produces an operational decision only.

The only passing decision is `keep_live`. Any blocker returns `pause_final_mile_and_investigate`; in that case, preserve the Phase 7 observation report and do not retry final delivery until the named blocker is understood.

## Acceptance

Phase 8 is `GO` only when the live release is still `05f5f20d14ee3a6e1ef50b8c180b078cf28a7b77`, the Phase 7 observation is fresh and healthy, both pinned packets are `completed_everywhere`, final signed access returns redacted downloadable PDFs, lifecycle traces exist, and the no-email/no-dispatch controls are intact.
