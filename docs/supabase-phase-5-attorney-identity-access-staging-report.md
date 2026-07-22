# Supabase Phase 5 — Attorney Identity and Access

## Outcome

Phase 5 has been implemented, verified, and ledger-recorded on the dedicated Supabase staging project `vaszuxjeoajeuhlcnzzf`.

- Target: staging only
- Production project `isdowlnollckzvltkasn`: not changed
- Migration versions: `202607180037` through `202607180042`
- Staging ledger entries confirmed: 6 of 6
- Evidence files: 6 of 6
- Repository contract tests: 7 passed, 0 failed
- Release certification: blocked by the integrity gate, as intended

The migrations are operational. The current staging data is not yet eligible for release certification because 43 historical open assignments point to a user who is not an active member of the assigned attorney firm. No historical assignments were silently reassigned or deleted.

## Implemented capabilities

### Professional-role persistence

- Canonical `professional_role` and `practice_qualifications` fields are live on attorney members and invitations.
- Attorney profile fields are mirrored to linked organisation users.
- All 8 existing attorney members have organisation-user links.
- Compatibility-role and organisation-extension mismatch counts are zero.
- Compatibility roles remain present and are derived from the canonical professional profile.

### Signup and invitation lifecycle

- Workspace access requests can store a requested attorney professional profile.
- Accepted attorney invitations apply the protected professional profile to the member.
- Invalid professional roles are rejected by database constraints.

### Assignment eligibility

- New or materially changed attorney assignments are checked against active membership, professional role, assignment slot, and practice qualification.
- Ineligible assignment writes are rejected with PostgreSQL error `23514`.
- Existing historical assignments were audited but not rewritten.

### Permission cutover

- Firm administrator and lead authorization now uses canonical professional roles.
- Firm bootstrap writes a canonical `firm_admin` profile and derives the compatibility role.
- Unauthenticated bootstrap calls are rejected with `42501`.

### Integrity and release gates

- The security-invoker integrity view is available only to authenticated users.
- The view reports 8 healthy member rows and one blocking historical-assignment group containing 43 ineligible assignments.
- The initial member-only integrity query had a false-healthy blind spot for assignments whose user had no active firm membership. The canonical migration was corrected before ledger recording so these assignments are now visible and blocking.
- Two derived-compatibility constraints are live as `NOT VALID`, enforcing new writes without asserting that unreviewed history has been validated.
- Release certification is RLS protected and can only be performed through the firm-admin RPC.
- An anonymous certification attempt is rejected with `42501`.
- A firm-admin certification attempt against the current blocked data is rejected with `P0001`.
- Zero certification records were persisted.

## Security hardening

Direct anonymous execution was removed from trigger-only and internal helper functions introduced or replaced by this phase. Public and anonymous access was also removed from the integrity view and certification table. Authenticated users retain only the intended view/table selection and guarded RPC permissions.

## Final persistent staging counts

| Object | Rows |
| --- | ---: |
| Attorney firm members | 8 |
| Attorney firm invitations | 0 |
| Workspace access requests | 0 |
| Transaction attorney assignments | 59 |
| Release certifications | 0 |

## Migration evidence

Evidence is stored in `migration-evidence/2026-07-20-staging-phase5/` for:

1. `202607180037` — professional-role persistence
2. `202607180038` — signup and invitation profile lifecycle
3. `202607180039` — assignment qualification enforcement
4. `202607180040` — professional permission cutover
5. `202607180041` — attorney-role integrity gate
6. `202607180042` — guarded release certification

## Required remediation before certification

The 43 historical ineligible assignments must be reviewed with the attorney-firm owner. Each affected assignment must either be linked to a valid active firm member with an eligible role and qualification, reassigned to an eligible member, or formally closed/removed according to the business record.

After remediation:

1. Re-run the Phase 8 integrity view for the affected firm.
2. Confirm every returned row is `healthy` and the ineligible assignment count is zero.
3. Run the Phase 9 certification RPC as an active canonical firm administrator.
4. Capture the certification record as production-promotion evidence.

## Production status

Phase 5 has not been promoted to production. Production promotion should remain paused until the historical assignment remediation is understood and the same migration sequence has a recoverable production-backup window, rollback owner, and per-step verification plan.
