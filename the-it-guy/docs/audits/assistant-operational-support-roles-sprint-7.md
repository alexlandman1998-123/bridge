# Sprint 7: Assistant, Administrator & Operational Support Roles

## Section A: Support Role Architecture

Support users are non-sales operators.

```text
Owner
  -> Principal
    -> Branch Manager
      -> Agent
        -> Assistant / Coordinator
```

Business assets remain owned by:

```text
Organisation
  -> Agent
```

Assistants and coordinators operate delegated work only. They are never the source of truth for ownership, production, or commission attribution.

## Section B: Assistant Role

Canonical support roles added:

- `assistant`
- `transaction_coordinator`
- `listing_coordinator`
- `admin_coordinator`

Assistant preset:

- Can edit assigned records.
- Can upload documents.
- Can schedule appointments.
- Can send reminders.
- Can coordinate communications.

Blocked:

- Owning leads, listings, or transactions.
- Receiving commission attribution.
- Inviting users.
- Managing branches or organisation settings.
- Receiving offboarding/transfer asset ownership.

## Section C: Coordinator Presets

Transaction Coordinator:

- Branch transaction scope.
- Can coordinate transactions, documents, deadlines, roleplayers, and reminders.
- Cannot access lead/listing ownership transfers.

Listing Coordinator:

- Branch listing scope.
- Can coordinate photos, descriptions, marketing, seller documents, and publishing.
- Cannot access financial ownership or organisation management.

Admin Coordinator:

- Branch operational support scope.
- Can assist with operational records, appointments, documents, and follow-ups.
- Cannot manage users, branches, reporting, or billing.

## Section D: Assistant Dashboard

Added:

- `/assistant/dashboard`
- `AssistantDashboardPage`
- `assistantOperatingService`

Dashboard shows:

- Assigned agents.
- Open leads in support scope.
- Listings in support scope.
- Transactions in support scope.
- Upcoming appointments.
- Pending document requests.
- Governance guardrails.
- Activity matrix.

## Section E: Delegation Framework

Added table:

- `agent_support_assignments`

Relationship:

```text
assistant_user_id
  -> supports
supported_user_id
```

One assistant may support many agents. One agent may have many assistants.

Added service functions:

- `createAgentSupportAssignment`
- `revokeAgentSupportAssignment`
- `getAssistantDashboardModel`

Delegation changes create audit events and do not update asset ownership fields.

## Section F: Notification Routing

The support assignment table includes:

- `notification_enabled`

This gives notification services a source of truth for routing operational alerts to both the production agent and assigned assistant/coordinator.

Notification fan-out still needs to be wired into each event producer.

## Section G: Audit Logging

Assistant assignment changes emit audit events:

- `assistant_assigned`
- `assistant_assignment_revoked`

Audit metadata records:

- Assistant user.
- Supported agent.
- Support role.
- Ownership unchanged.
- Commission attribution unchanged.

Assistant record actions should continue to log the acting user, not impersonate the agent.

## Section H: Enterprise Validation

Implemented protections:

- Support roles are not production roles in reporting headcount.
- Support users are excluded from offboarding and transfer ownership destination lists.
- Support role permission presets omit assignment, invite, branch management, billing, and reporting authority.
- Assistant dashboard stays empty until explicit delegation exists.
- `agent_support_assignments` is protected by RLS.
- Core delegated visibility hooks are available through `bridge_support_can_access_record`.
- Lead, private listing, private listing document, transaction-spine document, and appointment policies now include delegated support access where the existing schema exposes an owner/agent field.

Remaining rollout requirement:

- Wire notification fan-out to `agent_support_assignments`.
- Add listing-level "Assign Assistant" UI actions on the relevant workspaces.
- Validate storage bucket policies and signed URL producers so document downloads cannot bypass delegated record visibility.
- Extend branch-scoped coordinator appointment access once appointments have a canonical `branch_id` or reliable linked-record branch resolver.
