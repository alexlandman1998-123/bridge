# Arch9 Legal Logic Launch Gate Audit

Audit date: 2026-07-11  
Scope: business rules, legal scenario coverage, document logic, workflow conditions, data propagation, and South African compliance readiness.  
Out of scope: visual UI review, styling, layout, and product copy.

## Executive Certification

Launch certification: BLOCKED FOR FULL SOUTH AFRICAN CONVEYANCING SCOPE

The system has a strong transaction workflow backbone and good data propagation tests, but it is not yet safe to claim complete South African conveyancing business-rule coverage. The main risk is not the workflow plumbing. It is that several legally material party-capacity, authority, entity, foreign-exchange, and estate/insolvency branches are missing, collapsed into broader categories, or only partially represented in document fallback layers.

Recommended launch position:

- Safe for controlled pilot: yes, if limited to explicitly supported scenarios and reviewed by a conveyancer per matter.
- Safe for broad public launch as "handles all South African property transactions": no.
- Safe for "standard private residential resale, natural-person/company/trust buyer/seller, cash/bond/hybrid, sectional/HOA/commercial variants": conditionally yes after fixing the seller multiple-owner drift and adding a hard support-boundary gate.

Readiness scores:

| Area | Score | Certification |
| --- | ---: | --- |
| Buyer legal logic | 58/100 | Blocked |
| Seller legal logic | 66/100 | Blocked until drift fixed |
| Document matrix | 64/100 | Partial |
| Conditional workflow | 76/100 | Pilot-ready |
| End-to-end transaction propagation | 82/100 | Good |
| South African compliance coverage | 55/100 | Blocked |
| Edge-case resilience | 49/100 | Blocked |
| Overall launch readiness | 62/100 | No-go for full scope |

## Evidence Reviewed

Core code paths reviewed:

- `the-it-guy/src/lib/buyerOnboardingFlowContract.js`
- `the-it-guy/src/lib/buyerOnboardingFlow.js`
- `the-it-guy/src/lib/purchaserPersonas.js`
- `the-it-guy/src/lib/sellerOnboardingFlowContract.js`
- `the-it-guy/src/lib/sellerDocumentRequirementEngine.js`
- `the-it-guy/src/services/attorneyWorkflow/transactionFactsResolver.js`
- `the-it-guy/src/services/attorneyWorkflow/attorneyDocumentRequirementsResolver.js`
- `the-it-guy/src/services/transactionRoutingProfileService.js`
- `the-it-guy/server/workflows/transactionWorkflowDefinitions.js`
- `the-it-guy/server/workflows/transactionWorkflowGates.js`
- `the-it-guy/server/services/transactionWorkflowRollup.js`
- `the-it-guy/server/workflows/workflowEvidenceMappings.js`
- `the-it-guy/src/services/documents/canonicalDocumentResolverService.js`
- `the-it-guy/src/services/documents/transactionCanonicalDocumentRequirementService.js`
- `the-it-guy/supabase/migrations/202605250001_canonical_document_system_phase1.sql`
- `the-it-guy/src/services/transactionWorkflowReadModelService.js`
- `the-it-guy/src/services/clientPortalWorkspaceService.js`

Tests executed:

| Command | Result | Note |
| --- | --- | --- |
| `node scripts/buyer-onboarding-south-african-scenarios.test.mjs` | Pass | Covers many standard buyer personas. |
| `node scripts/seller-onboarding-south-african-scenarios.test.mjs` | Fail | Multiple-owner branch returns `multiple_individuals` where test expects `multiple_owners`. |
| `node scripts/document-request-scenario-matrix.test.mjs` | Pass | Existing scenario matrix passed. |
| `node scripts/offer-to-transaction-scenario-matrix.test.mjs` | Pass | Offer-to-transaction propagation passed. |
| `node scripts/transaction-routing-workflow-adaptation.test.mjs` | Pass | Routing adaptation passed. |
| `node scripts/transaction-routing-diagnostics.test.mjs` | Pass | Diagnostics passed. |
| `node scripts/canonical-document-resolver.test.mjs` | Pass | Canonical resolver passed. |
| `node scripts/canonical-workflow-gates.test.mjs` | Pass | Canonical gates passed. |
| `node scripts/seller-document-propagation.test.mjs` | Pass | Seller doc propagation passed. |
| `node scripts/listing-to-transaction-routing-propagation.test.mjs` | Pass | Listing-to-transaction routing passed. |
| `node scripts/client-portal-document-centre-phase4.test.mjs` | Pass | Portal document centre propagation passed. |
| `node scripts/transaction-propagation-smoke.mjs` | Pass | RLS, idempotency, audit, role-player, partner-routing, and workflow schema checks passed. |

Primary source checks used for the legal baseline:

