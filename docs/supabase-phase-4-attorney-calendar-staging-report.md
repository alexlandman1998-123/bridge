# Supabase Phase 4 — Attorney Calendar RSVP Lifecycle

## Outcome

Phase 4 has been verified and ledger-recorded on the dedicated Supabase staging project `vaszuxjeoajeuhlcnzzf`.

- Target: staging only
- Production project `isdowlnollckzvltkasn`: not changed
- Migration version: `202607180047`
- Inventory action: `repair_only_after_smoke`
- Original migration SQL replayed: no
- Staging ledger entry confirmed: yes
- Attorney-calendar contract tests: 7 passed, 0 failed

The ten inventoried migration objects were already live. The implementation therefore verified their definitions and behaviour, hardened table privileges, and recorded only the canonical renamed migration version after all smoke checks passed.

## Live capability

The following RSVP lifecycle is operational:

- RSVP expiry and revocation timestamps on appointment participants;
- appointment confirmation timestamp;
- RLS-protected appointment reschedule requests;
- token-scoped public RSVP lookup;
- single-use RSVP submission;
- accepted, declined, and proposed-new-time outcomes;
- idempotent replay of the same completed response;
- rejection of a changed second response;
- deduplicated reschedule requests and notification events.

## Security result

`appointment_reschedule_requests` has RLS enabled with four authenticated policies covering select, insert, update, and delete.

Supabase default privileges had left a direct `anon` table grant. The canonical migration and staging table were hardened by removing all anonymous table privileges, then restoring only authenticated scoped CRUD and service-role access.

Anonymous execution remains intentionally enabled only for:

- `get_appointment_rsvp_by_token(text)`
- `submit_appointment_rsvp(text, text, timestamptz, timestamptz, text)`

Both functions are security-definer functions with a fixed `public` search path and enforce token expiry/revocation internally.

## Behaviour verification

Rollback-only live checks confirmed:

- invalid tokens return no rows;
- revoked tokens return no rows;
- expired tokens return no rows;
- acceptance sets the participant response and confirms the appointment;
- decline sets the participant response and declines the appointment;
- a future proposed time creates exactly one pending reschedule request;
- replaying the same response returns the original result without duplication;
- attempting to change a completed RSVP is rejected;
- proposed times in the past are rejected.

Final persistent staging counts remained unchanged:

| Object | Rows |
| --- | ---: |
| Appointments | 5 |
| Appointment participants | 5 |
| Reschedule requests | 0 |

## Repository correction

The Phase 4 contract test still referenced the migration's former duplicate filename, `202607180025_attorney_calendar_phase4_rsvp_lifecycle.sql`. It now references the canonical stabilized filename, `202607180047_attorney_calendar_phase4_rsvp_lifecycle.sql`.

## Production promotion requirements

Phase 4 is ready for a controlled production smoke-and-ledger operation but has not been promoted.

Before production:

1. Confirm a recoverable production backup and rollback owner.
2. Confirm all ten RSVP lifecycle objects are already live.
3. Do not replay the migration when the live definitions match.
4. Remove any direct anonymous privilege on `appointment_reschedule_requests`.
5. Run invalid, revoked, expired, accepted, declined, replay, and reschedule smoke checks using rollback-only fixtures.
6. Record `202607180047` only after all checks pass.
