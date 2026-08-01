# Phase 1 Canonical Field Inventory and Mismatch Report

Date: 2026-08-01

## Scope

This is an audit-only pass over the seller onboarding, buyer onboarding, document generation, and portal/dashboard field paths. The goal is to confirm whether there is one reliable field contract from onboarding input through mandate/OTP generation and downstream portal displays.

No runtime behavior was changed in this phase.

## Source Inventory

| Layer | Source | Finding |
| --- | --- | --- |
| Buyer onboarding contract | `src/lib/buyerOnboardingFlowContract.js` | 113 unique contract fields: 85 `buyer.*` fields and 28 `finance.*` fields. |
| Seller onboarding contract | `src/lib/sellerOnboardingFlowContract.js` | 112 unique contract fields: 70 `seller.*` fields and 42 `property.*` fields. |
| Merge field registry | `src/core/documents/mergeFieldRegistry.js` | 196 total canonical merge fields, with 118 available to OTP and 85 available to mandate. Registry contains 509 aliases. |
| Conditional pack rules | `src/core/documents/conditionalPackDataRules.js` | 10 document-rule packs, 69 unique onboarding field paths, and 29 required merge fields. |
| Mandate mapper | `src/core/documents/mandateDataMapper.js` | Has a separate compatibility mapper for many older flat seller/property fields. This makes some mandate cases work even when the merge registry does not directly know the structured onboarding path. |
| OTP / packet workflow | `src/core/documents/packetWorkflow.js`, `src/pages/LegalDocumentWorkspacePage.jsx` | Recent buyer/finance fixes improved structured buyer field handling, but registry alias coverage is still incomplete for some finance and marital-regime paths. |
| Attorney workflow routing | `src/services/attorneyWorkflow/transactionFactsResolver.js` | Now reads structured `onboarding_form_data.buyer.*`, `seller.*`, and `finance.*` routing signals for entity/finance/profile classification. |
| Client portal | `src/services/clientPortalWorkspaceService.js` | Seller display name still primarily reads flat seller fields, not structured `seller.*` canonical facts. |
| Bond portals / dashboards | `src/services/bondPartnerPortalService.js`, `src/services/bondOperationalQueueService.js`, `src/services/bondCommandCenterService.js` | Buyer names and property labels are mostly read from denormalized transaction/application fields, not directly from structured buyer onboarding. |

## Core Diagnosis

The issue is not that onboarding stopped saving data. The issue is that the app currently has multiple overlapping field languages:

1. Structured onboarding contract paths, for example `seller.company.authorised_signatory.name`.
2. Legacy/flat form paths, for example `authorisedSignatoryName` or `sellerRepresentativeName`.
3. Canonical merge field keys, for example `seller_representative_name`.
4. Denormalized dashboard summary fields, for example `transaction.buyer_name`.

The earlier OTP work fixed a meaningful part of the buyer-to-document path, but it did not make the merge registry the global single source of truth. Seller, property, and finance still rely heavily on local mapper fallbacks.

## High-Confidence Mismatches

These are document-relevant field paths where onboarding or conditional rules use one field path, while the merge registry either does not resolve it directly or resolves only through implicit normalization.

