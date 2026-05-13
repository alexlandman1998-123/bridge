# Mandate Generator Debug Audit

## Current Files Involved

- `src/pages/agency/AgencyPipelinePage.jsx`: lead workspace actions, seller onboarding send, mandate generate/send actions, lead activity updates.
- `src/pages/SellerOnboarding.jsx`: public seller onboarding form and submission.
- `src/services/privateListingService.js`: canonical private listing, seller onboarding token lookup/update/submit, listing activity.
- `src/pages/LegalDocumentWorkspacePage.jsx`: full-page legal workspace bootstrap for lead/transaction routes.
- `src/components/documents/LegalDocumentWorkspace.jsx`: document lifecycle UI, digital/physical signing controls, signed upload.
- `src/core/documents/mandateDataMapper.js`: central mandate data mapping and preflight validation.
- `src/core/documents/packetWorkflow.js`: template section manifest, placeholder validation, preview HTML.
- `src/core/documents/packetService.js`: packet draft/version generation, preview/PDF generation, signing prep.
- `src/lib/documentPacketsApi.js`: document packet/version/signer persistence.
- `src/lib/agencyPipelineService.js`: lead/contact/activity/appointment local+Supabase pipeline storage.

## Current Data Flow

1. Seller lead is created in agency pipeline (`leads`, `contacts`, local CRM snapshot).
2. Agent sends seller onboarding from the lead workspace.
3. DB-first mode creates/uses `private_listings` and `private_listing_seller_onboarding`; local mode stores token/form state in local seller workflow records.
4. Seller submits onboarding into `private_listing_seller_onboarding.form_data` or local `sellerOnboarding.formData`.
5. Agent opens/generates mandate from lead workspace or `/legal/mandate` route.
6. `mandateDataMapper` maps seller onboarding + lead + agency + agent into one mandate data object.
7. `validateMandateGenerationData` blocks missing legally required fields before persisted generation/send.
8. `packetService` creates/updates `document_packets`, generates `document_packet_versions`, stores data snapshots in packet source context.
9. `LegalDocumentWorkspace` manages preview, lifecycle state, physical download/upload, digital signing prep/send.
10. Lead activities are logged through `addLeadActivity`; private listing activities are logged through `createPrivateListingActivity` where available.

## DB Tables Used

- `leads`
- `contacts`
- `lead_activities`
- `private_listings`
- `private_listing_seller_onboarding`
- `private_listing_activity`
- `private_listing_documents`
- `document_packet_templates`
- `document_template_sections`
- `document_packets`
- `document_packet_versions`
- `document_signing_fields`
- `document_packet_signers`
- `document_packet_events`
- Supabase storage bucket candidates from document packet APIs.

## Known Failure Points Found

- Mandate placeholders were previously assembled directly from a partial lead shape, not from seller onboarding form data.
- Full-page legal workspace stripped `sellerOnboarding.formData` out of the lead context before generation.
- DB-first seller onboarding completion could live only in `private_listing_seller_onboarding`, while the lead snapshot still looked incomplete.
- Packet creation/listing could send non-UUID related references to UUID columns, causing Supabase `400`.
- Packet creation used a short route-loading timeout and waited on audit event creation before returning.
- Appointment loader queried expanded columns that may not exist in the deployed schema, creating noisy `400` errors during the mandate flow.
- Generate was called with `forceGenerate: true`, so missing legal fields could become template-level or send-level failures instead of a clear preflight message.
- Agency legal details, commission defaults, FFC number, and agent phone are not reliably collected in the current seller onboarding path.

## Missing / Mismatched Fields

- Seller onboarding collects `sellerFirstName` / `sellerSurname`; template expects `seller_full_name`.
- Seller onboarding collects `idNumber`, `companyRegistrationNumber`, `trustRegistrationNumber`; template expects `seller_id_number`.
- Seller onboarding stores company/trust representative fields with specific names; template expects representative/capacity placeholders.
- Lead/contact owns email/phone in some paths; onboarding owns them in others.
- Asking price can be `askingPrice`, `estimatedValue`, `budget`, or listing `asking_price`.
- Mandate start/end dates are not directly collected in seller onboarding; mapper now treats them as required and blocks generation when they are missing.
- Commission percentage/amount is not reliably collected before mandate generation and is treated as required.
- Agency registration details, agent FFC, and agent phone are optional warnings because current profile/onboarding data does not guarantee them.

## Current Stabilisation Decisions