- Property Practitioners Act page on South African Government: https://www.gov.za/documents/acts/property-practitioners-act-22-2019-english-tshivenda-03-oct-2019
- POPIA page on South African Government: https://www.gov.za/documents/protection-personal-information-act
- Electronic Communications and Transactions Act page on South African Government: https://www.gov.za/documents/electronic-communications-and-transactions-act
- FIC compliance portal: https://www.fic.gov.za/compliance/
- FIC guidance notes portal: https://www.fic.gov.za/compliance/guidance-notes/
- FIC 2026 draft Guidance Note 7B notice: https://www.fic.gov.za/2026/06/12/web-notice-draft-guidance-note-7b-for-consultation-on-the-implementation-of-various-aspects-of-the-fic-act/
- South African Government FIC Act search results and 2026 notices/directives: https://www.gov.za/search?search_query=Financial%20Intelligence%20Centre%20Act
- SARB Financial Surveillance: https://www.resbank.co.za/en/home/what-we-do/financial-surveillance
- Master of the High Court deceased estates: https://www.justice.gov.za/master/deceased.html
- Master of the High Court trusts: https://www.justice.gov.za/master/trust.html
- CIPC beneficial ownership page, current redirect target: https://www.cipc.co.za/?page_id=7066
- South African Government Alienation of Land Act search results: https://www.gov.za/search?search_query=Alienation%20of%20Land%20Act

Note: this is a technical legal-logic audit, not a final legal opinion. A South African conveyancer and compliance officer should sign off the final matrix before unrestricted launch.

## Phase 1 - Legal Logic Audit

### Buyer Party Logic

Implemented buyer branches:

- individual
- married in community of property
- married out of community with ANC
- married out of community with ANC and accrual
- company
- trust
- foreign purchaser
- other

Strengths:

- Standard natural-person buyer data is captured: identity/passport, nationality, residency, tax number, marital status, dependants, commitments, first-time buyer, primary residence, investment purchase.
- Cash, bond, and hybrid finance branches are explicit.
- Co-purchasing exists, with ownership share and consent fields, and validation that ownership shares total 100%.
- Company and trust buyer personas generate director/trustee/signatory document requests.
- Foreign purchaser is a first-class branch for a foreign individual.

Critical gaps:

| Scenario | Current state | Risk |
| --- | --- | --- |
| Close corporation buyer | Aliased into company logic in normalizers; not first-class. | CC authority and member-resolution handling can be legally different enough to require explicit treatment. |
| Minor purchaser | No first-class buyer branch. | Capacity/guardian/court-authority rules can be missed. |
| Deceased estate buyer | No first-class buyer branch. | Executor authority and estate purchasing capacity can be missed. |
| Insolvent/sequestrated purchaser | No first-class buyer branch. | Trustee/curator authority and capacity restrictions can be missed. |
| Purchaser acting through power of attorney | Not a buyer branch. | POA validity, authentication, and signatory authority can be missed. |
| Foreign company/trust buyer | Foreign branch is primarily individual; company/trust foreignness is not deeply modeled. | FICA, beneficial ownership, exchange control, and offshore authority checks can be incomplete. |
| Permanent resident vs non-resident | Residency is captured but not gate-driving enough. | Exchange-control and source-of-funds treatment may be under-triggered. |
| Subject-to-sale purchaser | Not a finance/legal branch. | Suspensive-condition workflow can advance too soon. |
| Investor/developer purchase | Captured as facts, not legal branches. | VAT, enterprise sale, development sale, or rental-income docs can be under-modeled. |
| Matrimonial regime outside RSA | Not explicit. | Foreign marriage regime and authentication can be missed. |

Buyer launch finding:

The buyer logic is good for standard individuals, companies, trusts, foreign individuals, co-purchasers, and cash/bond/hybrid finance. It is not complete for full South African conveyancing because capacity and authority exceptions are not first-class branches.

### Seller Party Logic

Implemented seller branches:

- individual
- married
- company
- trust
- deceased estate
- power of attorney
- multiple owners
- other

Strengths:

- Seller logic is more mature than buyer logic for deceased estates, POA, multiple owners, existing bond, tenancy, sectional/HOA, commercial/mixed-use, vacant land, agricultural, and compliance triggers.
- Seller document engine includes mandate, title deed copy, rates account, property disclosure, entity documents, deceased estate documents, POA documents, and bond cancellation documents.
- Foreign seller facts exist as optional seller fields.

Critical gaps:

| Scenario | Current state | Risk |
| --- | --- | --- |
| Multiple owners | Scenario test fails: actual branch `multiple_individuals`, expected `multiple_owners`. | Workflow and document matrix can drift across layers. |
| Close corporation seller | Not a first-class branch. | Member authority can be flattened into company handling. |
| Insolvent estate seller | Not a first-class branch. | Trustee authority, Master/court authority, and sale approval can be missed. |
| Minor owner seller | Not a first-class branch. | Guardian/court approval can be missed. |
| Foreign seller | Fields exist, but not a full branch. | Withholding tax/exchange-control/payment rules can be missed. |
| Deceased estate with multiple heirs/disputes | Deceased estate branch exists, but heir consent/dispute complexity is not deeply modeled. | Transfer can be blocked after sale acceptance. |
| Owner under curatorship/administration | No branch. | Authority/capacity risk. |
| Seller using historic mandate or agent authority | Mandate required, but expiry/scope/exclusivity logic is not proven. | Invalid mandate risk under property-practitioner rules. |

