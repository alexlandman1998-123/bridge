# Workspace Branding Rollout — Phase 7

Phase 7 is a controlled, read-only rollout gate for the attorney workspace branding fix. It does not merge, delete, reactivate, or otherwise repair membership records.

## Staging sequence

1. Deploy `202607160020_workspace_branding_integrity_phase6.sql` to staging.
2. Run `npm run verify:workspace-branding-rollout:staging`.
3. Sign in as a platform administrator and open `/platform/diagnostics`.
4. Run **Workspace branding integrity** and review the release gate and repair preview.
5. Verify an attorney session renders its firm logo without switching to the Arch9 fallback.
6. Review `workspace_branding_image_failed` telemetry before expanding the rollout.

## Gate policy

- `missing_attorney_membership` blocks rollout.
- `inactive_attorney_membership` blocks rollout.
- `unbranded` is a warning and requires confirmation that the firm has intentionally not configured a logo.
- `healthy_overlap` is expected for attorney firms with mirrored organisation membership.
- `identity_normalized` is informational; both source records remain independently authorized.

## Repair policy

The Platform Diagnostics repair preview is advisory only. Membership repair requires a separately reviewed, firm-scoped operation. Do not copy roles between `organisation_users` and `attorney_firm_members`, because the roles have different authorization semantics.

## Rollback

The Phase 6 views are read-only and can remain deployed if the frontend rollout is reverted. Roll back the application release first. Do not delete membership rows or remove firm branding while investigating. Use Phase 5 telemetry and the Phase 7 integrity gate to identify the affected workspace source.
