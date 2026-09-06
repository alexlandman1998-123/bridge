# Supabase Ledger Drift Resolution

Generated: 2026-09-06T16:55:55.173Z

## Decision

| Field | Value |
| --- | --- |
| Status | `LEDGER_DRIFT_BLOCKED` |
| Resolved | No |
| Pure local-only rows | 89 |
| Pure remote-only rows | 0 |
| Divergent rows | 0 |
| Reviewed split rows | 1 |
| Unresolved split rows | 0 |
| Blockers | 156 |

## Pure Local-Only

| Version | Stream | Resolution | Blockers | Command |
| --- | --- | --- | --- | --- |
| `20260817174624` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260817174624 --plan` |
| `20260818203652` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260818203652 --plan` |
| `202608200002` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202608200002 --plan` |
| `20260820160621` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260820160621 --plan` |
| `20260820174624` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260820174624 --plan` |
| `20260820192038` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260820192038 --plan` |
| `20260820192857` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260820192857 --plan` |
| `20260820193436` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260820193436 --plan` |
| `202608230002` | `other` | `ready_for_one_version_promotion` | `production_promotion_execution_pending` | `npm run supabase:push:promote-one -- --version 202608230002 --plan` |
| `202608240001` | `other` | `ready_for_one_version_promotion` | `production_promotion_execution_pending` | `npm run supabase:push:promote-one -- --version 202608240001 --plan` |
| `20260824084233` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260824084233 --plan` |
| `20260824091732` | `other` | `ready_for_one_version_promotion` | `production_promotion_execution_pending` | `npm run supabase:push:promote-one -- --version 20260824091732 --plan` |
| `20260824092531` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260824092531 --plan` |
| `202608250001` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202608250001 --plan` |
| `20260827081713` | `other` | `ready_for_one_version_promotion` | `production_promotion_execution_pending` | `npm run supabase:push:promote-one -- --version 20260827081713 --plan` |
| `20260827091439` | `other` | `ready_for_one_version_promotion` | `production_promotion_execution_pending` | `npm run supabase:push:promote-one -- --version 20260827091439 --plan` |
| `202608290001` | `other` | `ready_for_one_version_promotion` | `production_promotion_execution_pending` | `npm run supabase:push:promote-one -- --version 202608290001 --plan` |
| `202608290002` | `other` | `ready_for_one_version_promotion` | `production_promotion_execution_pending` | `npm run supabase:push:promote-one -- --version 202608290002 --plan` |
| `20260829103738` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260829103738 --plan` |
| `20260829105514` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260829105514 --plan` |
| `20260829111644` | `other` | `ready_for_one_version_promotion` | `production_promotion_execution_pending` | `npm run supabase:push:promote-one -- --version 20260829111644 --plan` |
| `20260829112135` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260829112135 --plan` |
| `20260829112530` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260829112530 --plan` |
| `20260829195657` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260829195657 --plan` |
| `20260830125035` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260830125035 --plan` |
| `20260830160810` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260830160810 --plan` |
| `20260831071807` | `other` | `ready_for_one_version_promotion` | `production_promotion_execution_pending` | `npm run supabase:push:promote-one -- --version 20260831071807 --plan` |
| `20260831072652` | `other` | `ready_for_one_version_promotion` | `production_promotion_execution_pending` | `npm run supabase:push:promote-one -- --version 20260831072652 --plan` |
| `20260831120000` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260831120000 --plan` |
| `20260831131538` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260831131538 --plan` |
| `20260831140736` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260831140736 --plan` |
| `20260831150740` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260831150740 --plan` |
| `20260831153322` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260831153322 --plan` |
| `20260831190341` | `other` | `ready_for_one_version_promotion` | `production_promotion_execution_pending` | `npm run supabase:push:promote-one -- --version 20260831190341 --plan` |
| `20260901140943` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260901140943 --plan` |
| `20260901143358` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260901143358 --plan` |
| `20260901145225` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260901145225 --plan` |
| `20260901165511` | `other` | `ready_for_one_version_promotion` | `production_promotion_execution_pending` | `npm run supabase:push:promote-one -- --version 20260901165511 --plan` |
| `20260901170254` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260901170254 --plan` |
| `20260901170909` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260901170909 --plan` |
| `20260901174924` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260901174924 --plan` |
| `20260902095249` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260902095249 --plan` |
| `20260902105303` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260902105303 --plan` |
| `20260903094624` | `other` | `ready_for_one_version_promotion` | `production_promotion_execution_pending` | `npm run supabase:push:promote-one -- --version 20260903094624 --plan` |
| `20260903094957` | `attorney_identity_access` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260903094957 --plan` |
| `20260903130012` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260903130012 --plan` |
| `20260905090353` | `other` | `ready_for_one_version_promotion` | `production_promotion_execution_pending` | `npm run supabase:push:promote-one -- --version 20260905090353 --plan` |
| `20260905091122` | `other` | `ready_for_one_version_promotion` | `production_promotion_execution_pending` | `npm run supabase:push:promote-one -- --version 20260905091122 --plan` |
| `20260905095152` | `other` | `ready_for_one_version_promotion` | `production_promotion_execution_pending` | `npm run supabase:push:promote-one -- --version 20260905095152 --plan` |
| `20260905102430` | `bond_finance_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260905102430 --plan` |
| `20260905102813` | `bond_finance_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260905102813 --plan` |
| `20260905102934` | `bond_finance_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260905102934 --plan` |
| `20260905141005` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260905141005 --plan` |
| `20260905141007` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260905141007 --plan` |
| `20260905141008` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260905141008 --plan` |
| `20260905141009` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260905141009 --plan` |
| `20260905141010` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260905141010 --plan` |
| `20260905141011` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260905141011 --plan` |
| `20260905141012` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260905141012 --plan` |
| `20260905141013` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260905141013 --plan` |
| `20260905141014` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260905141014 --plan` |
| `20260905141015` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260905141015 --plan` |
| `20260905141016` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260905141016 --plan` |
| `20260905141017` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260905141017 --plan` |
| `20260905141018` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260905141018 --plan` |
| `20260905141019` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260905141019 --plan` |
| `20260905141020` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260905141020 --plan` |
| `20260905141021` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260905141021 --plan` |
| `20260905150420` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260905150420 --plan` |
| `20260906063435` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260906063435 --plan` |
| `20260906065759` | `other` | `ready_for_one_version_promotion` | `production_promotion_execution_pending` | `npm run supabase:push:promote-one -- --version 20260906065759 --plan` |
| `20260906070515` | `other` | `ready_for_one_version_promotion` | `production_promotion_execution_pending` | `npm run supabase:push:promote-one -- --version 20260906070515 --plan` |
| `20260906071644` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260906071644 --plan` |
| `20260906123000` | `other` | `ready_for_one_version_promotion` | `production_promotion_execution_pending` | `npm run supabase:push:promote-one -- --version 20260906123000 --plan` |
| `20260906130000` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260906130000 --plan` |
| `20260906133000` | `other` | `ready_for_one_version_promotion` | `production_promotion_execution_pending` | `npm run supabase:push:promote-one -- --version 20260906133000 --plan` |
| `20260906134500` | `other` | `ready_for_one_version_promotion` | `production_promotion_execution_pending` | `npm run supabase:push:promote-one -- --version 20260906134500 --plan` |
| `20260906140000` | `other` | `ready_for_one_version_promotion` | `production_promotion_execution_pending` | `npm run supabase:push:promote-one -- --version 20260906140000 --plan` |
| `20260906163535` | `bond_finance_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260906163535 --plan` |
| `20260906163540` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260906163540 --plan` |
| `20260906163545` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260906163545 --plan` |
| `20260906163551` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260906163551 --plan` |
| `20260906163555` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260906163555 --plan` |
| `20260906163601` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260906163601 --plan` |
| `20260906163615` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260906163615 --plan` |
| `20260906163617` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260906163617 --plan` |
| `20260906163622` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260906163622 --plan` |
| `20260906163629` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260906163629 --plan` |
| `20260906163638` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 20260906163638 --plan` |

## Pure Remote-Only

No rows.

## Split Rows

| Version | Module | Decision | Reviewed | Blockers |
| --- | --- | --- | --- | --- |
| `202609030001` | `lead_capture_crm` | `confirmed_live_split` | Yes | None |

## Closeout Integration

The reviewed split versions in this report are safe for closeout accounting only. Pure local-only rows still need one-version production promotion, and pure remote-only rows still need local history restoration or explicit remote-only acceptance.
