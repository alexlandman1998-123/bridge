# Phase 5 Onboarding Engine Notes

## Backend State

Phase 5 introduces `onboarding_states` and `onboarding_events`.

`onboarding_states` is the authoritative resumable state for:

- onboarding status
- current onboarding step
- onboarding path
- workspace action
- app role
- workspace type
- intended organisation role
- recovery reason
- completion timestamp
- debugging context

`onboarding_events` records lifecycle events such as workspace creation, invite acceptance, access requests, failed completion validation, recovery, and completion.

## Completion Contract

No UI component should set `profiles.onboarding_completed = true` directly.

Completion must go through `completeOnboarding()`, which validates backend records before updating the profile:

- profile exists
- app role is valid
- active membership exists for non-client roles
- workspace/firm exists
- default branch/team/department exists when required
- settings/profile records exist when required

If validation fails, onboarding remains incomplete and the user is routed to setup/recovery.

## Recovery Rules

The recovery engine maps incomplete backend state to user-facing recovery states:

- missing profile
- missing workspace
- missing membership
- pending approval
- missing branch assignment
- missing department
- missing workspace settings
- invalid onboarding state

Recovery screens should avoid database terminology and point users to the next action.

## Legacy Compatibility

Legacy agency onboarding, organisation invite onboarding, and attorney firm onboarding now call the central engine before completion. Attorney firm support remains compatible with `attorney_firms` and `attorney_firm_members`.

Local invite storage is blocked unless local fallbacks are explicitly enabled, preventing localStorage-only invite authority in production.

## Phase 6 Risks

- Client transaction invite validation still needs a dedicated backend contract.
- Some legacy agent invite UI still exists and should be migrated fully to `workspace_invites`.
- RLS policies need to be expanded so onboarding state changes cannot be spoofed across workspaces.
- Branch/team assignment repair is currently routed to setup; admin-guided repair screens should become more specific.
