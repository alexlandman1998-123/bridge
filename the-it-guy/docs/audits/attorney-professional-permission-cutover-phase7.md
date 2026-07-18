# Attorney professional permission cutover — Phase 7

## Outcome

Attorney authorization now derives from active membership plus canonical `professional_role` and `practice_qualifications`. The legacy `role` column remains only as a derived compatibility mirror for integrations that have not yet completed their display migration.

## Permission resolution

- Management and support permissions resolve directly from professional role.
- `attorney_conveyancer` permissions are composed from confirmed practice qualifications.
- Transfer and cancellation qualifications expose transfer-workflow capabilities; bond exposes bond-workflow capabilities.
- A multi-qualified conveyancer receives the union of the qualified lane capabilities, but matter access and actions still require an active transaction assignment.
- An attorney/conveyancer with no qualification fails closed.
- A privileged compatibility value cannot elevate a `viewer` professional profile.

The permission hook, legal action resolver, attorney operations dashboard, incoming-matter queue, matter visibility helpers, transaction access projection, firm membership display, and attorney lead role handling now consume the professional profile.

## Database cutover

Migration `202607180040_attorney_professional_permission_cutover_phase7.sql` changes firm-admin and firm-lead RLS helpers to read `professional_role`. It also makes the compatibility role strictly derived on every membership or invitation write, repairs mirrors, and updates the protected owner bootstrap RPC to write the canonical fields.

Transaction lane roles remain unchanged and continue to belong to `transaction_attorney_assignments`.

## Compatibility policy

`attorney_firm_members.role`, `attorney_firm_invitations.role`, `organisation_users.attorney_compatibility_role`, and `profiles.attorney_role` are not authorization sources. Physical removal remains a later cleanup after release telemetry confirms no external consumers depend on them.

## Verification

Run `npm run test:attorney-professional-permission-cutover-phase7` and the complete Phase 0–6 attorney role suite.
