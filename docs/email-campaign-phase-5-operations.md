# Arch9 Email Campaigns — Phase 5: Campaign operations

Phase 5 provides the controls needed to operate campaigns safely at agency scale.

## Included

- Server-side preflight before a campaign can be queued or scheduled.
- Preflight checks verified sender, active subscription category, organisation sending pause, and current eligible-audience count.
- Immediate or local-time scheduled launch control in the review step.
- Server-authorized duplicate and archive actions.
- Organisation-scoped campaign audit events for preflights, scheduling, cancellation, duplication and archiving.

## Guardrails

Preflight, archive and scheduling require sender-capable authority. Duplicate requires organisation membership but always creates a new draft—never a new send job. Scheduling still performs the existing immutable audience snapshot and all consent/suppression checks after preflight; preflight is a launch decision aid, not a bypass.

This remains source-only until the migration freeze is lifted.
