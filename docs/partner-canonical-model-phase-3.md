# Partner Canonical Model — Phase 3 Identity Linking

Date: 2026-07-20

Status: Implemented in source; not deployed

## Outcome

Phase 3 closes the duplicate-creation path between saved external partners, partner invitations, and accepted organisation relationships.

The implementation adds:

- an explicit `partner_invitations.external_partner_id` reference;
- idempotent partner-role upserts through `bridge_upsert_organisation_partner_identity`;
- one pending invitation per sender and recipient identity;
- acceptance-time linking from the external partner to the accepted platform organisation;
- deterministic duplicate repair with `partner_identity_aliases` preserving replaced IDs;
- foreign-key reassignment for transaction and private-listing role-player references before a duplicate is removed.

## Identity rules

Automatic identity decisions use only these rules:

1. An explicit external-partner ID supplied when the invitation is created.
2. An explicit platform organisation ID.
3. The canonical unordered organisation relationship pair.
4. An accepted invitation whose recipient organisation was verified in the acceptance flow.
5. For preventing an identical external-contact form from being submitted twice: owner organisation, role, exact normalized email, and exact normalized company name.

Email alone, company name alone, website, phone number, and fuzzy similarity do not link a contact to a platform organisation. Email matching is only used for organisation linking after invitation acceptance provides the required verification context.

Different partner roles remain separate operational records but appear as one organisation in the unified directory.

## Write behavior

`saveOrganisationPreferredPartner` first calls the controlled upsert RPC. The RPC obtains an advisory transaction lock and reuses an existing deterministic identity before inserting. During rollout, the existing direct-table behavior remains as a missing-RPC compatibility fallback.

The add-partner flow passes the saved partner ID into `createPartnerInvitation`. A repeated or concurrent invitation returns the existing pending invitation instead of inserting another row. A database unique index is the final concurrency guard.

When an invitation is accepted, the invitation update includes `recipient_organisation_id`. A database trigger then:

- links the referenced external record to the accepted organisation;
- falls back to the verified invitation email only when no explicit reference exists;
- merges an existing linked role record if necessary;
- rewrites dependent foreign keys;
- records the removed ID in `partner_identity_aliases`.

Transaction role-player contact snapshots are not rewritten.

## Migration repair

Migration `202607200009_partner_identity_linking_and_deduplication.sql` repairs only deterministic duplicates:

- same owner, platform organisation, and partner role; or
- same owner, role, normalized email, and normalized company name for unlinked external contacts.

Duplicate pending invitations are retained as lifecycle history and changed to `revoked`; they are not deleted.

The migration also reconciles the preferred-partner role constraint so `cancellation_attorney` is accepted.

## Verification

- Phase 3 identity-linking contract passed.
- Phase 2 unified-directory compatibility and UI contracts passed.
- Full application service test suite passed.
- Phase 19 migration-inventory guard passed with migration `202607200009` included.
- The migration compiled against the linked production schema inside a transaction whose final `COMMIT` was replaced with `ROLLBACK`.
- Follow-up catalog checks confirmed that neither the RPC nor the new invitation column persisted.

## Deployment order

1. Reconcile and authorize the migration ledger entry.
2. Apply migration `202607200008` if the unified read model is not already deployed.
3. Apply migration `202607200009`.
4. Deploy the web application changes.
5. Deploy the `accept-partner-invitation` edge function if its current deployed version predates recipient-organisation binding.
6. Verify repeated save, repeated invite, concurrent invite, and invitation acceptance in staging.
7. Audit `partner_identity_aliases` and revoked duplicate invitation counts before production promotion.

No staging or production data was changed during implementation or verification.