| Area | Onboarding / Rule Field | Expected Merge Field | Registry Result | Impact |
| --- | --- | --- | --- | --- |
| Finance | `finance.purchase_price` | `purchase_price` | Unresolved | OTP can require purchase price from onboarding while registry only knows transaction-style aliases. |
| Finance | `finance.bond_amount` | `bond_amount` | Unresolved | Bond OTP finance pack can miss values unless another mapper copies the field to `transaction.bond_amount` or `bond_amount`. |
| Finance | `finance.cash_amount` | `cash_amount` | Unresolved | Cash OTP pack has the same risk as bond amount. |
| Buyer | `buyer.person.marital_regime` | `buyer_marital_status` or a dedicated `buyer_marital_regime` | Unresolved | Scenario logic reads this path, but registry does not. This is a terminology split between status and regime. |
| Seller | `seller.first_name` + `seller.surname` | `seller_full_name` | Unresolved | Mandate mapper can compose this from legacy flat fields, but the registry cannot resolve the structured contract fields. |
| Seller | `seller.legal_type`, `seller.branch` | `seller_entity_type` | Unresolved | Legal route decisions can be made in one layer while templates/readiness see another. |
| Seller company | `seller.company.name` | `seller_full_name` | Unresolved | Company seller display/legal name is not centrally mapped. |
| Seller company | `seller.company.authorised_signatory.name` | `seller_representative_name` | Unresolved | Company mandate authority pack can depend on mapper-specific compatibility. |
| Seller company | `seller.company.authorised_signatory.capacity` | `seller_representative_capacity` | Unresolved | Same authority-pack risk. |
| Seller company | `seller.company.resolution_date` | `seller_resolution_date` | Unresolved | Same authority-pack risk. |
| Seller company | `seller.company.authority_basis` | `seller_authority_basis` | Unresolved | Same authority-pack risk. |
| Seller trust | `seller.trust.name` | `seller_full_name` | Unresolved | Trust seller display/legal name is not centrally mapped. |
| Seller trust | `seller.trust.trustees` | `seller_trustee_names` | Unresolved | Trust authority pack can depend on local transformation. |
| Seller trust | `seller.trust.authorised_trustee.name` | `seller_representative_name` | Unresolved | Trust representative field is not centrally mapped. |
| Seller trust | `seller.trust.authorised_trustee.capacity` | `seller_representative_capacity` | Unresolved | Same authority-pack risk. |
| Seller trust | `seller.trust.authority_basis` | `seller_authority_basis` | Unresolved | Same authority-pack risk. |
| Seller | `seller.marital_regime` | `seller_marital_status` or a dedicated `seller_marital_regime` | Unresolved | Similar terminology split to buyer marital-regime handling. |
| Property | `property.address.line_1` | `property_address` | Unresolved | Structured property address is not centrally mapped. |
| Property | `property.address.suburb` | `property_suburb` | Unresolved | Structured address suburb is not centrally mapped. |
| Property | `property.address.city` | `property_city` | Unresolved | Structured address city is not centrally mapped. |
| Property | `property.address.postal_code` | `property_postal_code` | Unresolved | Registry has no obvious canonical `property_postal_code` definition visible in this comparison. |
| Property | `property.structure_type` | `property_title_type` | Unresolved | This is the likely source of the "property title type" confusion. |
| Property | `property.category` | `property_type` | Unresolved | Property category/type are being treated inconsistently. |
| Property | `property.scheme.unit_number` | `property_unit_number` | Unresolved | Sectional/share-block details can be captured but missed by generic merge resolution. |
| Property | `property.scheme.section_number` | `property_section_number` | Unresolved | Same sectional-title risk. |

## Compatibility That Currently Masks the Problem

Some paths work today because specific mappers know old field names:

| Area | Compatibility Layer | Why It Is Fragile |
| --- | --- | --- |
| Mandate seller fields | `mapSellerOnboardingToMandateData` reads flat fields such as `sellerFirstName`, `sellerSurname`, `companyRegistrationNumber`, `authorisedSignatoryName`, and `trustRegistrationNumber`. | It does not make the structured contract path itself canonical. Another generator or preflight can still miss `seller.company.authorised_signatory.name`. |
| Mandate property title type | The mandate mapper reads `propertyTitleType`, `property_title_type`, `propertyStructureType`, and transaction/listing fallbacks. | If the value only exists under nested canonical facts such as `property.property_title_type`, a consumer that expects a flat field can still flag it missing. |
| Seller/company registration | `seller.company.registration_number` resolves to `seller_company_registration_number` only because the registry normalizes dots to underscores and finds `seller.company_registration_number`. | This is implicit. It is not a clear alias contract and should be made explicit. |
| Buyer entity fields | Buyer aliases now include structured `buyer.legal_type`, `buyer.purchaser_type`, company/trust representative fields, and several spouse fields. | This area is in better shape after the previous fix, but finance and marital-regime aliases are still missing. |
| Workflow routing | `transactionFactsResolver` now checks `onboarding_form_data.finance.*`, `buyer.*`, and `seller.*` paths. | Routing is improved, but routing and document merge still do not share one canonical mapping table. |

## Portal / Dashboard Risks

The portal side is not fully aligned to the onboarding contracts yet.

