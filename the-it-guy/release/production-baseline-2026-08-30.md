# Production baseline — 30 August 2026

## Purpose

This record freezes the known production state before the navigation and cold-load
stabilisation work is promoted. It is a rollback reference only; it does not
change an existing deployment or branch.

## Current production baseline

| Field | Value |
| --- | --- |
| Application | `https://app.arch9.co.za` |
| Vercel project | `bridge` (`prj_rbfXykMU6mU1eECbc0lJS9sPspmp`) |
| Deployment | `dpl_3DC89EfxrEVYiEBHErquxSgctuL2` |
| Source branch | `release/client-portal-mobile-launch` |
| Source commit | `00f78465e7328b8ea73f14caa58e462cd1095746` |
| Recorded | 2026-08-30, Africa/Johannesburg |

The prior main-branch production deployment is retained as an additional
rollback point:

| Field | Value |
| --- | --- |
| Deployment | `dpl_B8YU5UNGd59x2nbmigCbZKdCe6fk` |
| Source commit | `acb81f66` |

## Release freeze

Until a release candidate is explicitly approved, do not use `vercel --prod` or
promote an untested Preview deployment to `app.arch9.co.za`. Existing deployments
and branches must be retained; no history is to be rewritten or removed.

## Next gate

Phase 1 creates a dedicated release candidate from the current production source
commit above. All subsequent stability fixes must be validated on a Preview
deployment before that exact artifact is promoted.

## Phase 1 baseline verification

The dedicated local release branch is
`release/production-stabilization-20260830`, rooted at
`00f78465e7328b8ea73f14caa58e462cd1095746`.

The production build was attempted in an isolated, disposable worktree. It is
currently blocked before the application build for two environment/release
configuration issues that must be resolved in a later phase:

1. `npm ci` cannot install the baseline because `package-lock.json` is not in
   sync with `package.json` (`@emnapi/wasi-threads` resolves to a version that
   differs from the lockfile).
2. The local Vercel CLI rejects the linked project setting `nodeVersion: "24.x"`.
   Hosted Vercel builds are not blocked because `package.json` declares Node 22,
   which Vercel applies instead. The project setting should still be aligned to
   Node 22 in a controlled configuration change.

Neither issue was changed as part of the baseline freeze.