Seller launch finding:

Seller logic is pilot-ready for common seller scenarios, but launch should be blocked until the multiple-owner branch drift is fixed and missing capacity/insolvency/CC/foreign seller branches are added or explicitly excluded.

### Finance Logic

Implemented finance branches:

- cash
- bond
- hybrid

Strengths:

- Cash requires proof/source of funds in the buyer persona/document layer.
- Bond branch captures bond status, bank/originator details, affordability, credit consent, and bond documents.
- Hybrid validation checks cash plus bond amounts against purchase price.
- Workflow rollup prevents transfer readiness unless finance evidence is present.

Gaps:

| Scenario | Current state | Risk |
| --- | --- | --- |
| Subject to bond approval date | Evidence exists, but time-based suspensive-condition gating is not fully proven. | OTP can progress beyond legal condition window. |
| Subject to sale of buyer property | Not first-class. | Transaction can appear ready while a core suspensive condition is unresolved. |
| Cash from foreign source | Foreign purchaser source/exchange declarations are optional in some branch rules. | SARB/FICA source-of-funds risk. |
| Deposit held by agency trust account vs attorney trust account | Not fully modeled as a legal payment-flow rule. | Trust-account and refund-control risk. |
| Bank guarantee vs bond grant vs instruction | Some docs exist, but gate semantics should distinguish them. | Transfer gate can be satisfied by weaker evidence than required. |
| Multi-bank applications | Bank options exist, but multi-application state is not deeply modeled. | Wrong "bond ready" interpretation. |

Finance launch finding:

Cash/bond/hybrid are well represented, but legal-grade launch needs explicit suspensive condition, guarantee, deposit, and foreign-source-of-funds gates.

### Property and Transaction Logic

Implemented property/transaction facts:

- residential, sectional title, estate/HOA, commercial, mixed-use, agricultural, vacant land
- transaction type and relationship profile
- existing bond and cancellation workflow
- VAT treatment flags
- development sale pack in attorney resolver
- lease/tenancy triggers

Strengths:

- Property taxonomy is broad enough for common property categories.
- Sectional title/HOA and commercial/VAT logic exists in document and attorney layers.
- Existing bond triggers cancellation workflows and documents.
- Private resale and development sale distinctions exist.

Gaps:

| Scenario | Current state | Risk |
| --- | --- | --- |
| Share block | Not confirmed as first-class. | Tenure transfer logic differs from sectional/full title. |
| Long-term leasehold | Not confirmed as first-class. | Deeds/lease documentation differs. |
| Mining/water/servitude-heavy farms | Agriculture branch exists, but special rights are not deeply modeled. | Material encumbrances can be missed. |
| VAT zero-rated going concern | VAT facts exist; complete SARS substantiation and lease/business continuation docs not proven. | VAT/transfer duty misclassification. |
| Building plans/alterations | Some optional certificates exist; municipal legality gate not proven. | Purchaser/seller dispute and attorney requisition risk. |
| Heritage/coastal/municipal overlay | Not modeled. | Statutory constraints can be missed. |

Property launch finding:

The taxonomy is solid for a pilot. It is not complete for all property/tenure/legal restrictions.

## Phase 2 - Document Matrix Validation

### Current Document Strengths

The system includes document definitions or resolvers for:

- buyer ID/proof of address
- seller ID/proof of address
- marriage certificate
- ANC
- spouse consent
- divorce documentation
- company registration
- company resolution
- director IDs
- trust deed
- letters of authority
- trustee IDs
- trust resolution
- beneficial ownership style data in some entity contexts
- deceased estate executor documents on seller side
- power of attorney documents on seller side
- signed mandate
- title deed copy
- rates account
- rates clearance
- levy/HOA documents
- property condition disclosure
- electrical, beetle, gas, electric fence, plumbing, and related certificates
- bond statement
- bond cancellation authority
- settlement figures
- bond preapproval
- bond approval
- grant letter
- bank statements
- payslips
- financials
- proof of funds
- signed OTP/sale agreement
- transfer duty information
- transfer documents

### Matrix Findings