| Consumer | Current Pattern | Risk |
| --- | --- | --- |
| Client portal seller display | `getSellerDisplayName` reads flat form fields like `sellerName`, `firstName`, `sellerSurname`, and listing seller name. | Structured `seller.first_name`, `seller.surname`, `seller.company.name`, or `seller.trust.name` may not display if no flattened summary was written. |
| Seller onboarding page display | Local display helper reads `sellerFirstName` and `sellerSurname`. | It can miss canonical nested seller facts unless the page's normalization layer has flattened them first. |
| Bond partner portal | Application buyer display reads `row.buyer`, `row.buyerName`, `transaction.buyer_name`, or work-delivery payload values. | Buyer onboarding can be complete while a partner portal still shows "Buyer pending" if transaction summary fields were not propagated. |
| Bond operational queue | Buyer display reads `row.buyer.name`, `transaction.buyer_name`, `transaction.client_name`. | Same denormalized-summary dependency. |
| Bond command center | Buyer display reads `row.buyer.name`, `transaction.buyer_name`, `transaction.client_name`. | Same denormalized-summary dependency. |

These dashboard risks are mostly display and handoff risks, not necessarily mandate/OTP generation blockers. They still matter because they prove the platform is not using one shared data dictionary from capture to consumption.

## Property Title Type Diagnosis

From a legal-document perspective, the property title type is not just decorative metadata. It controls which clauses and packs are relevant: full title, sectional title, share block, agricultural holding, estate/HOA-related details, and associated unit/section/scheme references.

The field should therefore be required during seller/property onboarding if a mandate can require it later. The current failure pattern is consistent with this mismatch:

1. Seller onboarding/facts can produce `property.property_title_type`, `property.title_type`, and `property.structure_type`-style facts.
2. Mandate/readiness/template routing expects `property_title_type`.
3. Some mappers flatten `propertyTitleType`/`property_title_type`, but the central registry does not explicitly map the structured property contract paths to `property_title_type`.

So the likely root cause is not "the legal field should not exist." It is that the title-type field is not consistently flattened and registered from seller onboarding through mandate generation.

## Confidence Level

| Surface | Confidence | Notes |
| --- | --- | --- |
| Buyer onboarding to OTP core identity/entity fields | Medium-high | Recent fixes added structured buyer aliases and tests passed. Remaining gaps are mainly finance aliases and marital-regime terminology. |
| Finance onboarding to OTP | Medium | Data is saved under `finance.*`, but merge registry lacks direct aliases for `finance.purchase_price`, `finance.bond_amount`, and `finance.cash_amount`. |
| Seller onboarding to mandate | Medium | Mandate mapper has many fallbacks, but registry and conditional packs still disagree on structured seller fields. |
| Property onboarding to mandate | Medium-low | The property title type/address/scheme field family is the clearest mismatch cluster. |
| Agent/attorney/bond dashboards | Medium-low | Several dashboards rely on denormalized summary fields and do not consistently fall back to canonical onboarding data. |

## Recommended Fix Batches

### Phase 2: Field Dictionary and Alias Contract

Create one canonical data dictionary that declares:

| Canonical Source Path | Canonical Merge Field | Required In | Consumers |
| --- | --- | --- | --- |
| `seller.company.authorised_signatory.name` | `seller_representative_name` | Seller company onboarding | Mandate, OTP, signing, attorney handoff |
| `property.property_title_type` / `property.structure_type` | `property_title_type` | Seller property onboarding | Mandate, OTP, route packs |
| `finance.bond_amount` | `bond_amount` | Buyer bond onboarding | OTP, bond handoff |
| `finance.cash_amount` | `cash_amount` | Buyer cash onboarding | OTP |

Then generate or test registry aliases from that dictionary.

### Phase 3: Registry and Mapper Alignment

Add explicit aliases to `mergeFieldRegistry.js` for all required structured onboarding fields used by `conditionalPackDataRules.js`. Add tests that assert every conditional pack `requiredOnboardingFields` path maps to its intended `requiredMergeFields` or an approved derived/composite field.

### Phase 4: Producer Normalization

Make seller and buyer onboarding persist both:

1. The structured canonical object used by legal/workflow logic.
2. A small, generated flat merge snapshot used by document generation.

The flat snapshot should be produced by one shared mapper, not hand-built in multiple pages.

### Phase 5: Portal Fallbacks

Update client, attorney, and bond dashboard normalizers to fall back to the same canonical field reader before showing "pending" labels.

## Phase 1 Conclusion

We are not fully back to square one, but the system still has a real single-source-of-truth gap. Buyer OTP mapping is notably better than before, while seller/property/finance still have enough unresolved canonical paths to explain the mandate-generation mismatches and portal inconsistencies.

The immediate culprit behind the property-title-type block is the structured-vs-flat field split around `property.property_title_type` / `property.structure_type` versus `property_title_type`.
