# Rental application field mapping

Phase 1 delivery, 7 October 2026. Owner: primary Arch9 transaction workspace.

## Confirmed fee decision

The application fee will be configured in organisation-scoped Rentals settings and becomes payable **after submission**. Phase 1 does not introduce fee collection. Phase 2 must snapshot the configured amount and fee policy onto the application, display the amount (including explicit no-fee cases), record acknowledgement and expose due/payment status to the agent. Later settings changes must not silently alter an already submitted application. Existing listing fee fields are not the agreed configuration source for this new flow.

## Data ownership and destinations

The public portal writes to the token-linked rental_applications.application_data. Tenant profile and application Applicants read that same record. A saved draft is available to agents; submitted answers are read-only until an authorised correction request reopens the application. Updates use version guards. Lead qualification remains a separate preference/mini-intake record, not a duplicate source of approved application facts.

All fields below remain in the approved tenancy snapshot. “Lease use” describes the intended agreement projection, not a claim that a generated agreement currently contains the field.

| Saved group | Fields | Capture owner | Agent destination | Lease use |
| --- | --- | --- | --- | --- |
| entity | `type`, `legalName`, `registrationNumber`, `countryOfRegistration`, `registeredAddress`, `primaryContactRole` | Applicant / agent draft capture | Tenant entity | Legal tenant / entity identification; authorised people map to tenant representative signers in the lease schedule. |
| identity | `firstName`, `lastName`, `email`, `phone`, `identityType`, `identityNumber`, `nationality`, `dateOfBirth` | Applicant / agent draft capture | People & contacts | Primary person / contact. For an entity, this person is the contact, not the legal tenant. |
| contacts | `postalAddress`, `preferredContactMethod`, `emergencyContactName`, `emergencyContactPhone` | Applicant / agent draft capture | People & contacts | Contact and notice details where the approved lease template requires them. Emergency contacts stay operational. |
| people | `id`, `role`, `firstName`, `lastName`, `email`, `phone`, `identityType`, `identityNumber`, `nationality`, `authorityBasis`, `currentAddress`, `employmentType`, `employer`, `incomeSource`, `monthlyIncome`, `otherIncome`, `monthlyObligations`, `contributesToAffordability` | Applicant / agent draft capture | People & contacts | Joint tenants, representatives and guarantors map by role into tenancy parties and the lease schedule. Income stays in screening. |
| property | `vacancyId`, `unitId`, `listingId`, `title`, `address`, `monthlyRent`, `depositAmount` | Server / agent; applicant read-only | Household & property | Confirmed property identifiers and address; monthlyRent and depositAmount prefill draft terms. |
| household | `intendedOccupationDate`, `occupantCount`, `leasePeriodMonths`, `pets`, `petDetails`, `guarantorRequired` | Applicant / agent draft capture | Household & property | Intended date and preferred term prefill draft terms; occupancy and pet requests require agent confirmation. |
| employment | `employer`, `role`, `employmentType`, `businessName`, `institution`, `incomeSource`, `employerPhone`, `startDate` | Applicant / agent draft capture | Employment | Application screening only; not a default lease document field. |
| income | `monthlyIncome`, `otherIncome`, `monthlyObligations`, `incomeDescription`, `incomeSource`, `depositAvailable` | Applicant / agent draft capture | Affordability | Application screening only; not a default lease document field. |
| rentalHistory | `currentAddress`, `landlordName`, `reasonForMoving`, `landlordPhone`, `landlordEmail`, `currentMonthlyRent`, `housingSituation` | Applicant / agent draft capture | Rental history & references | Screening; current address may supply the template’s notice-address field after confirmation. |
| documentInvalidations | `subjectId` | Server / agent; applicant read-only | Documents | Internal evidence validity metadata, not lease content. |
| documentLinks | `documentId`, `subjectId`, `purpose`, `requirementId`, `generation`, `source`, `invalidated` | Server / agent; applicant read-only | Documents | Evidence references stay in the snapshot; private uploaded files are not copied into an agreement. |
| references | `id`, `type`, `name`, `phone`, `email`, `relationship` | Applicant / agent draft capture | Rental history & references | Application screening only. |

## Permissions and evidence outside answer fields

