# Supabase Local-Only Module Processing

Generated: 6 September 2026

## Decision

All 95 pure local-only migrations have been assigned to a product module and an
explicit execution route. This pass is a guarded planning pass: it did not
apply SQL or alter either the staging or production migration ledger.

The local-only queue cannot safely execute yet. The preceding remote-only
classification found 47 unique production-history migrations that must be
restored to source control first, plus 16 timestamp/name pairs affecting 17
local-only files. Those 17 local rows are held until the pair decisions are
complete. No current local-only row has valid staging evidence under its current
version and stream binding.

## Module queue

| Module | Total | Repair after smoke | Apply after dependency check | Corrective required | Manual data review |
| --- | ---: | ---: | ---: | ---: | ---: |
| Attorney | 5 | 2 | 2 | 1 | 0 |
| Bond finance | 8 | 0 | 7 | 1 | 0 |
| Canonical documents | 3 | 0 | 2 | 0 | 1 |
| Commercial | 5 | 3 | 0 | 0 | 2 |
| Developer/referral | 9 | 3 | 3 | 3 | 0 |
| Lead capture/CRM | 9 | 3 | 3 | 2 | 1 |
| Other | 30 | 16 | 9 | 2 | 3 |
| Transaction network | 12 | 5 | 5 | 1 | 1 |
| Workspace platform | 14 | 8 | 0 | 1 | 5 |
| **Total** | **95** | **40** | **31** | **11** | **13** |

## Processing outcome

| Outcome | Rows | State |
| --- | ---: | --- |
| Repair only after smoke | 40 | 16 held by remote/local pair review; remaining 24 require current staging smoke evidence. |
| Apply original after dependency check | 31 | Queue after exact remote-history restoration and staging preflight. |
| Corrective migration required | 11 | Blocked until a new idempotent corrective migration is reviewed. Do not replay the original SQL. |
| Manual data review | 13 | Blocked until intended data outcomes and idempotency are reviewed; one is also a normalized timestamp pair. |
| Ready for production now | 0 | No current staging evidence is bound to these versions and streams. |

## Remote-pair hold set

The following 17 local-only migrations must not be repaired or applied until
their remote counterpart decision is recorded:

- `20260831071807_canonical_transaction_requirements_on_creation.sql`
- `20260831072652_canonical_transaction_requirements_on_creation.sql`
- `20260901140943_harden_admin_portal_authorization.sql`
- `20260902074000_hide_non_building_harbour_heights_map_markers.sql`
- `20260902085300_allow_platform_admin_profile_role.sql`
- `20260905141015_rental_application_submission.sql`
- `20260905141016_rental_application_documents.sql`
- `20260905141017_rental_application_review_workspace.sql`
- `20260905141018_rental_application_screening.sql`
- `20260905141019_rental_application_screening_reviewer_actor.sql`
- `20260905141020_rental_application_decisions.sql`
- `20260905141021_rental_application_tenancy_conversion.sql`
- `20260905150420_development_visual_analytics_phase14.sql`
- `20260906123000_public_websites_pilot_closeout_phase5_go_live.sql`
- `20260906133000_public_websites_pilot_closeout_phase6_hypercare.sql`
- `20260906134500_public_websites_pilot_closeout_phase6_hypercare_indexes.sql`
- `20260906140000_public_websites_pilot_closeout_phase6_approval_gate.sql`

## Blocked corrective queue

- Bond finance: `20260905101931`
- Attorney: `20260906070938`
- Transaction network: `20260827083108`
- Lead capture/CRM: `20260829204153`, `20260905125639`
- Developer/referral: `20260901075131`, `20260901110612`, `20260903122031`
- Workspace platform: `202608230001`
- Other: `202608200001`, `20260905120250`

## Blocked manual-review queue

- Canonical documents: `202608200002`
- Commercial: `202608250001`, `20260901145225`
- Lead capture/CRM: `20260901143358`
- Transaction network: `20260831131538`
- Workspace platform: `20260820174624`, `20260820192038`,
  `20260820192857`, `20260824084233`, `20260824092531`
- Other: `20260830160810`, `20260831153322`, `20260902074000`

## Required order

1. Restore the 47 unique remote-history files without executing them against
   production.
2. Resolve the two normalized timestamp aliases and the 14 different-SQL pairs.
3. Refresh Phase 5 so the 17 held local rows receive their canonical decision.
4. Process the 24 unpaired repair candidates module-by-module with current
   staging smoke evidence and `sqlApplied=false` receipts.
5. Process the 31 apply candidates one version at a time on staging after their
   dependency preflight.
6. Create and review the 11 corrective migrations and complete the 13 manual
   data decisions.
7. Promote only evidence-backed rows through the Phase 7 production gate, then
   rerun the live reconciliation after each module batch.

The detailed per-version commands and evidence paths are in
`docs/supabase-push-phase-3-action-routing-report.md`. The Phase 0 broad-push
freeze remains active.