| Area | Current state | Finding |
| --- | --- | --- |
| Buyer individual | Strong baseline. | Needs minor/POA/foreign marriage/capacity branches. |
| Buyer company | Good for ordinary company. | Needs CC distinction, beneficial owner hard gate, authorised signatory chain, foreign company branch. |
| Buyer trust | Good baseline. | Needs all-trustee signing rules, foreign trust, trustee incapacity/removal logic, Master authority validation. |
| Buyer foreign individual | Partially supported. | Source of funds and exchange-control declaration should be required, not optional, when non-resident indicators apply. |
| Seller individual | Strong baseline. | Needs minors, curatorship, insolvency, foreign owner branch. |
| Seller married | Good baseline. | Needs foreign marriage and life-partnership/customary-marriage nuance. |
| Seller company | Good for ordinary company. | Needs CC, liquidation/business rescue, beneficial ownership and authority chain. |
| Seller trust | Good baseline. | Needs all-trustee execution, trustee changes, foreign trust, Master authority versioning. |
| Seller deceased estate | Present. | Needs deeper Master/heir/dispute/estate-late-bank-account handling. |
| POA | Present on seller side. | Needs buyer side and authentication/expiry/geography rules. |
| Existing bond | Good baseline. | Needs bank-specific cancellation notice periods and simultaneous bond switch handling. |
| Sectional/HOA | Good baseline. | Needs special levy, managing agent, conduct rule, exclusive-use area nuance. |
| Commercial/VAT | Partial. | Needs stronger VAT classification, going concern, lease schedule, enterprise sale docs. |
| Compliance certificates | Present. | Needs jurisdiction/property-trigger matrix and contract-specific mandatory vs optional status. |
| Canonical docs | Architecturally strong. | Seeded canonical rules are sparse and still rely on compatibility adapters. |

### Document Matrix Blockers

1. Entity definitions exist beyond the actual conditional rules. Several documents are defined but not guaranteed by canonical rules for the specific legal branch.
2. Buyer capacity and authority exceptions are under-modeled.
3. Seller multiple-owner branch drift proves the matrix can disagree with branch resolution.
4. Canonical and legacy/fallback resolvers still coexist. This is acceptable during migration, but not enough for a launch certificate unless parity reports are clean.
5. Foreign purchaser source-of-funds and exchange-control evidence should be hard-gated when non-resident facts are present.

## Phase 3 - Conditional Workflow Audit

### Workflow Architecture

Current workflow model includes:

- sales OTP workflow
- finance unknown/cash/bond/hybrid workflows
- attorney transfer workflow
- attorney bond workflow
- seller bond cancellation workflow
- registration workflow

Current gates include:

- sale confirmed
- OTP executed
- finance ready
- transfer ready
- registration confirmed

Rollup logic enforces:

- buyer/seller onboarding before finance readiness
- generated and signed OTP before finance readiness
- buyer and seller FICA before finance readiness
- finance evidence before transfer readiness
- transfer attorney, bond attorney, and cancellation attorney progress before registration
- registration evidence before complete

### Conditional Workflow Strengths

- Cash/bond/hybrid workflow adaptation is explicit and tested.
- Bond and cancellation lanes are conditionally present.
- Partner routing and role-player visibility are tested through the propagation smoke.
- Workflow schema readiness passed.
- Audit events persist for role-player assignments.
- RLS blocks unrelated bond-originator visibility in the smoke test.

### Conditional Workflow Gaps

| Condition | Current state | Risk |
| --- | --- | --- |
| Subject to sale | Not a first-class suspensive-condition lane. | Premature readiness. |
| Subject to bond by deadline | Bond evidence exists, but deadline/waiver/extension semantics are not fully proven. | OTP validity risk. |
| Subject to inspection/defects | Not fully modeled as gate-driving. | Transfer can proceed before condition fulfilment. |
| Spouse consent | Document trigger exists. | Need gate semantics to block signing/lodgement where required. |
| All trustees/directors signing | Docs exist. | Need gate semantics for signatory completeness, quorum, and resolution validity. |
| POA validity | Seller POA exists. | Need buyer POA and authentication/expiry gating. |
| Non-resident funds | Foreign branch exists. | Need exchange-control proof before finance readiness. |
| Insolvent/minor/curator authority | Missing. | Workflow may treat invalid party as onboarded. |
| VAT vs transfer duty | Facts exist. | Need tax treatment gate before attorney transfer docs. |
| Compliance cert due dates | Docs exist. | Need jurisdiction/contract-specific deadline gating. |

Conditional workflow finding:

The workflow engine is good enough for a controlled pilot once unsupported legal scenarios are blocked at intake. It is not safe as a universal conveyancing workflow until suspensive conditions, capacity exceptions, and authority proof are hard gates rather than optional facts/documents.

## Phase 4 - End-to-End Scenario Simulation Findings

### Simulated/Tested Standard Scenarios

The test suite and code path review support these scenarios reasonably well:

- married in community buyer, cash
- married ANC buyer, cash
- company buyer with multiple directors
- trust buyer with multiple trustees
- co-purchasing with ownership split
- foreign individual buyer, cash
- existing-bond transactions
- sectional title transactions
- estate/HOA transactions
- commercial mixed-use/VAT transactions
- tenanted commercial transactions
- vacant land
- agricultural property
- offer-to-transaction conversion
- document request scenario matrix
- routing adaptation across finance types
- canonical document resolution
- canonical workflow gates
- seller document propagation
- listing-to-transaction routing propagation
- client portal document centre propagation
- transaction propagation smoke with RLS and idempotency

### Failed Simulation

Seller multiple-owner scenario fails:

- Expected: `multiple_owners`
- Actual: `multiple_individuals`

Legal impact:

