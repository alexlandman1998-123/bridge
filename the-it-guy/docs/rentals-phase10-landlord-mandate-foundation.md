# Rentals Phase 10 — Landlord relationships and mandates

This phase makes property ownership and management authority explicit without creating a second CRM or touching Sales.

- `rental_property_landlords` links canonical CRM `party_id` values to a Rental property with current/historical relationship status, ownership share, and one primary contact.
- `rental_property_mandates` preserves authority status, lifecycle dates, and management fee terms. Only one active mandate can exist per property.
- `rental_property_marketing_readiness` is a `security_invoker` view. A property is ready only when active landlord shares total at least 100%, a primary contact exists, and an active confirmed unexpired mandate exists.
- Future vacancy/publishing commands must query `marketing_ready` before allowing marketing. The current phase supplies the gate rather than changing Sales or prematurely adding a Rental marketing workflow.

Run the reviewed SQL migrations in order through Phase 10. They have not been applied from this workspace.
