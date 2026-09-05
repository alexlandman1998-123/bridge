# Rentals CRM phase 21 — management reporting

Phase 21 adds `/agent/rentals/pipeline/management-report` for scoped operational reporting by agent and branch.

The report shows active lead workload, recorded won/lost/nurture outcomes, current overdue and open follow-up counts, and active-lead aging. “Current open-task health” is the share of current open commitments that are not overdue; it is intentionally not presented as historical SLA compliance, because task completion timestamps are not yet captured in the shared CRM task record.