Multiple ownership is not a cosmetic branch. It controls owner consent, ownership share, signing authority, mandate validity, and transfer document execution. A naming mismatch can cause downstream rules to miss the exact branch they are supposed to protect.

### Untested or Under-Modeled High-Risk Scenarios

These should not be accepted automatically until explicitly implemented:

- minor buyer
- minor seller
- insolvent buyer
- insolvent seller
- deceased estate buyer
- foreign company buyer
- foreign trust buyer
- foreign seller with proceeds remitted offshore
- close corporation buyer/seller
- buyer/seller under curatorship
- purchaser using POA
- seller using foreign POA
- foreign marriage regime
- customary marriage with multiple spouses
- subject-to-sale OTP
- subject-to-inspection OTP
- VAT going concern
- share block
- long leasehold
- business rescue seller
- liquidated company seller

Phase 4 finding:

The system passes a healthy set of ordinary scenarios, but the missing high-risk scenarios are material enough to block full-scope launch.

## Phase 5 - Data Propagation Audit

### Propagation Strengths

- Offer-to-transaction propagation passed.
- Listing-to-transaction routing propagation passed.
- Transaction propagation smoke passed.
- Role players, attorney assignments, bond applications, participants, transaction events, and audit records share transaction identity correctly in the smoke test.
- Idempotency checks passed for downstream records.
- RLS checks passed for unrelated bond originator visibility.
- Client portal document centre propagation passed.
- Workflow read model schema passed.

### Propagation Risks

| Area | Risk |
| --- | --- |
| Multiple branch normalizers | Buyer, seller, attorney facts, routing, and canonical docs each normalize legal facts. This increases drift risk. |
| Company vs close corporation | CC can be flattened into company. This propagates incomplete authority assumptions. |
| Foreignness | Foreign buyer/seller facts can be captured without consistently hard-driving finance/compliance/document gates. |
| Portal read models | Shared shapes can blur buyer/seller semantics if not carefully named. |
| Canonical vs legacy docs | Compatibility fallbacks mean two document truths can temporarily disagree. |
| Missing legal fact warnings | Some missing-field warnings exist, but not every legally fatal missing fact blocks intake. |

Phase 5 finding:

Data propagation is one of the stronger areas. The main propagation threat is not lost records. It is legally meaningful fact drift across multiple normalizers and document engines.

## Phase 6 - South African Legal Compliance Audit

### FICA / AML / Beneficial Ownership

Current state:

- Buyer and seller FICA documents exist.
- Attorney resolver adds buyer/seller FICA requirements.
- Company/trust/director/trustee identity requirements exist.
- Some beneficial ownership concepts exist in entity document handling.

Gaps:

- A risk-based CDD model is not clearly hard-gated.
- Beneficial ownership should be mandatory for companies, trusts, foreign entities, and higher-risk structures.
- PEP/PIP, sanctions, adverse media, source of wealth, and source of funds are not evident as a complete compliance workflow.
- Ongoing monitoring and refresh requirements are not visible as versioned compliance rules.
- The FIC official site shows ongoing 2026 guidance-note movement, so hard-coded assumptions need dated compliance ownership.

Certification: blocked for unrestricted launch.

### POPIA

Current state:

- Identity, address, tax, bank, marital, financial, and biometric-adjacent documents are collected across the workflow.
- Credit-check consent appears in buyer finance logic.

Gaps:

- Broad privacy consent, lawful basis, document retention period, deletion/export rights, cross-border processing, breach handling, and operator/processor controls were not proven in this business-rule audit.
- Document sharing to partners is workflow-tested, but POPIA purpose limitation and access-minimization rules should be explicit policy gates.

Certification: blocked until privacy controls are explicitly mapped.

### ECTA / Electronic Signature

Current state:

- Signed OTP and generated/signed document concepts exist.

Gaps:

- The audit did not find complete evidence-class distinctions for ordinary electronic signature vs advanced electronic signature where applicable.
- The system should store signer identity, timestamp, document hash/version, IP/device metadata if relied on, and tamper evidence.
- Signatory capacity must be tied to the party authority branch, not just signature presence.

Certification: partial.

### Property Practitioners Act

Current state:

- Signed mandate and property condition disclosure are document requirements.
- Private seller mandate required flags exist in routing/relationship profile logic.

Gaps:

- Mandate expiry, mandate scope, sole/exclusive mandate terms, FFC status, and agent/agency authority were not proven as hard gates.
- Property condition disclosure exists, but it must be forced before buyer commitment where legally required.

Certification: partial.

### Exchange Control / Non-Resident Transactions

Current state:

- Foreign purchaser is a buyer branch.
- Nationality and residency status are captured.
- Source of funds and exchange-control declaration exist in some rules but are not consistently mandatory.

Gaps:

- Non-resident funding route, authorised dealer evidence, offshore remittance instructions, and endorsement/recording workflow are not complete enough for launch.
- Foreign seller proceeds/remittance logic is not a first-class seller branch.

Certification: blocked for foreign/non-resident scope.

