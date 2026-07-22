# Production baseline — Phase 0C

Captured at: 2026-07-19 22:08:40 SAST

## Scope

This is a read-only baseline of the production application and the Supabase
project used by its deployed bundle. No application, database, or deployment
state was changed while collecting it.

## Live application

| Field | Captured value |
| --- | --- |
| Public alias | `https://app.arch9.co.za` |
| Vercel project | `bridge` (`prj_rbfXykMU6mU1eECbc0lJS9sPspmp`) |
| Deployment | `dpl_37QFFf31ATACcMkDxespYZYWpTTo` |
| Deployment status | Ready / Production |
| Deployment created | 2026-07-19 21:43:14 SAST |
| Source | `alexlandman1998-123/bridge`, branch `main`, commit `caad506d679303875ee6c9127b1f344a79a1a2b4` |
| Entry bundle | `/assets/index-Bj-EExOQ.js` |
| Entry bundle SHA-256 | `a6bf97e77b3ffb9d4b512629b79d722f615296dabb12306f652aa63f50e9bce1` |

The Vercel deployment inspection lists `https://app.arch9.co.za` as an alias
of this deployment. Its build log records the source branch and commit above.

## Supabase target and migration ledger

| Field | Captured value |
| --- | --- |
| Project ref | `isdowlnollckzvltkasn` |
| Project host | `https://isdowlnollckzvltkasn.supabase.co` |
| Applied migration count | 431 |
| Latest applied migration | `20260719130913` |

The current ledger has reconciliation gaps. In particular, it does **not**
contain the historic `202607180046` migration or the pending append-only
reconciliation migration `20260719193500`.

## Atomic transaction RPC

Database catalog query:

```sql
select to_regprocedure('public.bridge_create_mvp_transaction(jsonb)');
```

Result: `NULL`.

`public.bridge_create_mvp_transaction(p_payload jsonb)` is therefore not
present in the live project schema. The production accepted-offer → atomic
transaction creation flow must remain unavailable until the reconciled
migration has been safely applied and its deployed contract has passed.
