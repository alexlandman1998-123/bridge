# OTP Phase 6: controlled rollout

Phase 6 turns the governed OTP work into a visible, reversible rollout instead of replacing the live template without context.

## Rollout candidate

When an organisation has both a live OTP and a review draft, Bridge treats the newest draft as the rollout candidate. The current default remains live until an authorised publisher explicitly activates the candidate.

The OTP overview shows six readiness stages:

1. **Document structure** — a standard legal core and signing section exist.
2. **Clause wording** — all 23 conditional packs contain wording.
3. **Legal approval** — required legal sections are approved and locked.
4. **Runtime enforcement** — the supported Phase 4 contract is configured.
5. **Reference certification** — the Phase 5 matrix passes for the exact current template fingerprint.
6. **Live activation** — the published template is active, default and selectable for signing.

The overview links directly to the candidate rather than sending the user back into an ambiguous template list.

## Approval aggregation

When every clause is approved and locked and the current reference matrix passes, saving the OTP records a template-level approval source derived from that governed evidence. If either condition later fails, the derived approval is removed.

This closes the gap where a published template could contain approved sections but still be rejected by template-level runtime governance.

## Controlled activation

Activation remains an explicit user action. On activation Bridge records:

- the rollout contract version;
- activated template ID and label;
- activation timestamp;
- certification key and template fingerprint; and
- the previous live template ID and label.

The prior template is removed as the default but remains recorded as the rollback anchor. Phase 6 does not automatically deploy or activate any template.

## Statuses

- `missing` — no candidate exists.
- `preparing_candidate` — one or more readiness stages remain.
- `ready_for_activation` — the candidate is certified and may be published.
- `live_legacy` — an older non-governed OTP remains live.
- `live_blocked` — the live governed template no longer satisfies release checks.
- `live_governed` — the governed OTP is live and selectable for signing.

## Verification

```bash
npm run test:otp-rollout-phase6
npm run test:otp-certification-phase5
npm run test:otp-runtime-phase4
npm run test:otp-governance-phase3
npm run test:otp-composition-phase2
npm run test:otp-legal-baseline
npm run build
```
