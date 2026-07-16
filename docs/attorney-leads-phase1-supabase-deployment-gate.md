# Attorney Leads Phase 1 Supabase Deployment Gate

Date: 2026-07-16

## Outcome

Phase 1 is complete. The Attorney workflow migrations are ready for a targeted
deployment, but a normal `supabase db push` must not be used yet because the
repository contains older unrelated local-only migrations.

## Phase 2 deployment result

Phase 2 was deployed successfully on 2026-07-16 using the controlled sequence.
Versions `202607160020`, `202607160021`, and `202607160022` are recorded as
applied. Live verification exposed an RLS insertion gap in the original handoff
function, so follow-up migration
`202607160024_agent_legal_handoff_runtime_hardening.sql` was added and deployed.

The hardening migration:

- authorises the caller through `bridge_can_access_transaction_spine`;
- uses a security-definer boundary only after that explicit access check;
- materialises required legal lanes despite table RLS;
- seeds the canonical steps for every newly created lane;
- remains idempotent on retries.

The isolated QA Matter now has a 37-step transfer lane and a 17-step bond lane.
A repeated handoff seeded zero additional steps. An authenticated Attorney also
completed one transfer step, which atomically updated the step, lane roll-up,
lane history and transaction event.

## Phase 3 application integration result

Phase 3 was implemented on 2026-07-16. Attorney Lead conversion now invokes
`prepareAgentLegalHandoff` after both new and idempotently reused Matter
conversions. The same injected Supabase client is used for both calls so tenant,
authentication and test boundaries remain consistent.

The conversion result now includes the normalized legal handoff summary. If the
Matter succeeds but handoff preparation fails, the service raises the retryable
`ATTORNEY_LEAD_HANDOFF_FAILED` error with the existing transaction and assignment
identifiers. Retrying conversion reuses the Matter and reruns only the idempotent
handoff, preventing duplicate transactions.

Attorney Leads Phase 2-13 certification, targeted ESLint, handoff tests and the
production build pass after the integration.

## Confirmed target

- Linked project: `isdowlnollckzvltkasn`
- Project name: `Arch9 SaaS`
- Project status: `ACTIVE_HEALTHY`

## Target migration set

1. `202607160020_workspace_branding_integrity_phase6.sql`
2. `202607160021_attorney_workflow_phase1_foundation.sql`
3. `202607160022_agent_legal_handoff_phase2.sql`

## Safety findings

- The remote-only migration history was fetched locally without changing the
  remote database or its migration ledger.
- Migration `020` creates two read-only security-invoker views and grants
  authenticated read access. It does not update or delete source records.
- Migration `021` replaces one event-type constraint with a bounded extensible
  constraint, idempotently inserts missing canonical workflow steps, and creates
  the atomic Attorney workflow-step RPC.
- Migration `022` creates the idempotent legal-handoff RPC.
- Migration `022` originally referenced optional transaction columns that are
  absent from the linked schema. It now reads optional values through
  `to_jsonb(v_transaction)`, remaining compatible when those columns are absent.
- All required tables and columns for migration `021` exist remotely.
- The remote database contains zero invalid event types that would violate the
  replacement event constraint.
- The lane upsert has a compatible uniqueness constraint.
- Existing production data currently contains 210 legal lanes and 2,982 legal
  workflow steps; migration `021` preserves existing rows and only fills missing
  canonical steps.

## Migration ledger warning

The dry run reports 19 older local migrations before the current remote head,
plus an unrelated newer seller-portal migration (`202607160023`). They span
unrelated lead, workspace, billing, commercial, bond, seller portal and RLS work.
Several have already-live objects under split migration history, while two were
previously flagged for manual review. Do not use `--include-all` for the Attorney
workflow deployment.

The standard command below is therefore intentionally blocked for Phase 2:

```bash
npx supabase db push --linked
```

Do not use:

```bash
npx supabase db push --linked --include-all
```

## Controlled Phase 2 deployment sequence

Apply only the reviewed files, in order:

```bash
cd /Users/alexanderlandman/the-it-guy

npx supabase db query --linked \
  --file supabase/migrations/202607160020_workspace_branding_integrity_phase6.sql

npx supabase db query --linked \
  --file supabase/migrations/202607160021_attorney_workflow_phase1_foundation.sql

npx supabase db query --linked \
  --file supabase/migrations/202607160022_agent_legal_handoff_phase2.sql
```

After all three database transactions succeed, record only these versions in
the remote migration ledger:

```bash
npx supabase migration repair --linked --status applied \
  202607160020 202607160021 202607160022
```

Then verify:

```bash
npx supabase migration list --linked

npx supabase db query --linked "
select
  to_regprocedure(
    'public.bridge_update_attorney_workflow_step(uuid,text,uuid,text,text,text,jsonb)'
  ) is not null as workflow_step_rpc_deployed,
  to_regprocedure(
    'public.bridge_prepare_agent_legal_handoff(uuid)'
  ) is not null as legal_handoff_rpc_deployed;
"
```

## Phase 2 go/no-go

Proceed only if:

- the three file executions succeed in order;
- both RPC checks return `true`;
- migration history shows `020`–`022` as local and remote;
- no `--include-all` command is used.
