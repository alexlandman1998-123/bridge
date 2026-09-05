# Rentals staging recovery — Phase 6 managed-migration authoring work order

Phase 6 translates the locked unmanaged Rental foundation chain into a 16-item managed-migration authoring work order. The existing managed portal migration is deliberately excluded: it must be preserved, not recreated or edited.

```sh
node scripts/rentals-staging-recovery-phase6-authoring-work-order.mjs
```

The command is read-only. It returns `READY_FOR_SCAFFOLDING_ONLY` only when the Phase 4 evidence and Phase 5 source lock pass. Even then it does not create files itself; the reviewed operator must use `supabase migration new <name>` for each scaffold, then copy reviewed content in the locked order.

No Phase 6 outcome authorises `db push`, migration repair, a database reset, or an application deployment.
