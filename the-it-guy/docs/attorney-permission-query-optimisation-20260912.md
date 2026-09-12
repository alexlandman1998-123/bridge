# Attorney permission-query optimisation — 12 September 2026

Status: implemented and applied to **staging only** (`vaszuxjeoajeuhlcnzzf`). Production unchanged. Not full release acceptance.

## Change

Migration `20260912071751_attorney_permission_identity_initplans.sql` keeps the existing signatures, owners, grants, STABLE classification, SECURITY DEFINER mode and fixed search path of two existing access helpers:

- `bridge_can_access_transaction_spine(uuid)`: the same 13 OR branches are evaluated lazily, with the same null-user and missing-transaction rejection.
- `bridge_has_transaction_access(uuid)`: the same six CASE branches execute in the same order. User identity/email are reused within the invocation; profile role is fetched once only when that branch is reached.

PL/pgSQL plans independent checks when needed. A successful existing access condition avoids planning later, more expensive membership/assignment/bond checks. There is no cross-request permission cache or new privileged endpoint.

No lane/task RLS policy, visibility condition, assignment status rule, mutation RPC, row, task status or history record changed. CREATE OR REPLACE retained existing execution grants. A source-hash guard rejects migration application if the baseline permission definitions have drifted. The local migration version was reconciled to the actual staging history entry returned by Supabase.

## Evidence

- Static regression compares **all 19 original conditions** against the new conditions after identity-variable substitution. Conditions and branch order match.
- **56 live before/after comparisons**: transfer, bond, cancellation attorney identities; agent; developer; synthetic missing-email identity; anonymous; active buyer portal token. Each across six staging matters plus a nonexistent matter.
- Complete sorted visible lane/task ID arrays, legacy access, spine access and legacy attorney edit outcomes match exactly, not just row counts.
- Additional non-empty unrelated-email caller: no lanes/tasks or access in seven cases.
- Three concurrent role reads (attorney, agent, developer), each covering seven cases: results still identical; no SQL error.
- Catalog hash of all lane/task policies unchanged. Function owner/ACL/security mode/search path unchanged.
- Regression scripts pass: predicate equivalence, permission read dedupe, attorney assignee permissions, professional journey access.
- No task mutation was executed in this pass. Browser complete/N/A/reopen/reload acceptance is still outstanding.

Authenticated 85-task SQL EXPLAIN, sixth staging matter:

| Measurement | Execution |
| --- | ---: |
| Before change, same query/caller | 1,221.893 ms |
| After | 350.354 ms |
| Repeat 1 | 364.140 ms |
| Repeat 2 | 355.777 ms |
| Repeat 3 | 355.971 ms |

All return 85 rows. Approximately **70–71% lower execution time** in these samples. These are database timings, not browser/network latency or a guarantee that the full concurrent browser timeout is resolved. Earlier lane-only baseline was 290.956 ms; no direct after lane-only comparison is claimed.

Reproduction:
- `scripts/attorney-permission-predicate-equivalence.test.mjs`
- `scripts/fixtures/attorney-permission-before.sql` (test reference; not a migration)
- `scripts/attorney-permission-staging-snapshot.sql` (read-only; compare complete before/after results)

## Separate security finding — release follow-up

The pre-existing spine helper compares lowercased/coalesced assignment email fields with a similarly coalesced JWT email. In a simulated authenticated context with a non-null subject but **no email**, blank assignment fields match and the helper returns access on the six fixtures. This is present in both old and new versions. It is not a newly granted permission, and this performance-only pass intentionally preserves it. A non-empty unrelated email correctly fails.

Do not describe the missing-email case as a denied outsider test. Hardening it requires a deliberate behaviour change (non-empty verified email matching), tests for phone/email-less identities and all email-assignment paths, and a separate migration before release.

Supabase security advisors were run. They continue to flag the existing anon/authenticated execution grants on these SECURITY DEFINER helpers; those grants were not introduced or widened here. Other existing project advisories remain; this is not a clean security audit. See [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security) and [database security advisories](https://supabase.com/docs/guides/database/database-advisors).

## Next acceptance gate

Address the empty-email edge case separately, then repeat uninterrupted browser acceptance, particularly attorney reopen and all bond/cancellation operations across five roles. Existing document-access and missing-scenario-data gates remain. No commit, push or production deployment in this pass.
