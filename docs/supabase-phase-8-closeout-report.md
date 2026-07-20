# Supabase Phase 8 Closeout Report

Generated: 2026-07-20T13:36:08.119Z
Production project: `isdowlnollckzvltkasn`

## Decision

**Status: CLOSEOUT_BLOCKED**

The Phase 0 broad-push freeze remains active unless this report says `READY_FOR_REVIEWED_PHASE0_FREEZE_RETIREMENT`. Even a ready report authorizes a reviewed guard-removal change; it does not remove the guard automatically.

## Gate Summary

| Check | Result |
| --- | --- |
| Local migration files | 501 |
| Phase 5 manifest rows | 64 |
| Duplicate versions | 1 |
| Missing manifest files | 0 |
| Phase 7 staging readiness | READY_FOR_PRODUCTION_PROMOTION |
| Attorney integrity blocking assignments | 0 |
| Human staging-readiness approval | Yes |
| Complete production evidence rows | 11 |
| Incomplete production evidence rows | 53 |
| Unknown evidence rows | 0 |
| Duplicate evidence versions | 0 |
| Live verification performed | Yes |
| Pure local-only versions | 57 |
| Pure remote-only versions | 0 |
| Divergent versions | 0 |
| Unreviewed split versions | 0 |
| Production PITR | Disabled |
| Physical backups | 8 |
| Runtime recovery confirmation configured | Yes |
| Phase 12 recovery evidence | Valid — Alexander Landman |
| Ready for reviewed freeze retirement | No |

## Incomplete Evidence Versions

- `202607170021`
- `202607170025`
- `202607180001`
- `202607180002`
- `202607180003`
- `202607180004`
- `202607180005`
- `202607180006`
- `202607180007`
- `202607180008`
- `202607180009`
- `202607180010`
- `202607180011`
- `202607180012`
- `202607180013`
- `202607180014`
- `202607180015`
- `202607180016`
- `202607180017`
- `202607180018`
- `202607180019`
- `202607180020`
- `202607180021`
- `202607180022`
- `202607180043`
- `202607170029`
- `202607170030`
- `202607170031`
- `202607180023`
- `202607180033`
- `202607180034`
- `202607180048`
- `202607180049`
- `202607180050`
- `202607180051`
- `202607180052`
- `202607180026`
- `202607180027`
- `202607180028`
- `202607180029`
- `202607180030`
- `202607180031`
- `202607180035`
- `202607180036`
- `202607180047`
- `202607180037`
- `202607180038`
- `202607180039`
- `202607180040`
- `202607180041`
- `202607180042`
- `202607180046`
- `20260719194500`

## Closeout Rule

Do not remove `scripts/supabase-phase0-guard.mjs`, its CI enforcement, or the broad-push freeze until all local and live checks pass, all 64 manifest versions have reviewed closeout evidence, and production recovery is available and tested.