Privacy, credit-check and identity-verification consents are stored in rental_application_consents, with wording version, applicant source and submission timestamp. The agent Documents tab shows current submission permissions. Additional people can submit their own permission through a scoped secure collection link, or supply signed consent evidence. Each digital permission is bound to the person, requirement generation and current submission. A primary applicant’s checkbox must not stand in for another person’s permission.

Files are stored privately and referenced by rental_application_documents and saved requirement assignments. Received evidence is distinct from accepted evidence. Requirement IDs, subject IDs and generations keep the file tied to the correct person and scenario; identity/authority edits invalidate stale assignments.

## Confirmed handoff

Conversion requires an approved application. rental_convert_application_to_tenancy copies submitted_snapshot_json (falling back to application_data) into tenant_snapshot_json, excluding review and onboarding. It prefills monthly rent and deposit from the protected property snapshot, and lease duration and occupation date from household answers, with vacancy defaults as fallback. These are draft lease terms requiring agent confirmation, not automatically agreed terms. Repeated conversion must not create another tenancy/lease.

The identity, contacts, additional people, finances and history remain available in the tenancy workspace through the shared read-only wizard. Storage of those answers is not permission to place screening data into the lease document.

## Known gaps assigned to later phases

- Agency decision pending: whether the new address and ownership/control rows should be mandatory. They remain optional until confirmed. This implementation does not certify an agency RMCP or choose acceptable alternative evidence on its behalf.
- Full agreement generation requires the agency’s approved rental lease template and its required field map. The current workflow has no active rental clause template. Phase 5 supplies an explicit rendered lease schedule and reviewed agreement reference, not a substitute legal agreement. Electronic rental signing remains gated by the existing classification policy.

## Verification

server/services/rentalApplicationFieldMapping.test.js executes the real applicant API, agent list/review repositories and conversion SQL over isolated PostgreSQL for individual, joint-individual, company, CC and trust scenarios. Every applicant-editable field is populated from the shared field contract; protected property values cannot be replaced by the applicant. Checks include saved/reopened answers, lead linkage, agent values, full tenancy snapshot, draft term precedence and private review/invitation exclusions.

RentalTenantApplicationProfile.test.jsx checks agent rendering for all five scenarios, including additional people, entity details, contacts, property, move date, income (including zero), references and submitted edit locks. Existing field-contract tests cover empty values, false, partial merges and safe profile reuse. Existing review SQL tests cover approval gates and retry idempotency; mapping tests seed approval to isolate the handoff.

Run from the primary package:

```sh
npx vitest run server/services/rentalApplicationFieldMapping.test.js server/services/publicRentalApplicationApi.test.js src/services/rentals/__tests__/rentalApplicationFieldContract.test.js src/services/rentals/__tests__/rentalApplicationDraftPersistence.test.js src/services/rentals/__tests__/rentalApplicationReviewSql.test.js src/pages/rentals/__tests__/RentalTenantApplicationProfile.test.jsx src/pages/rentals/__tests__/RentalApplicationReviewWorkspace.test.jsx
```

These checks do not contact hosted data, send invitations, collect fees or generate a final lease agreement. Production rollout remains separate.

## Phase 2: property, costs and permission

Rentals → Applications → Rental settings stores the organisation’s total application fee (including VAT if applicable) and payment instructions. Owner, principal, director and partner roles may edit it; other authorised rental users can read it. Zero means no application fee. Saving checks the settings version so a stale edit cannot overwrite newer settings.

Each new application receives an immutable fee snapshot when created. Changing the setting affects future applications only. Existing drafts and applications under review receive a zero fee when the migration is applied; completed applications remain uncharged. An application reopened for corrections requires confirmation if no matching acknowledgement is already saved. The applicant confirms the protected property facts, quoted costs and privacy consent before entering the form. The server records the wording version, acceptance times and exact property/cost snapshots. A changed property requires a fresh confirmation before submission. Credit and identity permissions remain separate at final review.

The first successful submission makes a positive fee payable. Payment instructions appear on the submitted page; agents see the quoted fee, confirmation and due time under Payments. There is no checkout, automatic collection or paid-status reconciliation in this phase. Requesting corrections preserves the fee and its original due time.

