# Rentals CRM phase 23 — tenant tenancy portal

Phase 23 adds the tenancy-bound tenant portal at `/tenant/:token` and its server-side public API.

An expiring, revocable token shows only the linked tenant's tenancy and lease summary. It can submit a maintenance, access, or general request into a separate tenant-request queue. It cannot change a lease, payment, deposit, or canonical tenancy state. The accompanying SQL foundation adds token and request tables with RLS enabled and no direct anon/authenticated grants; the public API uses the server service role only after validating the token.

The SQL foundation must be applied to the target Supabase environment before issuing tenant portal links.
