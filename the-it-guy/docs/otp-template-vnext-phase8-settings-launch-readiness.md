# OTP Template vNext Phase 8 Settings Launch Readiness UI

Generated: 2026-08-03T00:00:00.000Z
Status: OTP_SETTINGS_LAUNCH_READINESS_READY_FOR_RUNTIME_LOCK

## What Changed

Phase 8 promotes OTP Settings from routing coverage to launch readiness.

- Settings now computes an OTP content gate for the selected OTP template.
- Settings persists the latest OTP content scan metadata on save/publish.
- OTP save/publish paths now block activation when the OTP content scanner reports blockers.
- The OTP Settings view now shows a launch-readiness panel after routing coverage.
- The panel surfaces route readiness, launch blockers, unsafe fallback count, source-owner gaps, stale/unverified scans, and blank-render risk.
- The publish dialog now labels OTP content blockers as OTP Scan rather than Mandate Scan.

## Launch Blockers Surfaced

- Missing resale/existing-property route template.
- Missing new-development route template.
- Live route template blocked by OTP content gate.
- Stale or missing persisted OTP scan.
- Broad fallback that would be used while first-class routes are missing.
- Blank-render risk from missing render validation or unloaded content.
- Missing source-owner metadata for field-bearing sections.

## Verification

- `npm run test:otp-settings-launch-readiness-phase8`
- `npm run verify:otp-template-vnext`
- `npx eslint src/pages/settings/SettingsSigningTemplatesPage.jsx src/core/documents/otpTemplateLaunchReadiness.js scripts/otp-settings-launch-readiness-phase8.test.mjs`
- `node scripts/document-merge-field-registry.test.mjs`
- `npm run verify:otp-chapter1`
- `git diff --check`

## Boundary

Phase 8 does not replace the later runtime lock. It makes OTP launch readiness visible and enforceable in Settings so administrators can see why automation is locked before runtime enforcement is added.
