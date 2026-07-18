# Attorney team Settings — Phase 5

## Outcome

The Attorney Firm users page now consumes the shared attorney-team lifecycle introduced in Phase 4. Settings and onboarding therefore use the same professional roles, practice qualifications, department compatibility rules, invitations, and membership records.

## Settings behaviour

- The roster combines active firm memberships with pending attorney-firm invitations.
- Member identity is hydrated from the linked profile and organisation-user records without treating the generic organisation roster as the source of attorney authority.
- Invitations use canonical `professionalRole`, `practiceQualifications`, and `departmentId` fields.
- Attorney / Conveyancer requires at least one transfer, bond, or cancellation qualification.
- Department choices are filtered to the selected professional profile and validated again in the shared service.
- Active members can have their professional profile, department, and active/suspended status updated.
- Ordinary Settings controls cannot invite, modify, suspend, or remove a protected firm administrator.
- Removing the final active administrator remains guarded by the lower membership service as defence in depth.

## Compatibility boundary

The legacy compatibility role remains persisted while older permission consumers are migrated, but it is derived from the canonical professional profile. Settings no longer exposes generic organisation roles such as owner, admin, assistant, or branch manager for attorney memberships.

Branches remain a separate location-management concept. Attorney access is assigned to operational departments, not branches.

## Verification

Run `npm run test:attorney-team-settings-phase5` followed by the Phase 0–4 attorney role contract checks.
