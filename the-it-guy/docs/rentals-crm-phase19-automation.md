# Rentals CRM phase 19 — guarded automation

Phase 19 adds `/agent/rentals/pipeline/automation`, a scoped in-app automation queue.

Rules identify overdue existing tasks and leads at `new`, `mandate_pending`, or `fica_pending` that have no open follow-up. Overdue tasks are shown for escalation but never duplicated. For eligible suggestions, a staff member explicitly creates a high-priority internal follow-up due in 24 hours. No rule sends an external message, changes a lead stage, or makes a compliance, approval, or placement decision.
