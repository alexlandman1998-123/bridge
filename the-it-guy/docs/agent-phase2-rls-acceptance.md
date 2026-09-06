# Agent module Phase 2 — RLS acceptance

Phase 2 closes the unprotected `transaction_commissions` path and adds a repeatable, read-only workspace isolation check. It deliberately does not change the agent API; that remains a separate brief.

## Security change

Migration `20260906065759_agent_phase2_rls_acceptance.sql`:

- enables row-level security on `transaction_commissions`;
- removes anonymous access;
- lets principals/admins manage rows in their organisation;
- lets active agents read only commissions assigned to their user ID or current email;
- adds indexes for both assignment paths.

Service-role access is unchanged. The migration must be reviewed and applied through the normal Supabase staging migration workflow before the live actor check is run.

## Acceptance actors

Copy `config/agent-phase2-rls-actors.example.json` if environment variable names differ. The default contract requires:

- standard agent;
- principal/owner;
- branch manager;
- restricted agent;
- inactive agent;
- agent with multiple active memberships.

Credentials stay in environment variables and must not be committed. The runner performs reads only. It checks transactions, participants, commissions, targets, organisation users, leads, private listings, and developments for organisation leakage. It also checks branch-valued results for the branch-manager fixture, commission assignment for restricted/standard agents, inactive-user denial, participant-to-transaction consistency, and explicit selected-workspace filtering for multi-membership users.

The v2 fixture contract also requires `AGENT_RLS_DENIED_ORG_ID`, which must identify a populated organisation to which none of the six actors belongs. The branch-manager fixture requires `AGENT_RLS_DENIED_BRANCH_ID`, a different populated branch in the same organisation. Every organisation-bearing table is probed directly with the denied organisation ID, and branch-bearing tables are probed with the denied branch ID. Evidence stores hashed actor and workspace fingerprints instead of raw IDs.

## Commands

Run the deterministic repository contract from `the-it-guy/`:

```sh
npm run test:agent-phase2-rls-contract
```

After the migration and fixtures exist in staging, provide the variables named in the actor file and run:

```sh
npm run acceptance:agent-phase2-rls
```

For the scale-readiness Phase 1 fail-closed flow, run:

```sh
npm run acceptance:agent-scale-phase1
```

This first reads staging migration history and refuses to run actor acceptance unless migration `20260906065759` is recorded. It never applies or repairs migrations.

Evidence is written to `test-results/agent-phase2/rls-acceptance.json`. Any permission error, cross-organisation row, cross-branch row, foreign commission assignment, inaccessible participant transaction, or inactive-user result fails the command.

For a local pgTAP execution, start the Supabase stack and run:

```sh
supabase test db
```

The local database test requires Docker Desktop or Podman.