### Deceased Estates / Trusts / Authority

Current state:

- Seller deceased estate branch exists.
- Trust buyer/seller documents include trust deed, letters of authority, trustee IDs, and trust resolution.

Gaps:

- Buyer deceased estate branch is missing.
- Trust all-trustee signature, trustee appointment changes, Master authority versioning, and foreign trust treatment need hard gates.
- Estate disputes, heirs, executor capacity, and estate bank/payment instructions need stronger logic.

Certification: partial seller, blocked buyer.

### Companies / Close Corporations / Beneficial Ownership

Current state:

- Company buyer/seller branches exist.
- Director IDs and company resolutions exist.

Gaps:

- Close corporations are not first-class.
- Business rescue, liquidation, deregistration, and beneficial owner filings are not hard-gated.
- Foreign company authority and apostilled/authenticated documents are not first-class.

Certification: partial.

## Phase 7 - Edge Case Matrix

The following edge cases should be converted into automated scenario tests or explicit unsupported-scenario gates before broad launch.

| # | Edge case | Required launch behavior |
| ---: | --- | --- |
| 1 | Buyer is a minor purchasing with parent assistance. | Require guardian authority and conveyancer review. |
| 2 | Buyer is a minor purchasing through a trust. | Require trust authority plus minor/capacity review. |
| 3 | Seller is a minor. | Require guardian/court authority and block normal sale flow. |
| 4 | Buyer under curatorship. | Require curator authority. |
| 5 | Seller under curatorship. | Require curator authority before mandate/OTP. |
| 6 | Buyer is sequestrated. | Require trustee/insolvency authority. |
| 7 | Seller is sequestrated. | Require trustee authority and special sale documents. |
| 8 | Seller company is in liquidation. | Require liquidator authority and liquidation documents. |
| 9 | Buyer company is in liquidation. | Block or require liquidator/conveyancer approval. |
| 10 | Seller company is in business rescue. | Require business rescue practitioner authority. |
| 11 | Buyer company is in business rescue. | Require practitioner approval and risk review. |
| 12 | Seller is deceased estate. | Require executor appointment and estate documents. |
| 13 | Buyer is deceased estate. | Require executor authority and estate purchasing capacity. |
| 14 | Deceased estate has multiple executors. | Require all required executor authorities/signatures. |
| 15 | Executor appointment is pending. | Block until letters are issued. |
| 16 | Estate has disputed heirs. | Escalate to conveyancer and block automation. |
| 17 | Seller signs through local POA. | Require valid POA and identity of agent. |
| 18 | Seller signs through foreign POA. | Require authentication/apostille path and conveyancer review. |
| 19 | Buyer signs through POA. | Require buyer-side POA branch. |
| 20 | POA expired or limited. | Block or request new authority. |
| 21 | Seller is married in community. | Require spouse consent/signature. |
| 22 | Seller is married out of community with ANC. | Require ANC/marital proof where relevant. |
| 23 | Buyer married in community. | Require spouse details and signing/consent rules. |
| 24 | Buyer married out of community with accrual. | Capture accrual and signing authority implications. |
| 25 | Foreign marriage regime. | Require foreign marriage proof and legal review. |
| 26 | Customary marriage. | Require spouse/marriage structure logic. |
| 27 | Potential polygamous customary marriage. | Escalate to conveyancer. |
| 28 | Civil union. | Treat as marriage for authority/signing purposes where applicable. |
| 29 | Divorced seller with settlement affecting property. | Require divorce order/settlement agreement. |
| 30 | Divorced buyer with maintenance/credit implications. | Capture finance risk only where legally relevant. |
| 31 | Co-purchasers share total below 100%. | Block submission. |
| 32 | Co-purchasers share total above 100%. | Block submission. |
| 33 | Co-purchaser refuses consent. | Block OTP readiness. |
| 34 | One co-purchaser is foreign. | Trigger foreign-source/FICA checks for that party. |
| 35 | One co-purchaser is a company. | Support mixed natural/entity purchasers. |
| 36 | Multiple sellers with unequal shares. | Require share capture and all-owner authority. |
| 37 | One seller owner absent. | Require POA or block. |
| 38 | One seller owner deceased. | Split deceased estate logic for that share. |
| 39 | One seller owner insolvent. | Split insolvency logic for that share. |
| 40 | Seller branch returns legacy `multiple_individuals`. | Normalize to one canonical branch or map both safely. |
| 41 | Close corporation buyer. | First-class CC branch with member authority. |
| 42 | Close corporation seller. | First-class CC branch with member authority. |
| 43 | Company has multiple directors but only one signs. | Require resolution or signing authority. |
| 44 | Company has changed name. | Require current registration and name-change proof. |
| 45 | Company is deregistered. | Block or escalate. |
| 46 | Foreign company buyer. | Require foreign registration, authority, beneficial owners, authentication. |
| 47 | Foreign company seller. | Require foreign authority and remittance/tax checks. |
| 48 | Trust has new trustees not reflected in old docs. | Require current letters of authority. |
| 49 | Trust requires all trustees to sign. | Gate signing completeness. |
| 50 | Trust deed limits property purchase/sale. | Require conveyancer review. |
| 51 | Foreign trust buyer. | Require foreign trust authority and FICA escalation. |
| 52 | Foreign trust seller. | Require foreign trust and exchange-control checks. |
| 53 | Beneficial owner not captured for company. | Block FICA readiness. |
| 54 | Beneficial owner not captured for trust. | Block FICA readiness. |
| 55 | PIP/PEP party. | Trigger enhanced due diligence. |
| 56 | Sanctions hit. | Block and escalate. |
| 57 | High-risk jurisdiction. | Trigger enhanced due diligence. |
| 58 | Unexplained source of wealth. | Block finance readiness. |
| 59 | Unexplained source of funds. | Block finance readiness. |
| 60 | Third-party payer. | Require third-party FICA and source-of-funds review. |
| 61 | Cash buyer uses multiple fund sources. | Require each source and supporting proof. |
| 62 | Gifted deposit. | Require donor details, proof, and FICA review. |
| 63 | Crypto-liquidation funds. | Escalate AML/source-of-funds review. |
| 64 | Offshore funds. | Require authorised-dealer/exchange-control evidence. |
| 65 | Non-resident buyer paying from SA account. | Confirm residency/source and SARB treatment. |
| 66 | Foreign purchaser but permanent resident. | Route based on residency and funding facts, not nationality alone. |
| 67 | Foreign seller remits proceeds offshore. | Trigger SARB/authorised dealer workflow. |
| 68 | Foreign seller has SA tax issue. | Trigger SARS/tax clearance/conveyancer review where applicable. |
| 69 | Buyer is asylum seeker/refugee. | Capture legal identity/residency evidence. |
| 70 | Buyer passport expires before transfer. | Request updated identity document. |
| 71 | Bond preapproval only. | Do not satisfy bond approval gate. |
| 72 | Bond grant subject to conditions. | Keep finance gate open until conditions met/accepted. |
| 73 | Bond declined. | Trigger remedial finance path or OTP condition failure. |
| 74 | Bond amount lower than required. | Trigger hybrid proof-of-funds gap. |
| 75 | Hybrid cash plus bond mismatch. | Block readiness. |
| 76 | Buyer changes bank. | Recompute bond workflow and docs. |
| 77 | Multiple bond applications. | Track each bank and final accepted grant. |
| 78 | Guarantee issued after deadline. | Trigger suspensive-condition review. |
| 79 | Deposit not paid. | Block relevant OTP/finance readiness if deposit is a condition. |
| 80 | Deposit paid late. | Trigger waiver/extension review. |
| 81 | Deposit held by estate agency. | Require trust-account handling and audit. |
| 82 | Deposit refund due after failed condition. | Require refund authority and bank verification. |
| 83 | Buyer bank account changed. | Trigger fraud-control verification. |
| 84 | Seller bank account changed. | Trigger fraud-control verification. |
| 85 | Payment from company for individual buyer. | Trigger third-party payer review. |
| 86 | Sectional title with exclusive-use area. | Require EUA details and levy clearance. |
| 87 | Sectional title with special levy. | Require special levy disclosure. |
| 88 | HOA estate with consent requirement. | Require HOA consent/clearance. |
| 89 | Freehold with servitude. | Require servitude disclosure/review. |
| 90 | Agricultural land. | Trigger land-use/water/servitude checks. |
| 91 | Vacant land with no approved building plans. | Capture planning/municipal condition. |
| 92 | Illegal alterations. | Trigger building-plan/defect disclosure. |
| 93 | Property has tenant. | Require lease and occupation terms. |
| 94 | Tenant has right of first refusal. | Escalate before OTP finality. |
| 95 | Commercial property is VATable. | Require VAT classification before transfer docs. |
| 96 | Going concern zero-rated VAT claim. | Require lease/business continuation and SARS/conveyancer review. |
| 97 | Mixed-use property. | Split VAT/transfer duty and document requirements. |
| 98 | Sale of letting enterprise. | Trigger enterprise sale docs. |
| 99 | Share block. | Route out of normal transfer flow or support explicitly. |
| 100 | Long-term leasehold. | Route to leasehold-specific transfer logic. |
| 101 | Property is heritage-listed. | Require heritage/legal review. |
| 102 | Property in coastal/public servitude zone. | Require legal review. |
| 103 | Property subject to land claim. | Escalate and block automation. |
| 104 | Rates clearance figure delayed. | Keep transfer readiness blocked. |
| 105 | Levy clearance delayed. | Keep transfer readiness blocked. |
| 106 | Electrical certificate not required by contract but requested by attorney. | Represent as attorney-required, not generic optional. |
| 107 | Gas certificate required because gas installed. | Trigger only when installation exists. |
| 108 | Electric fence certificate required because fence exists. | Trigger only when installation exists. |
| 109 | Beetle certificate region/contract dependent. | Trigger by jurisdiction/contract condition. |
| 110 | Plumbing certificate municipality dependent. | Trigger by municipality/contract condition. |
| 111 | OTP unsigned by one required party. | Block sale confirmed. |
| 112 | OTP signed by unauthorised person. | Block sale confirmed. |
| 113 | OTP amended after signature. | Require versioned re-signature or accepted addendum. |
| 114 | Suspensive condition waived orally. | Require written waiver/addendum. |
| 115 | Agent mandate expired before offer. | Block or escalate. |
| 116 | Property disclosure missing. | Block buyer commitment/mandate workflow where required. |
| 117 | FFC invalid or missing for agency/practitioner. | Block agency authority if practitioner-facing compliance is in scope. |
| 118 | Document uploaded but unreadable. | Keep requirement incomplete pending review. |
| 119 | Document uploaded to wrong party. | Prevent gate satisfaction and protect access. |
| 120 | Legacy and canonical document engines disagree. | Fail parity check before readiness. |

