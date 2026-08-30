# Phase 4 Preview acceptance — 30 August 2026

## Immutable Preview candidate

| Field | Value |
| --- | --- |
| Deployment | `dpl_F24eqnicuHEWy3Tm2kwo8SXELwtc` |
| Preview URL | `https://bridge-ik8ez7o0e-alexs-projects-f5496a21.vercel.app` |
| Branch | `release/production-stabilization-20260830` |
| Commit | `aa2adbcb` (`fix: stabilise auth and route loading shells`) |
| Vercel build | Passed, 2026-08-30 15:14 SAST |
| Production alias | Unchanged |

Vercel built this candidate with Node 22 from `package.json`. The linked project
setting still says Node 24.x and should be corrected later, but it did not block
this Preview build.

## Acceptance status

The Preview is protected by Vercel SSO. Anonymous browser access correctly
stopped at the Vercel sign-in screen, so no production or app credentials were
entered and no access control was relaxed.

| Check | Status |
| --- | --- |
| Immutable Preview created from release commit | Passed |
| Vercel production build | Passed |
| Production alias unchanged | Passed |
| Anonymous entry does not show an app blank/error page | Passed (Vercel SSO gate) |
| Logged-in cold-load acceptance path | Pending Vercel SSO access |

## Logged-in acceptance path

After signing in to the Preview through Vercel SSO, validate the following on
this exact URL before any promotion:

```text
Cold load
  → Dashboard
  → Transactions
  → Transaction detail
  → Leads
  → Lead workspace
  → Documents
  → Upload document
```

For each route, test normal click, fast click, browser back/forward, and refresh.
Reject the candidate if there is a blank page, route-shell swap, forced `/auth`
redirect during an active session, or a console/runtime error.
