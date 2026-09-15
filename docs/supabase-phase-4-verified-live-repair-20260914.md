# Supabase Phase 4 Verified-Live Repair

Generated: 2026-09-14

## Scope

Phase 4 evaluates migrations that are already live in production and therefore might be eligible for ledger-only repair. Eligibility must be checked independently in staging; a production object must not be assumed to exist there.

## Completed

| Version | Migration | Staging result |
| --- | --- | --- |
| `20260913120000` | `rental_application_approval_readiness` | Already validated, smoke-tested, and recorded as applied in staging. |

## Reclassification

The following migrations were all live in production but their required objects are absent from staging. They must not be recorded as applied in the staging ledger. They have been reclassified for later original-SQL application after their dependencies are staged.

| Version | Migration | Staging objects present | Dependency blocker |
| --- | --- | ---: | --- |
| `20260913130000` | `rental_notice_acknowledgement_transition` | 0/1 | `20260913123000` has not yet been applied and recorded. |
| `20260914073546` | `email_sending_domains_phase1` | 0/8 | The preceding pending chain through `20260914073037` is not yet staged. |
| `20260914073806` | `email_sending_domain_guard_fix_phase1` | 0/1 | Requires `20260914073546`. |
| `20260914080412` | `email_sending_approval_phase5` | 0/4 | Requires the preceding pending chain through `20260914073809`. |
| `20260914080640` | `email_sending_operator_console_phase6` | 0/2 | Requires `20260914080412`. |
| `20260914083450` | `website_preview_hostname_allowlist_fix` | 1/1 | Its predecessor chain through `20260914080640` is not yet recorded. |

## Decision

No additional staging ledger repair was performed in this phase. Recording any of the six rows would incorrectly state that staging contained the associated implementation.

The next valid action is Phase 5: apply `20260913123000_rental_lease_version_seed_for_conversions.sql` to staging, verify it, record its staging ledger entry, and only then evaluate `20260913130000` again.