- Centralised mandate mapping in `mandateDataMapper`.
- Hydrate seller onboarding by token before generation where Supabase is available.
- Block mandate generation/send when required seller/property/commission/agency/agent fields are missing.
- Runtime preview/generation now uses the same preflight gate for mandates instead of bypassing validation.
- Store `generatedDataSnapshot` and `missingFieldsSnapshot` in packet source context for auditability.
- Keep physical/digital signing paths in existing `LegalDocumentWorkspace`; do not add a new `mandates` table in this pass.

## Phase 2 Canonical Data Pipeline

- `mandateDataMapper.mapSellerOnboardingToMandateData` now accepts one canonical input object: onboarding submission, lead, private listing, agency, organisation, agent, contact, transaction, and mandate draft.
- Preview, packet validation, PDF generation, physical download, and signing preparation consume `context.mandateData.placeholders` through `resolveMandatePacketPlaceholders`.
- Supabase hydration priority is: `private_listing_seller_onboarding.form_data`, private listing fields, lead/contact fields, then local route fallback.
- The mapper records source priority in `mandateData.sourceContext`.
- Packet `source_context_json` and version validation summaries store `generatedDataSnapshot`, `missingFieldsSnapshot`, `warningsSnapshot`, and `sourceContext`.

## Placeholder Mapping Table

| Canonical group | Main inputs | Canonical output | Template placeholders |
| --- | --- | --- | --- |
| Seller identity | `sellerFirstName`, `sellerSurname`, `fullName`, `display_name`, contact/lead name | `seller.fullName` | `seller_full_name` |
| Seller ID / registration | `idNumber`, `passportNumber`, `companyRegistrationNumber`, `trustRegistrationNumber`, `seller_id_number` | `seller.identityNumber` | `seller_id_number` |
| Seller contact | onboarding/contact/lead `email`, `phone` | `seller.email`, `seller.phone` | `seller_email`, `seller_phone` |
| Seller entity | `sellerType`, `entityType`, `ownershipType` | `seller.entityType` | `seller_entity_type`, `seller.entity_type_raw` |
| Representative | representative/company/trust representative fields | `seller.representativeName`, `seller.representativeIdNumber`, `seller.representativeCapacity` | `representative_name`, `representative_id_number`, `representative_capacity`, `seller_representative_name`, `seller_representative_capacity` |
| Property | onboarding, private listing, lead, transaction property fields | `property.fullAddress`, suburb/city/province/postal/erf/unit/scheme | `property_address`, `property_suburb`, `property_city`, `property_erf_number`, `property_unit_number`, `property_asking_price` |
| Mandate terms | mandate draft/onboarding/lead/private listing | `mandate.type`, `mandate.startDate`, `mandate.expiryDate` | `mandate_type`, `mandate_start_date`, `mandate_expiry_date`, `mandate_end_date` |
| Commission | onboarding, lead, agency defaults | `mandate.commissionPercentage`, `mandate.commissionAmount` | `commission_percentage`, `commission_amount`, `mandate_commission_percent`, `mandate_commission_amount` |
| Agency | agency/organisation settings | `agency.legalName`, trading name, registration, VAT, address, branch, logo | `agency_legal_name`, `agency_trading_name`, `agency_registration_number`, `agency_vat_number`, `agency_address`, `organisation_name` |
| Agent | agent/user profile and lead assignment | `agent.fullName`, `agent.email`, `agent.phone`, `agent.ffcNumber` | `agent_full_name`, `agent_email`, `agent_phone`, `agent_ffc_number` |

## Phase 3 Validation Gate

- Action-specific validation now lives in `src/core/documents/mandateValidation.js`.
- Supported actions: `preview`, `generate`, `download`, `send_for_signing`, and `upload_signed`.
- Validation returns `canProceed`, grouped missing fields, warnings, blocking errors, and summary counts.
- Required field groups are Seller Details, Property Details, Mandate Terms, Agency Details, Agent Details, Signing Details, Upload Details, and Template Details.
- Optional fields such as agency registration, VAT, logo, branch, agent FFC, agent phone, spouse details, representative capacity, ERF/unit/sectional-title details are warnings only.
- Packet preview/render now runs mandate validation before rendering; generation runs strict validation before packet persistence/version creation.
- Workspace actions now validate before signer-field preparation, physical download, digital send/resend, and manual signed upload.
- Validation logs use presence summaries for sensitive seller ID/email/phone values instead of raw values.

## Remaining Risks

- A first-class `mandates` table would make status/snapshot reporting cleaner than relying on `document_packets` plus lead fields.
- Digital signing can still depend on document packet signer/storage RLS and template availability.
- Physical signed upload should be tested with real storage bucket permissions.
- Agency settings need a reliable source for legal name, registration number, default commission, and FFC metadata.
