# Rentals CRM phase 24 — landlord portal foundation

Phase 24 adds the property-bound landlord portal at `/landlord/:token` and its server-side API.

An expiring, revocable token shows only the linked rental property's operational details and latest mandate status. It can submit a maintenance approval, listing instruction, or general instruction into a separate, staff-managed queue. It cannot change a mandate, listing, tenancy, or financial record directly. The SQL foundation enables RLS and revokes direct anon/authenticated access; public-token access is validated only in the server API.

The SQL foundation must be applied before landlord portal links can be issued.
