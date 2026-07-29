# Supabase Ledger Drift Resolution

Generated: 2026-07-29T19:49:24.697Z

## Decision

| Field | Value |
| --- | --- |
| Status | `LEDGER_DRIFT_BLOCKED` |
| Resolved | No |
| Pure local-only rows | 32 |
| Pure remote-only rows | 0 |
| Divergent rows | 0 |
| Reviewed split rows | 17 |
| Unresolved split rows | 0 |
| Blockers | 64 |

## Pure Local-Only

| Version | Stream | Resolution | Blockers | Command |
| --- | --- | --- | --- | --- |
| `202607260008` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202607260008 --plan` |
| `202607270002` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202607270002 --plan` |
| `202607270009` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202607270009 --plan` |
| `202607270010` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202607270010 --plan` |
| `202607270011` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202607270011 --plan` |
| `202607270013` | `legal_document_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202607270013 --plan` |
| `202607270014` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202607270014 --plan` |
| `202607270015` | `bond_finance_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202607270015 --plan` |
| `202607280002` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202607280002 --plan` |
| `202607280003` | `bond_finance_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202607280003 --plan` |
| `202607280004` | `bond_finance_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202607280004 --plan` |
| `202607280005` | `bond_finance_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202607280005 --plan` |
| `202607280006` | `bond_finance_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202607280006 --plan` |
| `202607280007` | `bond_finance_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202607280007 --plan` |
| `202607280008` | `bond_finance_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202607280008 --plan` |
| `202607280009` | `bond_finance_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202607280009 --plan` |
| `202607280010` | `bond_finance_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202607280010 --plan` |
| `202607280011` | `bond_finance_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202607280011 --plan` |
| `202607280012` | `bond_finance_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202607280012 --plan` |
| `202607280013` | `bond_finance_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202607280013 --plan` |
| `202607280014` | `bond_finance_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202607280014 --plan` |
| `202607280015` | `bond_finance_runtime` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202607280015 --plan` |
| `202607280016` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202607280016 --plan` |
| `202607280017` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202607280017 --plan` |
| `202607280018` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202607280018 --plan` |
| `202607280019` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202607280019 --plan` |
| `202607280020` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202607280020 --plan` |
| `202607280021` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202607280021 --plan` |
| `202607280022` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202607280022 --plan` |
| `202607280023` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202607280023 --plan` |
| `202607280024` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202607280024 --plan` |
| `202607290005` | `other` | `promotion_blocked_by_phase5` | `production_promotion_not_ready`<br>`phase5_staging_evidence_missing` | `npm run supabase:push:promote-one -- --version 202607290005 --plan` |

## Pure Remote-Only

No rows.

## Split Rows

| Version | Module | Decision | Reviewed | Blockers |
| --- | --- | --- | --- | --- |
| `202606010001` | `transaction_network` | `confirmed_live_split` | Yes | None |
| `202606030007` | `lead_capture_crm` | `confirmed_live_split` | Yes | None |
| `202606030008` | `lead_capture_crm` | `confirmed_live_split` | Yes | None |
| `202606030009` | `lead_capture_crm` | `confirmed_live_split` | Yes | None |
| `202606030010` | `lead_capture_crm` | `confirmed_live_split` | Yes | None |
| `202606030011` | `notification_automation` | `confirmed_live_split` | Yes | None |
| `202606040001` | `workspace_platform` | `confirmed_live_split` | Yes | None |
| `202606040002` | `workspace_platform` | `confirmed_live_split` | Yes | None |
| `202606040004` | `workspace_platform` | `confirmed_live_split` | Yes | None |
| `202606040005` | `workspace_platform` | `confirmed_live_split` | Yes | None |
| `202606050001` | `bond_finance` | `confirmed_live_manual_sql` | Yes | None |
| `202606080002` | `commercial` | `confirmed_live_split` | Yes | None |
| `202606090010` | `other` | `confirmed_live_split` | Yes | None |
| `202606110004` | `commercial` | `confirmed_live_split` | Yes | None |
| `202606110005` | `commercial` | `confirmed_live_split` | Yes | None |
| `202606110006` | `commercial` | `confirmed_live_split` | Yes | None |
| `202606110007` | `commercial` | `confirmed_live_split` | Yes | None |

## Closeout Integration

The reviewed split versions in this report are safe for closeout accounting only. Pure local-only rows still need one-version production promotion, and pure remote-only rows still need local history restoration or explicit remote-only acceptance.