Focused additions: `server/services/rentalApplicationCosts.test.js`, `src/pages/rentals/__tests__/RentalApplicationFeeSettingsPage.test.jsx` and the property/cost confirmation cases in `RentalApplicantJourneyPage.test.jsx`. These exercise the real local PostgreSQL migration/API/agent repository and the applicant/settings UI. Release requires migration `20261007194611_rental_application_cost_confirmation.sql` together with the app changes.

## Phase 3: submit details and collect documents later

Applicants can submit complete answers and the required declarations with documents still missing, rejected or expired. The original submitted answer snapshot, permissions, property confirmation and fee due time stay fixed. Later document links live in the application’s current evidence ledger; they do not rewrite that answer snapshot. The tenancy retains its source application reference for evidence access. The applicant page and agent overview show application details, document collection (received and accepted counts), and review readiness separately. “Received” does not imply verified or approved.

Submitted and under-review applications keep their token link open for uploads until it expires. Applicants can upload missing documents or replace rejected/expired evidence, but cannot edit submitted answers or replace currently accepted evidence. Final approved, declined and withdrawn applications close collection. Agents can create, copy and revoke a new document collection link from the Documents tab when more time is needed; existing links keep their original expiry. Sharing is manual, with no automatic email delivery.

Late uploads attach through a scoped, version-checked database command. Saved requirement ID and generation tie each upload to the correct person and purpose. An unattached modern upload cannot be mistaken for primary-person legacy evidence. Replacing evidence clears the affected person’s previous screening results so that current evidence must be checked again; other people’s checks remain intact. Approval still requires accepted current evidence, current permissions and screening, and landlord approval. Document-policy expansion and individual invitations remain Phase 4 work.

Focused checks in `server/services/rentalDeferredDocuments.test.js` run the real API, upload service, agent repository and PostgreSQL gates across individual, joint, company, CC and trust applications. They cover later collection, signed upload completion, stale versions, accepted/rejected evidence, scope and link expiry, immutable submitted answers, current screening and final approval. Applicant UI and agent collection-link tests cover the corresponding controls. These checks use isolated local data only.

Release requires the additive `20261007202606_rental_application_deferred_documents.sql` migration and the application changes, following Phase 2. Neither migration has been applied to a hosted environment in this task. The local preview uses disposable sample data and a sample fee, not production settings.

Release compatibility issue discovered during Phase 3: the earlier Phase 2 fee backfill updates existing applications without advancing their version, while the base application trigger requires version + 1 for every update. Before hosted rollout with existing rows, that backfill needs a reviewed release correction. Phase 3 operations were tested with the real base scope/version trigger restored; the disposable fixture applies Phase 2 to an empty database and does not prove the historical-row backfill. Existing migrations were left unchanged under the append-only repository rule.

## Phase 4: document packs and individual permissions

New applications receive a protected version 4 document policy snapshot. Existing applications retain version 3 and their previous requirement matrix. Additional rows cover address evidence for the primary applicant, additional people and legal entities; ownership/control evidence for companies, CCs and trusts; and authority evidence for named representatives and current trust authority records. Address and ownership/control rows are optional pending the agency policy decision. Authority rows are required for approval where the scenario applies. Income evidence remains tied to the applicant/entity and people contributing to affordability, not every beneficial owner or representative. The saved checklist is the source of required/optional status.

Collection happens during the application, before approval; details submission remains possible with outstanding evidence. Each row explains what it is for and the sort of evidence to provide, including contacting the agent for acceptable alternatives. No universal statement period or address-age rule is represented as a legal requirement.

Applicants can select several files for a requirement. Those files form one current pack: every assigned member must be accepted before its required row clears approval. A new selection replaces the current pack and preserves older documents as history. Partial upload failures preserve successfully saved files and show an error; the applicant can retry. Agent review displays every current pack member separately. Private file-opening URLs expire after 60 seconds, and the server verifies the token, application, organisation, storage path and person scope before issuing them.

After submission, agents choose the recipient in Documents → Collect outstanding documents. The primary applicant link opens the complete application collection page; additional-person links show only that person’s current evidence and personal details. Recipients acknowledge their own privacy notice, identity verification, relevant screening and authority to give their own permission. The audited record binds wording version, person details, requirement generation and submission time. It completes that person’s permission requirement but does not complete identity/FICA/screening checks. Manual signed permission evidence remains available for agent review.

