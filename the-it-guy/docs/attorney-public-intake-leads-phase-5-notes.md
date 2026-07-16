# Attorney Leads CRM — Phase 5

Phase 5 exposes the shared Attorney Lead aggregate as an authenticated CRM workspace without turning a Lead into an Incoming Matter or live Matter.

## Delivered

- Protected `/attorney/leads` workspace under Pipeline, beside the unchanged Incoming Matters queue.
- Tenant-scoped Lead list with New, Open, Follow-Ups Due, and Won indicators.
- Search plus stage, service, and source filters; desktop table and mobile cards.
- Manual Lead capture with exact tenant-scoped contact reuse.
- Lead detail and activity history.
- Lifecycle changes across New, Contacted, Qualified, Quote Sent, Follow-Up, Won, and Lost, including a required lost reason.
- Leadership-only creation, copying, previewing, enabling, and disabling of the organisation's public Attorney Journey link.
- Atomic authenticated database commands for manual capture, lifecycle changes, and canonical public-link creation.

## Architectural boundaries

- Leads remain pre-transaction sales opportunities (`lead_domain = 'attorney'`).
- Incoming Matters remain network-referred operational instructions and continue to use their existing transaction assignment and response contracts.
- Public submissions still enter only through the Phase 4 Edge Function and never create Matters.
- Direct authenticated reads rely on the Phase 3 row-level access rules; multi-table writes use security-definer commands with the same permission helper.
- Contact reuse is exact by normalized email or phone inside the organisation. Fuzzy identity merging is intentionally excluded.

## Deferred

- User and branch assignment controls and automation.
- Authored calls, emails, notes, tasks, and follow-up scheduling.
- Quote document generation and delivery.
- Notifications, reminders, SLAs, and analytics funnels.
- Explicit Lead-to-Incoming-Instruction or Lead-to-Matter conversion with idempotency and lineage.
- Cross-module extraction for Estate Agency, Bond Originator, and Developer CRM workspaces.

Those later capabilities should extend the shared Lead aggregate and permission model instead of introducing a second Attorney sales store.
