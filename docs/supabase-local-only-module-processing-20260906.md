# Supabase Local-Only Module Processing

Generated: 6 September 2026

## Decision

All 93 pure local-only migrations have been assigned to a product module and an
explicit execution route. This pass is a guarded planning pass: it did not
apply SQL or alter either the staging or production migration ledger.

The prerequisite remote-history restoration is complete: all 63 remote-only
files are now represented locally and the live reconciliation reports zero
pure remote-only rows. Two executable-SQL-equivalent local timestamp aliases
were retired; 15 materially different successors from the other 14 pairs stay
in this local-only queue. A subsequent guarded staging pass completed valid
evidence for 14 repair-only rows; the other 26 repair candidates are blocked
because their expected objects are absent or only partially present.

## Module queue

| Module | Total | Repair after smoke | Apply after dependency check | Corrective required | Manual data review |
| --- | ---: | ---: | ---: | ---: | ---: |
| Attorney | 5 | 2 | 2 | 1 | 0 |
| Bond finance | 8 | 0 | 7 | 1 | 0 |
| Canonical documents | 3 | 0 | 2 | 0 | 1 |
| Commercial | 5 | 3 | 0 | 0 | 2 |
| Developer/referral | 9 | 3 | 3 | 3 | 0 |
| Lead capture/CRM | 9 | 4 | 2 | 2 | 1 |
| Other | 29 | 16 | 9 | 2 | 2 |
| Transaction network | 12 | 5 | 5 | 1 | 1 |
| Workspace platform | 13 | 7 | 0 | 1 | 5 |
| **Total** | **93** | **40** | **30** | **11** | **12** |

## Processing outcome

| Outcome | Rows | State |
| --- | ---: | --- |
| Repair only after smoke | 40 | 14 complete on staging; 25 none-live and 1 partial-live remain blocked. |
| Apply original after dependency check | 30 | Queue for one-version staging execution after dependency preflight. |
| Corrective migration required | 11 | Blocked until a new idempotent corrective migration is reviewed. Do not replay the original SQL. |
| Manual data review | 12 | Blocked until intended data outcomes and idempotency are reviewed. |
| Ready for production now | 0 | The 14 evidence-complete rows are still blocked by predecessors absent from the production ledger. |

## Resolved remote-pair set

The two normalized aliases in this former 17-file hold set were retired. The
remaining 15 files contain materially different SQL from their restored remote
predecessors and remain pending successors:

- `20260831071807_canonical_transaction_requirements_on_creation.sql`
- `20260831072652_canonical_transaction_requirements_on_creation.sql`
- `20260901140943_harden_admin_portal_authorization.sql`
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
- Other: `20260830160810`, `20260831153322`

## Required order

1. Process the predecessor migrations required by the 14 evidence-complete
   repair rows; do not bypass the production dependency gate.
2. Process the 30 apply candidates one version at a time on staging after their
   dependency preflight.
3. Route the 25 none-live repair candidates through staged SQL execution and
   review a corrective path for the single partial-live candidate.
4. Create and review the 11 corrective migrations and complete the 12 manual
   data decisions.
5. Promote only evidence-backed rows through the Phase 7 production gate, then
   rerun the live reconciliation after each module batch.

The detailed per-version commands and evidence paths are in
`docs/supabase-push-phase-3-action-routing-report.md`. The Phase 0 broad-push
freeze remains active.
