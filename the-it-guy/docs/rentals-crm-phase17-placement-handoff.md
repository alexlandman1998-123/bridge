# Rentals CRM phase 17 — tenant placement handoff

Phase 17 adds `/agent/rentals/pipeline/placement-handoff`.

Only a tenant lead at `placement_ready` can start this handoff. It creates the existing operational lease workflow against a selected rental listing, then links the resulting tenancy workflow, listing, and optional application reference back to the CRM lead with an audit activity. If the link fails after the lease saves, the user is told explicitly that the lease exists but needs reconciliation.

This handoff does not certify a lease, verify a deposit, approve a tenant, or complete check-in; those remain explicit tenancy workflow actions.
