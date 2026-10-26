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

## Verified production receipt

Source commit: `fc784f654af9f34de7f9cf6764d60e8d6941ed54`, published on GitHub branch `codex/mobile-production-20261020`.

The isolated full `npm run check:app` passed: lint (zero errors, 635 existing warnings), established nine-service baseline, production build and login probe. All 207 focused tests across 23 files passed. Scoped App lint and whitespace checks passed. No environment, generated, website, admin or database source paths were included in the mobile commit; no literal private credentials were found in added source.

Final deployment `dpl_Gme5tE8j2rMe2nx64JdgzypwytjA` (`bridge-hsxis6kta-alexs-projects-f5496a21.vercel.app`) is Ready and promoted to https://app.arch9.co.za. Vercel passed its unchanged bundle, operational packaging and schema compatibility gates. The candidate and live browser both served `/assets/index-Dky6lWbM.js` and the exact source commit in the `arch9-release` HTML marker. The live sign-in screen completed loading with no captured console errors. No hosted authenticated save or outbound delivery canary was performed.

A first healthy candidate without a source release marker was never promoted. A duplicate Git-triggered preview from the same release branch was cancelled to free the build queue. The promoted candidate uses the exact source SHA as its build-time release identifier; existing production environment settings are unchanged.

The prior production deployment `dpl_91ajhWWpKGNu8YW3rcMinDHJQAb1` remains retained for an authorised rollback. No database or Edge Function change was applied. The shared active checkout and unrelated work are preserved.
