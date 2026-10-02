# Rental application field contract

The primary transaction workspace owns this application model. Agent capture and online onboarding now use the same eight-step RentalApplicationWizard, field contract and submission validation.

## Ownership and reuse

Identity, entity and contact details form the reusable tenant profile projection. An application holds its own snapshot plus its property, household, additional people and their application roles, employment, income and rental history. Reuse is explicit through extractReusableRentalTenantProfile/prefillRentalApplicationFromProfile; changing a profile never rewrites a submitted application. The agent can explicitly reuse identity/entity/contact details from another application linked to the same lead. This scoped projection uses the existing application records rather than creating a second client database.

Application data remains in existing rental_applications.application_data JSON. The field capture contract itself requires no schema change; the review and handoff workflow below introduces a separate migration. Documents, consents, screening, decisions and submitted snapshots remain separate existing records. Agent invitation metadata stays server-owned.

## Setup sequence

1. Tenant entity
2. People & contacts
3. Household & property
4. Employment
5. Affordability
6. Rental history & references
7. Documents & FICA
8. Review & declarations

## Field map

Collection groups use stable person/reference IDs. The primary contact is stored once in identity; additional people hold co-tenant, representative, trustee, beneficial-owner or guarantor roles. Entity.primaryContactRole permits the primary contact to be the representative without entering that person twice. A current residential address belongs to rentalHistory.currentAddress; contacts does not repeat it. Registered entity and postal addresses serve different purposes.

| Saved group | Ownership | Fields |
| --- | --- | --- |
| entity | profile | type, legalName, registrationNumber, countryOfRegistration, registeredAddress, primaryContactRole |
| identity | profile | firstName, lastName, email, phone, identityType, identityNumber, nationality, dateOfBirth |
| contacts | profile | postalAddress, preferredContactMethod, emergencyContactName, emergencyContactPhone |
| people | application | id, role, firstName, lastName, email, phone, identityType, identityNumber, nationality, authorityBasis, currentAddress, employmentType, employer, incomeSource, monthlyIncome, otherIncome, monthlyObligations, contributesToAffordability |
| property | application | vacancyId, unitId, listingId, title, address, monthlyRent, depositAmount |
| household | application | intendedOccupationDate, occupantCount, leasePeriodMonths, pets, petDetails, guarantorRequired |
| employment | application | employer, role, employmentType, businessName, institution, incomeSource, employerPhone, startDate |
| income | application | monthlyIncome, otherIncome, monthlyObligations, incomeDescription, incomeSource, depositAvailable |
| rentalHistory | application | currentAddress, landlordName, reasonForMoving, landlordPhone, landlordEmail, currentMonthlyRent, housingSituation |
| references | application | id, type, name, phone, email, relationship |

## Scenarios

Individual and joint applicants use personal employment/income questions; a joint application needs a co-tenant. Companies, close corporations and trusts require entity identity and a representative, and use entity income rather than employee questions. Employed, self-employed, contract, student, retired, unemployed and other income paths are defined. Additional people can provide their own financial answers; contributing to affordability must be explicit. A required guarantor must be a linked person. Occupants are a household count and do not automatically become contracting tenants.

Document checklists now follow the selected entity and each additional person. Entity registration/authority and additional-person identity/consent evidence are required, with income evidence for guarantors and explicit contributors. documentLinks assigns each existing document row to a subject and purpose without duplicating fields or changing the database schema. Uploads remain unverified until reviewed; agency-specific screening/FICA policies and decisions remain separate.

## Saving and submission

Partial object sections merge by field. Zero, false and explicit empty values are retained; collections are replaced explicitly, including an empty array. Unrecognised stored metadata is preserved. Draft status and optimistic version checks prevent overwriting a submitted or concurrently edited application. Public patches may change only defined applicant fields; rent/property context, invitation tracking and internal agent data cannot be changed. Public reads omit internal notes and workflow metadata.

Submission requires meaningful answers, supporting documents and recorded applicant consents, using the same validation in browser and API. New agent drafts use schemaVersion=arch9_rental_application_fields_v2. Reopening a legacy draft in the shared wizard upgrades it explicitly on save; submitted records stay read-only. The schema version is server-owned and cannot be downgraded in an applicant patch.

The legacy activity reader now preserves tenantLeadId in capture metadata and reopening. It remains a historical adapter; new applications use canonical rental_applications records.

## Onboarding and document transport

Create application draft supports agent capture without generating an invitation. Create secure application link supports 1/3/7/14-day expiry, rotates prior access tokens, and records issuance separately from manual sharing. Copying a link does not send it. Agents can mark a shared link sent or revoke it; application submission time is shown separately. Raw invitation tokens exist only in the returned link, never in application JSON.

Supporting files use signed direct uploads to private Supabase storage, followed by a signed ten-minute receipt. The API verifies application scope, optimistic version, person/purpose, actual stored MIME type and size before creating the evidence row and document assignment. This avoids the hosting API body limit for files up to 8 MB. Failed record finalisation attempts clean up the new document and storage object. An abandoned direct upload may remain private without a document row and does not count toward submission.

Applicants save explicitly or through Continue and resume with the same valid link; unsaved browser edits trigger a leaving warning. Agents preserve unsaved drafts across workspace tabs. Consents and authority declarations are applicant-owned, are not prechecked or reused, and are recorded with the submitted snapshot. Each additional person's signed consent evidence still requires review. No email dispatch, remote upload, database migration or release was performed during implementation.

## Review, decisions and lease preparation

Phase 3 adds scoped, optimistic-version reviewer commands for document acceptance/rejection, manual screening per person/entity, recorded landlord responses and correction requests. Required document slots and screening subjects follow the same entity, additional-person and financial-contributor definitions as onboarding. Accepting a document or passing a check requires an evidence note and records the authenticated reviewer. Screening is a human record, not an external credit, FICA or identity provider integration.

Approval requires accepted current documents, consent for the current submission, current unexpired screening for each applicable subject and recorded landlord approval. The database enforces these gates independently of the page. Submitted answers and final outcomes are locked. A correction request reopens the existing application, displays only the explicitly shareable correction message on the applicant link, invalidates old document/screening acceptance and requires a fresh submission and consent. Internal reviewer notes remain private. The event register retains the previous review history. Landlord responses are recorded by the agent from phone, email, meeting or written evidence; this does not send the landlord a decision request.

Private evidence downloads use an authenticated, branch-scoped server endpoint and sixty-second signed URLs. Browser clients cannot directly accept documents or upsert screening outcomes. The security-invoker review view continues to honour existing branch access.

The Lease tab prepares one tenancy and lease draft from the approved submitted snapshot; repeat requests return the same records. Entity, people, contacts, household and financial details remain available in the tenancy Tenant tab. Occupation comes from household.intendedOccupationDate with a legacy fallback; the unit is reserved for lease preparation. Lease signing and move-in continue through the existing tenancy workflow. The application journey reads the actual lease status and does not claim a signature before one is recorded. No lease is activated automatically.

Activation requires applying supabase/migrations/20261002213625_rental_application_review_and_handoff.sql and releasing the corresponding app/API code together. The migration is prepared and tested locally; no remote database push or email dispatch is part of this implementation. Existing incomplete reviews must be reviewed through the new controls before approval. Existing final applications remain available for lease preparation.
