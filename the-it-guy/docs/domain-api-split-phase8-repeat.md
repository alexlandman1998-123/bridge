# Domain API Split Phase 8: Repeat

Date: 2026-07-31

## Scope

Phase 8 turns the Agent Listing Detail split into a repeatable playbook for the remaining large domains.

Repeat one domain at a time. Do not run a broad cross-domain extraction. Each domain keeps its own baseline, import inventory, read-only facade, lazy action pass, parity tests, audit gate, and staged rollout.

## What Changed

- Added `config/domain-api-split-phase8-repeat-plan.json`.
- Added `scripts/domain-api-split-phase8-repeat.test.mjs`.
- Added `npm run test:domain-api-split-phase8-repeat`.
- Kept Dashboard globally enforced.
- Kept all repeat domains report-only in the global chunk audit until their own strict promotion criteria pass.

## Repeat Order

Use this order:

1. Client Portal
2. Unit Detail
3. Attorney Transaction Detail
4. Pipeline

Agent Listing Detail remains the completed pilot pattern, but it is not globally enforced yet because the strict preload-reference audit still sees the known click-time lazy-service `api-*.js` reference.

## Per-Domain Phase Sequence

Run every remaining domain through the same sequence:

1. `domain_baseline`
   - Capture current route chunk, static script gzip, static API dependency, and role ownership.

2. `import_inventory`
   - Identify direct and transitive imports of `src/lib/api.js`, `src/services/privateListingService.js`, and `src/lib/agencyPipelineService.js`.

3. `read_only_facade`
   - Extract narrow read-only facades first.
   - Do not move mutations yet.

4. `lazy_user_actions`
   - Move click-time or post-load mutations behind dynamic imports.
   - Keep synchronous render helpers local or in small pure modules.

5. `parity_tests`
   - Prove lazy wrappers still call the intended services.
   - Prove converted call sites are awaited.
   - Prove copied pure helpers match source behavior where practical.

6. `domain_audit_gate`
   - Require zero tracked heavy static imports.
   - Require zero static `api-*.js` route dependencies.
   - Require entry and static-script budgets to pass.

7. `staged_rollout`
   - Use local preflight, staging internal, production canary, then production full.
   - Roll back by redeploying the previous application version unless that domain has a real alternate runtime path.

## First Facade Boundaries

### Client Portal

Start with:

- token workspace reads
- notification reads
- document signed URL reads
- seller portal session reads

Defer:

- uploads
- bond application submission
- password recovery
- service reviews
- issue submission
- seller interest requests
- co-applicant invitations

### Unit Detail

Start with:

- unit workspace shell reads
- unit detail reads
- transaction rollup reads
- workflow snapshot reads

Defer:

- transaction deletion
- document upload
- finance mutations
- alteration writes
- attorney closeout writes
- client issue sign-off

### Attorney Transaction Detail

Start with:

- transaction core reads
- transaction rollup reads
- matter financial read model
- final report reads

Defer:

- registration
- archiving
- roleplayer save
- document uploads
- finance writes
- bond application mutations
- workflow actions

### Pipeline

Start with:

- pipeline dashboard read models
- pipeline list read models
- board summary reads
- notification read models

Defer:

- agency lead CRUD
- appointment reconciliation
- seller onboarding
- private listing activation
- document generation
- board mutations

## Required Commands

For each domain:

```bash
npm run build
node scripts/domain-import-inventory.mjs --domain <domain>
node scripts/domain-api-chunk-audit.mjs --domain <domain> --enforce --max-api-gzip-kb 1
node scripts/domain-api-chunk-audit.mjs --domain <domain> --enforce --max-api-gzip-kb 1 --enforce-preload-references
npm run test:domain-import-inventory
npm run test:domain-api-chunks
npm run test:performance-budget
```

Use the non-preload chunk audit for the domain audit gate. Use the strict preload-reference audit only for global `enforceClean` promotion.

## Promotion Rules

A domain can get its own Phase 6-style gate when:

- tracked heavy static imports are zero
- static API route dependencies are zero
- entry and static-script budgets pass
- domain parity tests pass

A domain can be promoted to global `enforceClean: true` only when:

- the strict preload-reference audit passes with `--max-api-gzip-kb 1`
- staged rollout completes without blocking incidents

## Stop Conditions

Stop repeat work for the current domain if:

- Dashboard loses global enforcement.
- The domain split starts touching unrelated domains.
- Mutation-heavy flows are moved before read-only facade parity is proven.
- The route gets smaller but parity coverage is missing.
- The strict preload-reference boundary is ignored and `enforceClean: true` is enabled too early.
