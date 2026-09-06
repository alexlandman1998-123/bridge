# Supabase Ledger Drift Resolution

Generated: 2026-09-06T15:50:50.059Z

## Decision

| Field | Value |
| --- | --- |
| Status | `LEDGER_DRIFT_BLOCKED` |
| Resolved | No |
| Pure local-only rows | 95 |
| Pure remote-only rows | 63 |
| Divergent rows | 0 |
| Reviewed split rows | 1 |
| Unresolved split rows | 0 |
| Blockers | 158 |

## Pure Local-Only

| Version | Stream | Resolution | Blockers | Command |
| --- | --- | --- | --- | --- |
| `20260817174624` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260818203652` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `202608200001` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `202608200002` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260820160621` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260820174624` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260820192038` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260820192857` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260820193436` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `202608230001` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `202608230002` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `202608240001` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260824084233` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260824091732` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260824092531` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `202608250001` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260827081713` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260827083108` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260827091439` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260828203724` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `202608290001` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `202608290002` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260829103738` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260829105514` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260829111644` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260829112135` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260829112530` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260829195657` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260829204153` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260830125035` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260830160810` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260831071807` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260831072652` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260831120000` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260831131538` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260831140736` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260831150740` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260831153322` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260831190341` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260901075131` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260901110612` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260901140943` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260901143358` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260901145225` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260901165511` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260901170254` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260901170909` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260901174924` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260902074000` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260902085300` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260902095249` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260902105303` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260903094624` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260903094957` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260903122031` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260903130012` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260905090353` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260905091122` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260905095152` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260905100612` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260905100908` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260905101301` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260905101931` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260905102430` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260905102813` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260905102934` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260905120250` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260905125639` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260905141005` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260905141007` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260905141008` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260905141009` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260905141010` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260905141011` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260905141012` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260905141013` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260905141014` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260905141015` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260905141016` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260905141017` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260905141018` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260905141019` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260905141020` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260905141021` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260905150420` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260906063435` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260906065759` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260906070515` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260906070938` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260906071644` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260906123000` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260906130000` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260906133000` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260906134500` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |
| `20260906140000` | `unknown` | `unmanaged_pure_local_only` | `missing_production_promotion_plan` |  |

## Pure Remote-Only

| Version | Resolution | Blockers | Command |
| --- | --- | --- | --- |
| `20260817065106` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260817065106_*.sql` |
| `20260820110704` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260820110704_*.sql` |
| `20260827102952` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260827102952_*.sql` |
| `20260827104611` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260827104611_*.sql` |
| `20260827131153` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260827131153_*.sql` |
| `20260827133621` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260827133621_*.sql` |
| `20260827133842` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260827133842_*.sql` |
| `20260827133951` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260827133951_*.sql` |
| `20260827185146` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260827185146_*.sql` |
| `20260828203637` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260828203637_*.sql` |
| `20260829203552` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260829203552_*.sql` |
| `20260829203648` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260829203648_*.sql` |
| `20260829203735` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260829203735_*.sql` |
| `20260829204144` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260829204144_*.sql` |
| `20260829204623` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260829204623_*.sql` |
| `20260829204840` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260829204840_*.sql` |
| `20260829210157` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260829210157_*.sql` |
| `20260830084850` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830084850_*.sql` |
| `20260830085317` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830085317_*.sql` |
| `20260830085705` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830085705_*.sql` |
| `20260830090204` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830090204_*.sql` |
| `20260830091124` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830091124_*.sql` |
| `20260830091652` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830091652_*.sql` |
| `20260830092741` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830092741_*.sql` |
| `20260830093509` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830093509_*.sql` |
| `20260830094123` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830094123_*.sql` |
| `20260830095017` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830095017_*.sql` |
| `20260830095430` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830095430_*.sql` |
| `20260830100753` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830100753_*.sql` |
| `20260830100807` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830100807_*.sql` |
| `20260830100936` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830100936_*.sql` |
| `20260830101115` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830101115_*.sql` |
| `20260830101259` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830101259_*.sql` |
| `20260830101318` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830101318_*.sql` |
| `20260830101846` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830101846_*.sql` |
| `20260830102633` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830102633_*.sql` |
| `20260830102724` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830102724_*.sql` |
| `20260830102811` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830102811_*.sql` |
| `20260830102846` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830102846_*.sql` |
| `20260830102937` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830102937_*.sql` |
| `20260830103810` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830103810_*.sql` |
| `20260830103913` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830103913_*.sql` |
| `20260830104159` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830104159_*.sql` |
| `20260830104242` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830104242_*.sql` |
| `20260830105816` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830105816_*.sql` |
| `20260830105908` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830105908_*.sql` |
| `20260830110749` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830110749_*.sql` |
| `20260830111228` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830111228_*.sql` |
| `20260830111659` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830111659_*.sql` |
| `20260830113004` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830113004_*.sql` |
| `20260830113531` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830113531_*.sql` |
| `20260830114448` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260830114448_*.sql` |
| `20260831074851` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260831074851_*.sql` |
| `20260831125342` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260831125342_*.sql` |
| `20260831205101` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260831205101_*.sql` |
| `20260902064058` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260902064058_*.sql` |
| `20260902074632` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260902074632_*.sql` |
| `20260902085246` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260902085246_*.sql` |
| `20260905173226` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260905173226_*.sql` |
| `20260906112843` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260906112843_*.sql` |
| `20260906112854` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260906112854_*.sql` |
| `20260906113258` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260906113258_*.sql` |
| `20260906113353` | `restore_local_history_or_accept_remote_only` | `remote_history_without_local_migration_file` | `git log --all -- supabase/migrations/20260906113353_*.sql` |

## Split Rows

| Version | Module | Decision | Reviewed | Blockers |
| --- | --- | --- | --- | --- |
| `202609030001` | `lead_capture_crm` | `confirmed_live_split` | Yes | None |

## Closeout Integration

The reviewed split versions in this report are safe for closeout accounting only. Pure local-only rows still need one-version production promotion, and pure remote-only rows still need local history restoration or explicit remote-only acceptance.