Links are manually shared and can be revoked. They close after final decisions and become invalid when that person’s saved identity/generation changes. A replacement link cannot expose another person’s evidence. No invitation email is sent automatically. Existing primary applicant consents remain separate; the primary applicant cannot use their link to give another person’s electronic permission.

Focused coverage: `server/services/rentalDocumentCollection.test.js`, `RentalDocumentPacks.test.jsx`, participant cases in `RentalApplicantJourneyPage.test.jsx` and recipient selection in `RentalApplicationCollectionLink.test.jsx`, alongside the existing submission, fee, review and field-mapping checks. Migration `20261007204950_rental_application_document_packs.sql` is additive and local only. Hosted rollout and the earlier Phase 2 backfill correction remain pending.

## Phase 5: application-to-lease handoff

The additive `20261007211002_rental_application_lease_handoff.sql` migration maps approved tenancy snapshots into source-bound tenant, entity representative and guarantor records. Existing canonical primary-party IDs are retained; additional application subjects are explicitly separate from directory contact UUIDs. Existing tenancy conversions receive the same mapping without duplicating primary parties. Beneficial owners, contacts and affordability contributors do not become signers solely through those roles.

The agent saves dates, rent, deposit, tenant/landlord notice addresses, landlord details, primary representative authority and an agency agreement template/version reference plus document link. The protected save command derives `application_schedule` itself, ignores injected schedule/financial fields, and creates a new draft version. Primary authority needs agent confirmation because onboarding captures the primary contact role but not its authority basis. Additional representatives retain the authority basis captured in the approved application. Each co-tenant/guarantor starts with their approved current address (or the common tenant notice address as fallback); the agent can elect a separate notice address in the versioned lease terms without changing approved identity facts.

The workspace renders all tenant-side signers and downloads a printable HTML lease schedule containing only the explicit identity, entity, property, notice and lease-term fields. Saving or editing clears the review acknowledgement. Preparing signatures binds the acknowledgement to the saved version, validates dates, property/notice addresses, identities, representative authority and agreement reference, and requires exactly the approved tenant-side signers plus the confirmed landlord. The server derives authority from its saved projection, not the submitted signer payload. Signed evidence remains manually recorded; no signing invitation or electronic completion is enabled. Completion checks every signer, including guarantors and representatives, before marking the lease signed. Signatures for superseded versions are rejected and completion is serialized on the lease.

Already-prepared or signed leases retain their historical signer records. Their parties can be displayed from the approved snapshot, but this migration does not silently change the executed signature list. Review those legacy agreements before relying on them for multi-party tenancies.

Verification: `npx vitest run server/services/rentalLeaseApplicationHandoff.test.js src/modules/rentals/shared/tenancies/RentalLeaseSigningPanel.test.jsx server/services/rentalApplicationFieldMapping.test.js src/pages/rentals/__tests__/RentalApplicationReviewWorkspace.test.jsx` from `the-it-guy/`. The new tests execute conversion, projection, protected draft save, signer preparation and all-person completion over local PostgreSQL for all five entity scenarios, exercise the scoped agent repository, check rejected omissions/stale versions/forged data/authorization, and inspect generated HTML for correct fields and private-data exclusions. Component checks cover review invalidation, every role and manual evidence errors.

Hosted migrations have not been applied. The previously recorded fee-backfill correction remains a release prerequisite.

## Phase 6: combined acceptance and release preparation

The full local journey is now exercised for an individual, joint tenants, a company, a CC and a trust: scoped agent invitation → property/cost acknowledgement → submission with missing files → correction request → applicant correction and resubmission → each additional person's private permission link → later document collection → current evidence acceptance and scenario-specific screening → landlord approval → idempotent tenancy conversion → versioned lease schedule → all-person manual signature evidence. The test uses actual public handlers, agent repositories, protected commands, parent RLS/version guards and local PostgreSQL. Approval is not seeded. The fixture agreement is synthetic; these checks do not verify an agency legal template or real signing delivery.

Acceptance exposed an empty-pack aggregation error: a SQL aggregate returned `uploaded` for zero assigned files, making empty requirements display as received. The new additive `rental_empty_document_pack_readiness` migration returns no pack status for zero files, preserving requested/missing state and the existing acceptance rules for actual files. The preview and document-collection tests include the correction.