Phase 7 finding:

At least 120 edge cases are material to launch. Many are not currently modeled as first-class legal branches or hard gates. The system should add explicit unsupported-scenario stops rather than silently routing them into `individual`, `company`, `trust`, or `other`.

## Phase 8 - Launch Certification

### Critical Blockers

1. Add first-class buyer branches for minor, deceased estate, insolvent/sequestrated buyer, buyer POA, close corporation, foreign company, foreign trust, and unsupported-capacity review.
2. Add first-class seller branches or hard stops for insolvent estate, minor owner, close corporation, foreign seller/remittance, curatorship, company liquidation, and business rescue.
3. Fix the seller multiple-owner branch drift between `multiple_individuals` and `multiple_owners`.
4. Make foreign/non-resident source-of-funds and exchange-control evidence mandatory where facts trigger it.
5. Turn suspensive conditions into hard workflow gates: bond approval deadline, subject-to-sale, inspection/defects, deposit, waiver, extension, and condition failure.
6. Convert canonical document definitions into complete conditional rules and prove parity against legacy buyer/seller/attorney fallback engines.
7. Add FICA enhanced due diligence rules: beneficial ownership, PIP/PEP, sanctions, high-risk country, source of wealth, source of funds, and third-party payer.
8. Add POPIA rule mapping for consent/lawful basis, purpose limitation, partner sharing, retention, deletion/export, breach handling, and cross-border transfer.
9. Add company/trust authority gates: current registration/letters, resolutions, all required signatories, beneficial owners, and authority expiry/versioning.
10. Add mandate/property-practitioner gates: mandate validity, expiry, scope, property condition disclosure, and practitioner/agency authority if the product claims practitioner compliance.

