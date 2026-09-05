# Phase 7 — Pull-request and release-gate reconciliation

Assessed 5 September 2026 against `origin/main`
`2c0d8b4154bbd307965fdfd67964a04e3c347a42`. This phase is read-only with
respect to GitHub and deployments: it does not merge, close, rebase, push, or
deploy any branch.

## Open pull requests

| PR | State | Evidence | Decision |
| --- | --- | --- | --- |
| [#11 — Retire Phase 0 broad-push guard](https://github.com/alexlandman1998-123/bridge/pull/11) | Conflicted (`DIRTY`), last updated 11 August | Historical guard and Vercel checks passed, but the change retires a fail-closed migration safety control. | Keep open and blocked. It needs explicit guard-retirement approval plus a fresh, production-baseline implementation; do not resolve by merging the stale branch. |
| [#16 — Forward-port buyer seller bond workflow reconciliation](https://github.com/alexlandman1998-123/bridge/pull/16) | Conflicted (`DIRTY`), last updated 11 August | Historical certification and Vercel previews passed; the branch is now 421 commits behind `main`. | Do not merge. Extract only still-missing workflow fixes to small, current-baseline branches and test each separately. |
| [#17 — Polish buyer viewing email preview](https://github.com/alexlandman1998-123/bridge/pull/17) | Draft and conflicted (`DIRTY`), last updated 14 August | Five required checks failed: Attorney calendar invite plus Supabase Phase 0, 6, 7, and 8 gates. Vercel preview succeeded. | Keep as a draft reference. Recreate the email-only change on a fresh branch only if it remains needed; diagnose and pass all relevant gates before reopening for review. |

## Candidate release state

The rentals CRM/portal release candidate is local on
`codex/release-validation-tooling` at `a7b7d35d9`. It is intentionally not
presented as production-ready:

- application build and focused portal checks passed;
- a dedicated Vercel Preview passed shell and public-route authorization smoke
  checks;
- Arch9 Staging does not contain the prerequisite rental tables or the managed
  rental portal foundation migration;
- therefore no real tenant or landlord portal journey has been certified, and
  no production promotion is authorised.

## Release gates

1. Reconcile the staging migration ledger and establish the rental property and
   tenancy baseline in a non-production database.
2. Apply and verify the managed rental portal foundation migration in staging.
3. Issue non-production portal tokens and run the complete tenant and landlord
   journeys.
4. Create a fresh PR from the current candidate only after the staging gate is
   satisfied; require current CI and preview evidence on that PR.
5. Merge and promote only after explicit release approval. Do not use any of
   the three existing open PRs as a shortcut around these gates.

## Phase 7 outcome

No open PR is merge-ready. The active rentals candidate remains correctly
blocked on staging database reconciliation, not on application compilation or
basic route availability.