The existing read-only `scripts/rental-onboarding-release-preflight.sql` now covers the fee settings, personal-permission table, tenancy parties, lease signers, protected command permissions, private draft-save helper, all October 7 migration versions and the legacy-row fee-backfill precondition. Local acceptance checks assert that the audit changes neither applications nor event counts. An unexpired token and the permitted organisation/branch are still required; expired/revoked tokens and another agent scope are denied.

The legacy-row acceptance test reproduces the earlier fee migration's failure with the real base version guard enabled. A later migration cannot fix an UPDATE that fails before it is reached. The preflight explicitly reports `fee_backfill_release_blocked` when that fee migration is pending and eligible existing applications remain. Do not disable triggers, bypass application approval or alter old migrations as a release workaround. A reviewed compatibility correction is required before an upgrade containing those rows.

Local verification: 144 checks across 17 focused test files passed, including the eight new combined-journey/release checks. Focused ESLint passed. The browser fixture was restarted with the empty-pack correction and its API reports missing requirements for the fresh sample. Desktop and 390px mobile browser checks passed without horizontal overflow. An actual PDF upload changed only its identity requirement to received; private Open returned HTTP 200 with PDF bytes. The broader `check:app` passed lint (existing warnings), all baseline Node checks and the production build/login probe. A stronger two-organisation denial case then passed with all eight combined-journey checks again; focused lint remained clean. The browser preview was reset to a fresh draft after verification. An initial browser selector expected “Open” instead of the actual filename-labelled button; the corrected private-preview check passed.

Release remains blocked by the historical-row fee correction and by the missing approved agency lease template if the release is intended to include full agreement generation. The optional address/ownership document policy remains the existing provisional setting, pending the agency decision. No hosted SQL, fee collection, email, electronic signing, deployment or customer-record change was performed.

### October 7 reviewed migration inventory

These depend on the earlier rental onboarding, document storage, review, consent, RLS, tenancy and lease-version baseline. Verify the target's exact definitions/history; do not deploy the entire active working tree.

| Migration | SHA-256 |
| --- | --- |
| `20261007194611_rental_application_cost_confirmation.sql` | `85e1ec4cd0b29fe890927ed3b812e8a724e482121dd640b52fd3107fcc8e2c90` |
| `20261007202606_rental_application_deferred_documents.sql` | `7bb23e1506ecfdab058f5f5bdce9ebde724e6d02edb7c72c3238425da2dd1c87` |
| `20261007204950_rental_application_document_packs.sql` | `76112c402895c4c0163add037b7609708fdfdd3e9098a5ef6fd9e53d7d86759a` |
| `20261007211002_rental_application_lease_handoff.sql` | `f65ace66872e32817d3f48108d7114caf8dc0941465730784b47ab4027c01021` |
| `20261007212433_rental_empty_document_pack_readiness.sql` | `49c706b43f42df177b8dd8be5257b5c512b8a997c0d2073cff80f22900722d20` |

After blockers are resolved and release is explicitly approved: follow `docs/database-release-runbook.md`, name the target, run the Supabase guard, capture recovery evidence, inspect the exact pending/dry-run scope from an isolated reviewed checkout, run the read-only preflight, apply only approved compatible migrations and the matching application/API update, then repeat the journey with authorised disposable records under actual Auth/RLS/Storage. Include two organisations, branch reassignment, expired/revoked links, concurrent edits, upload/download/replacement and the agency's real agreement output. Preserve submitted answers, fee quotes, evidence, versions and signatures if rollout needs recovery; use an append-only reviewed repair and compatible app rollback.

## Production release — 7 October 2026

The Phase 1–6 updates are deployed to https://app.arch9.co.za. The five rental application migrations and the new append-only fee backfill compatibility migration (`20261007213448`) are applied and their recorded SQL matches the reviewed files. The compatibility migration ran immediately before the cost confirmation migration, advancing the versions of 16 historical applications and retaining their zero-fee quotes. The previously reported fee backfill blocker is resolved. Agents must configure any nonzero fee through Rentals settings.

The release also includes the rental dashboard, lead classification, tenant qualification and email updates. See [the verified production release record](../../docs/production-release-20261007.json) for the exact migration scope, source commit, deployed automation versions, recovery evidence and verification limits. A real signed-in tenant submission and inbox delivery remain manual acceptance checks.
