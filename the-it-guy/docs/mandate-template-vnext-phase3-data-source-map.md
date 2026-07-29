# Mandate Template vNext Phase 3 Data Source Map

Generated: 2026-07-28T12:00:00.000Z

Version: mandate_template_vnext_phase3_data_source_map_v1

## Summary

Total mandate fields: 85

Registry-required fields: 10

vNext readiness-critical fields: 10

| Status | Count |
| --- | --- |
| filled | 44 |
| optional | 15 |
| conditional | 15 |
| runtime_generated | 11 |

## Source Domains

| Owner | Collection Surface | Fields | Purpose |
| --- | --- | --- | --- |
| Company Settings | Company Settings | 10 | Organisation legal identity, firm-level compliance numbers, branch metadata, and brand assets. |
| Agent Profile | User / Agent Profile | 4 | Assigned agent identity, contact details, and individual FFC information. |
| Seller Onboarding | Seller Onboarding | 18 | Seller legal identity, authority, contact details, and mandate preference answers. |
| Property / Listing | Seller Onboarding + Private Listing | 14 | Property address, title profile, listing facts, and display address details. |
| Mandate Draft | Mandate Setup | 19 | Mandate-specific commercial terms, dates, special conditions, and selected attorneys. |
| Mandatory Disclosure | Mandatory Disclosure Form | 4 | Prescribed disclosure form status, signed/locked date, annexure title, and summary comments. |
| Legal Routing | Generated Legal Scenario | 4 | Computed clause-profile and scenario fields used to select conditional content. |
| Signing System | Signing Runtime | 4 | Signature placeholders, initials fields, and final signing timestamps. |
| Document Runtime | Document Generator | 8 | Generated references, template version metadata, annexure labels, and platform defaults. |

## Readiness Gaps

No blocking or vNext readiness gaps in the supplied placeholder payload.

## Field Map

