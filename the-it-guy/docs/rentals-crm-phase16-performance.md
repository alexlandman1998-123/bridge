# Rentals CRM phase 16 — lead performance

Phase 16 adds `/agent/rentals/pipeline/performance`, a scoped, read-only lead-source report.

It groups visible landlord and tenant leads by their captured source, then shows lead volume and workflow handoffs. For reporting only, a landlord handoff means `listing_ready` and a tenant handoff means `placement_ready`. The displayed rate is therefore a workflow-handoff rate, not a revenue, tenancy, screening, FICA, or financial-conversion metric.
