# Attorney release readiness — Phase 0 baseline

## Decision

Phase 0 freezes the acceptance boundary for the attorney release. Changes to roles, scenarios, propagation destinations, or visibility rules require an explicit update to `ATTORNEY_RELEASE_PHASE0_VERSION` and this document.

Phase 0 is complete locally when `npm run test:attorney-release-phase0` passes. Staging is ready when `npm run check:attorney-release-phase0:staging` returns `GO`.

Every attorney staging script derives the project reference from its HTTPS Supabase URL and compares it with `SUPABASE_STAGING_PROJECT_REF`. A target matching the production reference is always denied. Write-capable fixture operations additionally require `SUPABASE_STAGING_RECOVERY_CONFIRMED=I_HAVE_A_RECOVERABLE_STAGING_BACKUP`; this acknowledgement belongs only in the ignored staging environment file.

## Supported attorney roles

| Lane | Transaction role | Required environment variables |
| --- | --- | --- |
| Transfer | `transfer_attorney` | `ATTORNEY_TRANSFER_UAT_EMAIL`, `ATTORNEY_TRANSFER_UAT_PASSWORD` |
| Bond | `bond_attorney` | `ATTORNEY_BOND_UAT_EMAIL`, `ATTORNEY_BOND_UAT_PASSWORD` |
| Cancellation | `cancellation_attorney` | `ATTORNEY_CANCELLATION_UAT_EMAIL`, `ATTORNEY_CANCELLATION_UAT_PASSWORD` |

Credentials remain outside source control. Each managed staging actor must authenticate and have an active attorney-firm membership. One account must not impersonate all three roles during release certification.

The provisioner uses role-specific credentials when configured, otherwise it uses deterministic role addresses with the ignored `ATTORNEY_DEMO_PASSWORD`. It assigns only seeded workflow lanes matching that actor's transaction role. Run a dry-run with `npm run provision:attorney-release-actors:staging`; add `-- --apply` only after reviewing the target project, firm, departments, and matter count.

## Frozen scenario matrix

1. Cash, individual parties, no seller cancellation.
2. Bond, married buyer, seller existing bond.
3. Hybrid finance with multiple buyers.
4. Company buyer with bond finance.
5. Trust seller with cancellation.
6. Unknown finance and seller-bond facts remaining in review.

Fixtures must be deterministic, marked as demo data, and discoverable by a stable seed key. `scripts/seed-attorney-demo-transactions.mjs` is the canonical fixture writer; rerunning it restores its deterministic rows. Its seed manifest is the reset and discovery contract.

## Update propagation contract

The receiving modules are the attorney matter workspace, transaction workspace, attorney operations, agent transaction view, buyer portal, and seller portal.

Internal updates stay inside attorney matter and operations views. Professional-shared updates reach professional transaction views but not client portals. Client-visible updates may reach portals only for explicitly selected recipients.

## Scope freeze

Phase 0 authorises fixture and verification work only. It does not change workflow stages, completion rules, permissions, production data, notification delivery, or client-facing wording. Those changes belong to later remediation phases.

## Exit gate

- The frozen contract test passes.
- The staging URL, declared project reference, production exclusion, environment label, and recovery confirmation pass the shared safety assertion.
- All three staging actors are configured and can authenticate.
- Each actor has an active attorney organisation membership.
- A deterministic attorney fixture manifest exists and its expected transaction count is present.
- The scenario and propagation matrices remain unchanged unless the contract version is deliberately advanced.
