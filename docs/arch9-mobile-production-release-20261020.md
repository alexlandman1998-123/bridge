# Arch9 mobile production release — 20 October 2026

The requester explicitly approved production publication of this chat’s mobile updates.

## Scope

Only the primary workspace (`bridge`, `app.arch9.co.za`) is released. The candidate starts from `cde6ead3d`, the retained receipt for the currently deployed 19 October source `17b4b3534`, and includes the home, leads, lead journey actions, shared capture forms, appointment creation entry and contact QR sheet changes requested in this chat. Production-only access controls, seller document protections and other recent fixes are retained. Calendar reconciliation, website, admin, database migrations and Edge Function changes outside this chat are excluded.

The shared active checkout is not staged, reset or committed. The reviewed candidate is retained in the attached `codex/mobile-production-20261020` worktree.

## Preflight

- Production project: `bridge`, `prj_rbfXykMU6mU1eECbc0lJS9sPspmp`, team `team_ezJ5RCE7qwTf14fw215IhPs5`, root directory `the-it-guy`.
- Previous Ready production deployment retained for rollback: `dpl_91ajhWWpKGNu8YW3rcMinDHJQAb1` (`bridge-pn312lz3d-alexs-projects-f5496a21.vercel.app`).
- Read-only Supabase guard passed; no duplicate migration timestamps. Production recovery check returned `RECOVERY_LOCKED`.
- No database push, migration repair, Edge Function publication, email or customer-record mutation is part of this release.
- Existing production mobile shell and mobile login redirect flags are enabled. No environment setting was changed.
- All 207 focused tests passed across 23 files, covering home data, checklists/contact progress, source/qualification cards, lead journey, capture forms, appointment creation and QR/menu handling.

## Practical limits

Task creation still uses the existing local draft workflow. Connect with me requires an active agent public digital card and does not activate or publish a missing card. Automated checks do not certify a new hosted save, upload or outbound-delivery canary; no real customer lead or appointment is created for release verification.

## Publication

Full app checks and staged production build verification are recorded below when complete. The previous deployment remains available for rollback.