### High-Priority Non-Blockers

1. Add property-specific compliance certificate jurisdiction matrix.
2. Add VAT going-concern workflow and SARS evidence matrix.
3. Add seller/buyer bank-account change fraud controls.
4. Add stronger transaction fact versioning and legal-rule version stamping.
5. Add compliance owner fields: source URL, rule version, last reviewed date, and next review date.

### Pilot Boundary Recommendation

Until blockers are resolved, intake should only allow these supported cases without manual legal override:

- South African natural-person buyer/seller with ordinary capacity.
- Company buyer/seller that is active, not in rescue/liquidation, not a close corporation, with ordinary director authority and resolution.
- South African trust buyer/seller with current letters of authority and ordinary trustee authority.
- Cash, bond, or hybrid finance where all required evidence is present.
- Private resale, ordinary residential, sectional title, estate/HOA, or simple commercial transaction.
- Existing seller bond cancellation where cancellation evidence is captured.
- No foreign/non-resident funds unless manual compliance review is completed.
- No suspensive condition other than a standard bond condition unless the condition is manually tracked.

### Required Launch Tests

Add automated tests for:

- buyer minor blocked/escalated
- seller minor blocked/escalated
- buyer deceased estate docs required
- seller insolvent estate docs required
- buyer POA docs required
- seller foreign POA docs required
- CC buyer and seller branch docs
- foreign company buyer docs
- foreign trust buyer docs
- foreign seller remittance docs
- subject-to-sale condition gate
- bond deadline expiry gate
- deposit paid/unpaid gate
- third-party payer FICA gate
- PEP/PIP enhanced due diligence gate
- beneficial owner missing blocks FICA readiness
- trust all-trustee signing gate
- company resolution missing blocks signing
- seller multiple owners canonical branch
- canonical-vs-legacy document parity
- POPIA partner-sharing access minimization

### Final Certification Statement

The current system demonstrates strong engineering progress and passes many ordinary transaction tests, including propagation and workflow smoke checks. It should not be certified as complete South African conveyancing legal logic. The safest next step is a bounded pilot with hard unsupported-scenario stops, followed by targeted implementation of capacity, authority, foreign-exchange, FICA/POPIA, and suspensive-condition gates.

Final launch gate: NO-GO for full scope. CONDITIONAL PILOT ONLY after fixing the multiple-owner branch drift and adding unsupported-scenario blocking at intake.
