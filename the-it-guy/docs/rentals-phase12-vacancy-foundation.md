# Rentals Phase 12 — Vacancy domain and state machine

Vacancies are Rental operational records, not marketing listings.

- A vacancy snapshots available date, rent, deposit and term against one unit.
- A partial unique index permits only one open vacancy per unit, including during concurrent creation attempts.
- Valid transitions are enforced in the database and recorded immutably in status history.
- Moving into `marketing` requires the Phase 10 landlord/mandate readiness gate; no listing or portal write occurs in this phase.
- The history trigger is a narrowly scoped `SECURITY DEFINER` audit writer with direct execution revoked from API roles. It is necessary because browser users can update vacancies but must never write immutable history themselves.

The reviewed migration is not applied from this workspace.