| Field | Owner | Surface | Policy | Value Status | Primary Paths | Fallback Paths |
| --- | --- | --- | --- | --- | --- | --- |
| seller_full_name | Seller Onboarding | Seller Onboarding | block_generation | filled | mandateDraft.sellerFullName; onboardingSubmission.sellerFullName; onboardingSubmission.firstName + onboardingSubmission.lastName | contact.name; lead.name |
| seller_id_number | Seller Onboarding | Seller Onboarding | block_generation | filled | mandateDraft.sellerIdNumber; onboardingSubmission.idNumber; onboardingSubmission.companyRegistrationNumber | lead.sellerIdNumber |
| seller_email | Seller Onboarding | Seller Onboarding | optional_hide_when_empty | filled | mandateDraft.sellerEmail; onboardingSubmission.email | contact.email; lead.sellerEmail |
| seller_phone | Seller Onboarding | Seller Onboarding | optional_hide_when_empty | filled | mandateDraft.sellerPhone; onboardingSubmission.phone | contact.phone; lead.sellerPhone |
| seller_entity_type | Seller Onboarding | Seller Onboarding | optional_hide_when_empty | filled | mandateDraft.sellerEntityType; onboardingSubmission.ownershipType | lead.sellerType |
| seller_marital_status | Seller Onboarding | Seller Onboarding | optional_hide_when_empty | optional | mandateDraft.sellerMaritalStatus; onboardingSubmission.maritalStatus | derived from onboardingSubmission.ownershipType when explicit marital status is absent |
| seller_spouse_full_name | Seller Onboarding | Seller Onboarding | conditional_required | conditional | onboardingSubmission.*; mandateDraft.seller* | lead.seller*; contact.* |
| seller_spouse_id_number | Seller Onboarding | Seller Onboarding | conditional_required | conditional | onboardingSubmission.*; mandateDraft.seller* | lead.seller*; contact.* |
| seller_spouse_email | Seller Onboarding | Seller Onboarding | conditional_required | conditional | onboardingSubmission.*; mandateDraft.seller* | lead.seller*; contact.* |
| seller_spouse_consent_required | Seller Onboarding | Seller Onboarding | conditional_required | filled | onboardingSubmission.*; mandateDraft.seller* | lead.seller*; contact.* |
| seller_company_registration_number | Seller Onboarding | Seller Onboarding | conditional_required | conditional | onboardingSubmission.*; mandateDraft.seller* | lead.seller*; contact.* |
| seller_representative_name | Seller Onboarding | Seller Onboarding | conditional_required | conditional | onboardingSubmission.*; mandateDraft.seller* | lead.seller*; contact.* |
| seller_representative_capacity | Seller Onboarding | Seller Onboarding | conditional_required | conditional | onboardingSubmission.*; mandateDraft.seller* | lead.seller*; contact.* |
| seller_resolution_date | Seller Onboarding | Seller Onboarding | conditional_required | conditional | onboardingSubmission.*; mandateDraft.seller* | lead.seller*; contact.* |
| seller_authority_basis | Seller Onboarding | Seller Onboarding | conditional_required | conditional | onboardingSubmission.*; mandateDraft.seller* | lead.seller*; contact.* |
| seller_trust_registration_number | Seller Onboarding | Seller Onboarding | conditional_required | conditional | onboardingSubmission.*; mandateDraft.seller* | lead.seller*; contact.* |
| seller_trustee_names | Seller Onboarding | Seller Onboarding | conditional_required | conditional | onboardingSubmission.*; mandateDraft.seller* | lead.seller*; contact.* |
| seller_domicilium_address | Seller Onboarding | Seller Onboarding | optional_hide_when_empty | optional | mandateDraft.sellerDomiciliumAddress; onboardingSubmission.domiciliumAddress; onboardingSubmission.residentialAddress | contact.address; lead.address |
| erf_number | Property / Listing | Seller Onboarding + Private Listing | optional_hide_when_empty | optional | mandateDraft.erfNumber; onboardingSubmission.erfNumber | privateListing.erfNumber; lead.erfNumber |
| erf_size | Property / Listing | Seller Onboarding + Private Listing | optional_hide_when_empty | optional | onboardingSubmission.property*; privateListing.* | lead.property*; transaction.property* |
| floor_size | Property / Listing | Seller Onboarding + Private Listing | optional_hide_when_empty | optional | onboardingSubmission.property*; privateListing.* | lead.property*; transaction.property* |
| property_address | Property / Listing | Seller Onboarding + Private Listing | block_generation | filled | mandateDraft.propertyAddress; onboardingSubmission.propertyAddress; onboardingSubmission.propertyAddressDetails | lead.propertyAddress; lead.sellerPropertyAddress |
| property_suburb | Property / Listing | Seller Onboarding + Private Listing | optional_hide_when_empty | optional | onboardingSubmission.property*; privateListing.* | lead.property*; transaction.property* |
| property_city | Property / Listing | Seller Onboarding + Private Listing | optional_hide_when_empty | optional | onboardingSubmission.property*; privateListing.* | lead.property*; transaction.property* |
| property_type | Property / Listing | Seller Onboarding + Private Listing | optional_hide_when_empty | filled | onboardingSubmission.property*; privateListing.* | lead.property*; transaction.property* |
| property_title_type | Property / Listing | Seller Onboarding + Private Listing | optional_hide_when_empty | filled | mandateDraft.propertyStructureType; onboardingSubmission.propertyStructureType | privateListing.propertyStructureType; lead.propertyStructureType |
| property_unit_number | Property / Listing | Seller Onboarding + Private Listing | conditional_required | conditional | onboardingSubmission.property*; privateListing.* | lead.property*; transaction.property* |
| property_section_number | Property / Listing | Seller Onboarding + Private Listing | conditional_required | conditional | onboardingSubmission.property*; privateListing.* | lead.property*; transaction.property* |
| property_complex_name | Property / Listing | Seller Onboarding + Private Listing | conditional_required | conditional | onboardingSubmission.property*; privateListing.* | lead.property*; transaction.property* |
| property_estate_name | Property / Listing | Seller Onboarding + Private Listing | conditional_required | conditional | onboardingSubmission.property*; privateListing.* | lead.property*; transaction.property* |
| property_display_address | Property / Listing | Seller Onboarding + Private Listing | optional_hide_when_empty | filled | computed from property_unit_number + property_complex_name + property_estate_name + property_address | property_address |
| sectional_title_number | Property / Listing | Seller Onboarding + Private Listing | conditional_required | conditional | onboardingSubmission.property*; privateListing.* | lead.property*; transaction.property* |
| special_conditions | Mandate Draft | Mandate Setup | optional_hide_when_empty | filled | mandateDraft.specialConditions | onboardingSubmission.specialConditions; onboardingSubmission.additionalConditions |
| agent_full_name | Agent Profile | User / Agent Profile | vnext_readiness_gap | filled | agent.fullName; agent.name | lead.assignedAgentName |
| agent_phone | Agent Profile | User / Agent Profile | optional_hide_when_empty | filled | agent.phone | lead.assignedAgentPhone |
| agent_email | Agent Profile | User / Agent Profile | optional_hide_when_empty | filled | agent.email | lead.assignedAgentEmail |
| agent_ffc_number | Agent Profile | User / Agent Profile | vnext_readiness_gap | filled | agent.ffcNumber; agent.fidelityFundCertificateNumber | lead.agentFfcNumber |
| organisation_trading_name | Company Settings | Company Settings | vnext_readiness_gap | filled | organisation.tradingName; organisation.displayName; agency.tradingName | organisation.name; agency.name |
| organisation_legal_name | Company Settings | Company Settings | vnext_readiness_gap | filled | organisation.legalName; organisation.legal_name; agency.legalName | agency.name; organisation.name |
| organisation_registration_number | Company Settings | Company Settings | vnext_readiness_gap | filled | organisation.registrationNumber; organisation.registration_number; organisation.companyRegistrationNumber | agency.agencyRegistrationNumber |
| organisation_vat_number | Company Settings | Company Settings | optional_hide_when_empty | filled | organisation.vatNumber; organisation.vat_number; agency.vatNumber |  |
| organisation_registered_address | Company Settings | Company Settings | vnext_readiness_gap | filled | organisation.registeredAddress; organisation.address; organisation.physicalAddress | agency.agencyAddress |
| branch_name | Company Settings | Company Settings | optional_hide_when_empty | optional | organisation.branchName; agency.branchName | lead.branchName |
| organisation_fsp_number | Company Settings | Company Settings | optional_hide_when_empty | filled | organisation.fspNumber; organisation.metadata.fspNumber; agency.fspNumber |  |
| organisation_ffc_number | Company Settings | Company Settings | vnext_readiness_gap | filled | organisation.ffcNumber; organisation.fidelityFundCertificateNumber; organisation.metadata.ffcNumber |  |
| mandate_introduction_purpose | Mandate Draft | Mandate Setup | block_generation | filled | mandateDraft.introductionPurpose | legal default wording from mandateDataMapper |
| mandatory_disclosure_status | Mandatory Disclosure | Mandatory Disclosure Form | vnext_readiness_gap | filled | onboardingSubmission.propertyDisclosure.status; propertyDisclosureAnnexure.status | onboardingSubmission.disclosure.status; legacy property_disclosure_status alias |
| mandatory_disclosure_signed_at | Mandatory Disclosure | Mandatory Disclosure Form | vnext_readiness_gap | filled | onboardingSubmission.propertyDisclosure.lockedAt; propertyDisclosureAnnexure.lockedAt | onboardingSubmission.propertyDisclosure.signedAt; legacy property_disclosure_locked_at alias |
| mandatory_disclosure_annexure | Mandatory Disclosure | Mandatory Disclosure Form | vnext_readiness_gap | filled | propertyDisclosureAnnexure.title | mandateDraft.annexuresList; onboardingSubmission.annexuresList |
| mandatory_disclosure_comments | Mandatory Disclosure | Mandatory Disclosure Form | optional_hide_when_empty | filled | propertyDisclosureAnnexure.comments; onboardingSubmission.propertyDisclosure.comments | legacy property_disclosure_comments alias |
| mandate_type | Mandate Draft | Mandate Setup | block_generation | filled | mandateDraft.mandateType; mandateDraft.type | onboardingSubmission.mandateType; privateListing.mandateType |
| mandate_template_variant | Mandate Draft | Mandate Setup | optional_hide_when_empty | filled | mandateDraft.*; onboardingSubmission.* | privateListing.*; lead.* |
| mandate_clause_profile | Mandate Draft | Mandate Setup | optional_hide_when_empty | filled | mandateDraft.*; onboardingSubmission.* | privateListing.*; lead.* |
| legal_document_scenario | Legal Routing | Generated Legal Scenario | runtime_generated | filled | mandateScenarioProfile.*; scenarioProfile.* | computed from seller/property/finance profiles |
| seller_clause_profile | Legal Routing | Generated Legal Scenario | runtime_generated | filled | mandateScenarioProfile.*; scenarioProfile.* | computed from seller/property/finance profiles |
| property_clause_profile | Legal Routing | Generated Legal Scenario | runtime_generated | filled | mandateScenarioProfile.*; scenarioProfile.* | computed from seller/property/finance profiles |
| legal_active_clause_packs | Legal Routing | Generated Legal Scenario | runtime_generated | filled | mandateScenarioProfile.*; scenarioProfile.* | computed from seller/property/finance profiles |
| mandate_start_date | Mandate Draft | Mandate Setup | block_generation | filled | mandateDraft.mandateStartDate; mandateDraft.startDate | onboardingSubmission.mandateStartDate; lead.mandateStartDate |
| mandate_end_date | Mandate Draft | Mandate Setup | block_generation | filled | mandateDraft.mandateEndDate; mandateDraft.expiryDate | onboardingSubmission.mandateEndDate; lead.mandateEndDate |
| mandate_authority_granted | Mandate Draft | Mandate Setup | optional_hide_when_empty | filled | mandateDraft.authorityGranted | onboardingSubmission.authorityGranted; lead.authorityGranted |
| mandate_marketing_permissions | Mandate Draft | Mandate Setup | optional_hide_when_empty | filled | mandateDraft.marketingPermissions | onboardingSubmission.marketingPermissions; onboardingSubmission.marketingAuthorisations |
| mandate_access_instructions | Mandate Draft | Mandate Setup | optional_hide_when_empty | filled | mandateDraft.accessInstructions | onboardingSubmission.accessInstructions; lead.accessInstructions |
| transfer_attorney_company_name | Mandate Draft | Mandate Setup | optional_hide_when_empty | optional | mandateDraft.*; onboardingSubmission.* | privateListing.*; lead.* |
| transfer_attorney_contact_person | Mandate Draft | Mandate Setup | optional_hide_when_empty | optional | mandateDraft.*; onboardingSubmission.* | privateListing.*; lead.* |
| transfer_attorney_email | Mandate Draft | Mandate Setup | optional_hide_when_empty | optional | mandateDraft.*; onboardingSubmission.* | privateListing.*; lead.* |
| transfer_attorney_phone | Mandate Draft | Mandate Setup | optional_hide_when_empty | optional | mandateDraft.*; onboardingSubmission.* | privateListing.*; lead.* |
| commission_structure | Mandate Draft | Mandate Setup | block_generation | filled | mandateDraft.commissionStructure | onboardingSubmission.commissionStructure; agency.defaultCommissionStructure |
| mandate_commission_percent | Mandate Draft | Mandate Setup | conditional_required | filled | mandateDraft.commissionPercent | onboardingSubmission.commissionPercentage; lead.commissionPercent |
| mandate_commission_amount | Mandate Draft | Mandate Setup | conditional_required | filled | mandateDraft.commissionAmount | onboardingSubmission.commissionAmount; lead.commissionAmount |
| vat_handling | Mandate Draft | Mandate Setup | block_generation | filled | mandateDraft.vatHandling | onboardingSubmission.vatHandling; agency.vatHandling |
| asking_price | Mandate Draft | Mandate Setup | block_generation | filled | mandateDraft.askingPrice; mandateDraft.marketingPrice | onboardingSubmission.askingPrice; privateListing.askingPrice |
| seller_signature | Signing System | Signing Runtime | runtime_generated | runtime_generated | documentSigningFields.*; documentPacketSigners.* |  |
| witness_signature | Signing System | Signing Runtime | runtime_generated | runtime_generated | documentSigningFields.*; documentPacketSigners.* |  |
| seller_initials | Signing System | Signing Runtime | runtime_generated | runtime_generated | documentSigningFields.*; documentPacketSigners.* |  |
| signed_date | Signing System | Signing Runtime | runtime_generated | runtime_generated | documentPacketSigners.signed_at; signingCompletion.completedAt | documentPacketVersion.generated_at |
| organisation_logo_url | Company Settings | Company Settings | optional_hide_when_empty | optional | organisation.logoLightUrl; organisation.logo_url; agency.logoLightUrl | organisationBranding.logo_light_url |
| organisation_logo_dark_url | Company Settings | Company Settings | optional_hide_when_empty | optional | organisation.logoDarkUrl; agency.logoDarkUrl | organisation.logoLightUrl; organisation.logo_url |
| bridge_legal_name | Document Runtime | Document Generator | runtime_generated | runtime_generated | platformDefaults.bridgeLegalName | Arch9 Legal static default |
| bridge_legal_logo_light_url | Document Runtime | Document Generator | runtime_generated | runtime_generated | platformDefaults.bridgeLegalLogoLightUrl | public/favicon-light.svg |
| bridge_legal_logo_dark_url | Document Runtime | Document Generator | runtime_generated | runtime_generated | platformDefaults.bridgeLegalLogoDarkUrl | public/favicon-dark.svg |
| document_reference | Document Runtime | Document Generator | runtime_generated | runtime_generated | documentPacket.*; documentPacketVersion.*; documentTemplate.* | transaction.*; platformDefaults.* |
| annexures_list | Document Runtime | Document Generator | optional_hide_when_empty | optional | mandateDraft.annexuresList; onboardingSubmission.annexuresList | propertyDisclosureAnnexure.title |
| generated_date | Document Runtime | Document Generator | runtime_generated | runtime_generated | documentPacket.*; documentPacketVersion.*; documentTemplate.* | transaction.*; platformDefaults.* |
| template_version | Document Runtime | Document Generator | runtime_generated | runtime_generated | documentPacket.*; documentPacketVersion.*; documentTemplate.* | transaction.*; platformDefaults.* |
| transaction_reference | Document Runtime | Document Generator | runtime_generated | runtime_generated | documentPacket.*; documentPacketVersion.*; documentTemplate.* | transaction.*; platformDefaults.* |

## Downstream Contract

- Company Settings owns organisation legal identity, registration, registered address, firm FFC/FSP, and organisation branding.
- Agent Profile owns the assigned agent identity and individual FFC details.
- Seller Onboarding owns seller identity, marital/authority answers, and property facts before the mandate setup confirmation step.
- Mandate Setup owns commercial terms, commission, mandate dates, attorney selection, and special conditions.
- Mandatory Disclosure owns the prescribed disclosure status and annexure metadata; legacy `property_disclosure_*` fields resolve to canonical `mandatory_disclosure_*` fields.
- Signing and Document Runtime fields are generated by the packet renderer/signing runtime and should not be collected as ordinary onboarding inputs.
