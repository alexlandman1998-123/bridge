# Priority 1 Staging Validation & Enterprise Penetration Test

Date: 2026-06-09  
Target: Supabase staging project `isdowlnollckzvltkasn`  
Harness: `npm run test:enterprise-staging-penetration -- --confirm-staging` with `ENTERPRISE_STAGING_PENTEST_WRITE=true`  
Live run id: `enterprise-pentest-20260609175220`

## Final Recommendation

NO-GO.

Staging is not yet fully certified for national rollout. The live red-team harness created isolated staging organisations, branches, users, leads, listings, transactions, documents, appointments, and portal records, then tested access with real authenticated sessions. It found 12 critical failures.

Bridge should not claim `FULLY CERTIFIED FOR NATIONAL ROLLOUT` until these staging findings are remediated and the same harness returns zero criticals and zero blockers.

## Live Result Summary

Status: `FAILED`  
Recommendation: `NO-GO`  
Passes: 20  
Critical findings: 12  
Blocked probes: 0

## Critical Findings

1. Staging does not accept `assistant` as an `organisation_users.role`.
2. `agent_support_assignments` is missing on staging, so assistant delegation cannot be enforced or validated.
3. Former agent could still read a transferred listing they created.
4. Former agent could still read a transferred transaction they created.
5. Former agent could still read transferred transaction document metadata.
6. Former agent could still read a transferred appointment they created.
7. Branch manager could read another branch’s lead.
8. External authenticated user could read an agency private listing.
9. Assistant fallback user had accidental organisation-wide lead visibility.
10. Former agent could directly download an object from the `documents` storage bucket.
11. External authenticated user could directly download an object from the `documents` storage bucket.
12. External authenticated user could read transferred document metadata.

## Passing Areas

- Staging schema connection succeeded.
- Required base tables are exposed: `organisations`, `organisation_users`, `organisation_branches`, `leads`, `private_listings`, `transactions`, `documents`, `appointments`, `private_listing_seller_onboarding`.
- Former agent could not read the transferred lead after deactivation.
- Transferred agent could read their new-agency lead.
- External user could not read the Organisation A lead.
- Organisation A agent could not read Organisation B lead.
- Branch manager could read their own branch lead.
- Principal could read agency lead.
- Storage object was not publicly reachable without auth.
- New owner could read transferred document metadata.
- Seller portal token remained valid after reassignment and pointed at the new listing owner.
- Invalid seller portal token returned no payload.

## RLS Evidence

Live staging still contains `created_by = auth.uid()` paths in effective policies:

- `appointments_agency_select`
- `appointments_agency_write`
- `private_listings_delete_member_owner`
- `transactions_select_transaction_spine_scope`
- `transactions_update_transaction_spine_scope`

These match the live former-agent leaks. In particular, listings, transactions, documents, and appointments are not yet cleanly governed by current operational ownership after the creator leaves or transfers.

## Certification Matrix

| Area | Result | Notes |
| --- | --- | --- |
| Former agent kill test | Fail | Lead passed, but listing, transaction, document metadata, and appointment leaked. |
| Agency transfer kill test | Partial pass | New agency access works; old-agency listing/transaction paths still leak through creator/document policies. |
| Branch isolation | Fail | Branch manager saw another branch lead. |
| Assistant restrictions | Fail | Assistant role/table missing on staging; fallback user saw lead data. |
| Organisation isolation | Fail | External authenticated user saw private listing and document metadata. |
| Document metadata security | Fail | External user saw document metadata. |
| Storage security | Fail | Authenticated former/external users could directly download `documents` bucket object by path. |
| Portal security | Pass | Active token worked after reassignment; invalid token returned no payload. |
| Reporting integrity | Not certified | Cannot certify while operational access leaks remain. |

## Required Remediation

Critical:

- Apply/remediate Sprint 8.5 ownership RLS on staging so creator attribution never grants operational access.
- Remove `created_by = auth.uid()` from effective visibility/update policies and access resolver functions for listings, transactions, appointments, and document inheritance.
- Harden `documents` table RLS so access inherits strictly from parent lead/listing/transaction ownership.
- Harden storage bucket policies for `documents`; authenticated users must not download by path unless parent-object access is proven server-side.
- Deploy Sprint 7 support-role schema to staging: `assistant` role support plus `agent_support_assignments`.
- Fix branch manager lead scoping so branch managers see only assigned branch assets unless principal/owner authority is present.
- Fix organisation isolation for `private_listings` and `documents`.

Then rerun:

```bash
ENTERPRISE_STAGING_PENTEST_WRITE=true npm run test:enterprise-staging-penetration -- --confirm-staging
```

Certification can only move to `FULLY CERTIFIED FOR NATIONAL ROLLOUT` when this command returns:

- `criticalCount: 0`
- `blockedCount: 0`
- `recommendation: FULLY CERTIFIED FOR NATIONAL ROLLOUT`

