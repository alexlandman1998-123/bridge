// Arch9 tracks the originator's external workflow; signing is disabled.
export function getBondSubmissionReleaseGate() {
  return {
    version: 'bond-originator-tracker-2026-11-08-v1',
    mode: 'originator_tracker',
    ready: true,
    signingEnabled: false,
    statementServiceRequired: false,
    methods: { manual_tracking: true, wet_ink_upload: false, online: false },
    blockers: [],
  }
}
