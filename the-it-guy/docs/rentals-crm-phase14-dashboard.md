# Rentals CRM phase 14 — operational dashboard

Phase 14 adds a read-only rental CRM dashboard at `/agent/rentals/pipeline/dashboard`.

It aggregates only the leads and follow-up tasks visible in the current rental workspace scope. It shows landlord and tenant pipeline distribution, lead handoff counts, and operational attention counts for overdue follow-ups, pending mandates, and pending FICA. The dashboard is a queue-management view: it does not decide FICA outcomes, approvals, or tenant placement.

The dashboard links directly to the existing lead, follow-up, FICA, and mandate workspaces, which remain the places where records are changed.
