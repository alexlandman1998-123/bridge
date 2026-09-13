# Arch9 buyer onboarding, consent and FICA/KYC audit

Date: 13 September 2026. Scope: primary transaction workspace (`the-it-guy/`) and shared Supabase migrations/functions. Read-only source audit; no application, schema, remote data or deployment changes. The only deliverable added is this report. Existing Property24 work was left untouched.

## Assessment

**Arch9 has useful compliance components, but the inspected flow does not yet provide a defensible end-to-end evidence chain from buyer onboarding consent to genuine verification.** The most urgent issue is that the shared buyer/seller verification provider is a mock that always returns verified, low risk, sanctions clear and PEP clear. The browser service can persist those results without a consent-event reference [E4–E6]. This is a confirmed source-code behavior, not a claim that a particular live buyer has been incorrectly verified.

The buyer does accept versioned online terms, but these bundle transaction sharing, are saved in a mutable onboarding snapshot, and the separate consent projection deliberately returns `skipped`. Existing transaction consent tables are fee-specific and do not establish that the current buyer terms are recorded there [E2–E3, E7]. Knowledge Factory's separate FICA workspace records a staff attestation and manual checklist; external verification submission remains disabled [E8].

**Release blockers:** remove production mock success and unknown-provider fallback; persist purpose-specific onboarding evidence through an authoritative endpoint; require that evidence before checks or optional sharing; prevent ordinary clients from writing provider results and audit history; verify deployed document and compliance access policies.

### Evidence limits and legal interpretation

This report answers technical auditability, not legal certification. No remote database, bucket configuration, supplier credentials, live check, browser session, email or deployment was exercised. Migration files show intended definitions, not proof of deployment; the September document boundary migration explicitly describes staging evidence [E13]. Negative findings mean “not found in the traced implementation,” not proof that no unrelated module contains a similarly named feature.

Consent is not the only possible lawful basis for processing. Separate optional consent from a mandatory compliance notice and record the approved lawful basis per purpose; the Information Regulator's [lawful-processing guidance](https://inforegulator.org.za/knowledge-base/category/popia/chapter-3-conditions-for-lawful-processing/) and [credit-bureau code](https://inforegulator.org.za/wp-content/uploads/2020/07/20211012-gg45306gon596-InfoReg-COC-CBA-1.pdf) distinguish lawful grounds. An RMCP/compliance owner must approve wording, retention, provider use, enhanced due diligence and timing before implementation is treated as compliant. The “no default upload” objective is a product requirement to implement under those approved rules, not a blanket legal exemption. Historical [FIC guidance on electronic verification](https://www.fic.gov.za/Documents/171002_FIC%20Guidance%20Note%2007.pdf) explains reliability and institutional responsibility, but is not used here as certification of current requirements; current guidance and the agency's RMCP still require confirmation.

## 1. Current flow map

1. **Entry:** token route `/client/onboarding/:token`; mobile buyer onboarding has its own route wrapper. There is also a demo route. The flow operates in transaction context rather than creating a universal compliance identity on its own [E1].
2. **Who is buying?** Purchaser type determines individual, marital/co-purchaser, company, trust and foreign branches [E1, E10].
3. **How is it financed?** Cash, bond and combination change the questions. Cash skips bond-related collection; non-cash branches include credit and optional originator assistance [E1–E2].
4. **Details:** personal/contact/address and applicable legal/entity/finance information. Company directors and trust representatives/trustees are represented. No dedicated Compliance & Consent step appears in the step definition [E1, E10].
5. **Review & Submit:** summary includes expected documents and the online terms/transaction permissions checkbox. There is no provider check in this submission sequence [E1–E4].
6. **Persistence:** `submitClientOnboarding` calls `upsertClientOnboardingForm`; the browser invokes `bridge_save_buyer_onboarding_snapshot`, passing form JSON, allowlisted transaction fields, funding sources and submit state. The token-scoped RPC saves onboarding form data; conflict handling replaces the form snapshot. The app records completion timestamps and transitions to `awaiting_signed_otp`, then reconciles documents/participants/finance projections and portal access [E3, E9]. Submission is not equivalent to FICA clearance.
7. **After submission:** buyer portal document workspace presents the checklist and upload flow. The onboarding review explicitly describes the checklist as following submission. A missing-document summary is not evidence that uploads block the initial form submission [E1, E11–E12].
8. **Staff verification:** the buyer panel in the agency pipeline uses the shared seller component. Staff may run/re-run checks when `canRun`, required subject fields and storage availability allow. The service does not require consent ID, transaction ID or purpose; default provider is mock [E4–E6, E15].
9. **Attorney workflow:** separate buyer/seller FICA review tasks exist. A September migration consolidates requested/received/approved tasks into one review task per party. These workflow statuses must not be mistaken for provider evidence [E16].

Seller onboarding is a separate page but shares the verification component. Seller submission derives POPI acceptance from an explicit existing value **or** accepted Arch9 seller terms, then records a timestamp; this is not independent FICA consent. Property disclosure, co-owner/spouse authority and signed mandate/OTP requirements have distinct purposes [E17]. The primary README says the legacy generator is retired; uploaded signed legal documents do not fix the missing onboarding-to-verification consent link [E18].

## 2. Current data model

| Records | Existing fields / relationships | Relevant gap |
|---|---|---|
| `buyers`, `transactions`, onboarding records / `onboarding_form_data` | Buyer and transaction context; `form_data`; submission/completion and lifecycle state; snapshot RPC derives transaction from token [E3, E9] | Mutable form answers are not an append-only consent ledger; compliance runs instead identify a contact. |
| `compliance_profiles` | `organisation_id`, `client_contact_id → contacts.contact_id`, entity type, current status/risk, last verified and next review; unique org/contact [E5] | No transaction/party scope or onboarding consent reference. |
| `compliance_verification_runs` | Profile, org/contact, provider/reference, initiator/time, status, risk, response/report references [E5] | No consent FK, transaction FK, immutable subject snapshot, provider environment or rule version. |
| `compliance_verification_checks` | Run FK; type/status/result/provider code; reviewer/time; unique run/type [E5] | No direct provenance from an approved consent purpose. |
| `compliance_verification_audit_events` | Org/contact/run, action, actor, metadata, provider reference and time [E5] | Members receive update rights; client-generated events are not immutable evidence. |
| `transaction_consent_wording_versions`, `transaction_consents` | Transaction, generic party ID/type, wording/version/snapshot, acceptance identity/time, IP/user agent, source, revocation metadata [E7] | Schema inspected restricts consent type to platform fee; party ID lacks a party FK; no direct org FK; current helper skips recording. Reuse design, do not assume current terms are covered. |
| `bond_application_consents` | Unique transaction; org, originator selection/contact, version/time/role, JSON snapshot [E14] | Upsert replaces previous evidence; snapshot does not store full displayed text; permission/missing-table failures return null. |
| `knowledge_factory_fica_cases` | Org/prospect/creator, subject name, individual/company/trust, staff consent time/by/version, checklist/reviewer, provider status/reference/expiry [E8] | Separate case system; no buyer/contact/transaction/consent-event FK, provider defaults not configured. |
| Canonical documents | `document_packs`, `document_definitions`, `document_requirement_rules`, `document_requirement_instances`, `document_requirement_reviews`, `document_requirement_events` [E11] | Strong reusable categorization/review base; lacks the requested verified-risk/RMCP-driven evidence substitution in the traced flow. |
| Files and compatibility projections | `documents`: transaction, file path/bucket, category/type, visibility, uploader and canonical requirement link; `transaction_required_documents` remains in compatibility paths [E3, E12] | Need compliance-run-to-evidence link and purpose-specific audience. |
| Finance / workflow evidence | `bond_finance_document_access_audit`; signed bond declarations; transaction events and subprocess steps [E14, E16, E19] | Useful separate evidence, not a single buyer compliance history. |

A buyer, transaction, agency and staff actor can already be identified across these systems. Attorney/originator access comes through transaction assignment/role pathways rather than a dedicated recipient authorization attached to a compliance consent event. No enforced chain currently proves that a run used the consent of the correct transaction party [E3–E7, E13–E14].

## 3. Current consent handling

| Surface | Actual wording or field | Evidence quality |
|---|---|---|
| Buyer final checkbox | “I accept the online terms and give permission for my information to be shared with the relevant transaction roleplayers.” Body explicitly includes agency/developer, transferring attorney, originator, banks, conveyancers and compliance providers [E2]. | Stores acceptance/time, wording snapshot and `buyer-online-terms-permissions-v1` in form data. Stronger than a boolean, but bundled and mutable. `normalizePlatformFeeConsentAcceptance` takes version from current configuration, so historical reconstruction must not rely on that helper. |
| Credit | “Consent for credit check?”; `credit_check_consent`, synchronized/fallback with `bond_readiness_consent` [E1–E2]. | Separate finance answer, not a specific immutable credit permission event linked to a run. Do not infer “yes” from merely present text. |
| Originator | “I consent to the selected originator contacting me and accessing the finance information required for this bond application.” [E1] | Separate choice/version exists. Consent table is one mutable row per transaction; error handling may return no saved record [E14]. |
| Attorney sharing | Included in mandatory final transaction permissions [E2]. | No separate attorney-sharing decision found in the traced buyer steps. |
| Marketing | No dedicated marketing opt-in found in the buyer step/page/field definitions [E1–E2]. | Do not repurpose transaction permissions as marketing consent. Separate marketing systems elsewhere do not establish onboarding consent. |
| Knowledge Factory | Staff confirms the subject consented to FICA/KYC processing for a stated business purpose [E8]. | Staff attestation; service stamps consent automatically when creating a case. No captured buyer interaction or full wording snapshot. |
| Seller | POPI boolean/accepted text and timestamp can derive from accepted seller terms [E17]. | Bundled evidence; cannot independently establish each verification purpose. |
| Bond application | Loan-processing and credit-bureau/fraud/bank-data declarations plus digital signature fields [E19]. | Additional finance evidence, not proof of consent before a separate FICA run. |

No single dedicated buyer onboarding consent explicitly covers the requested identity, FICA/KYC, fraud, sanctions/PEP, third-party checks and verification-record storage purposes and is then enforced by the verification service [E1–E6]. Consent record storage exists in several forms; describing the whole system as “only booleans” would be inaccurate.

## 4. Current verification handling

**Shared buyer/seller FICA: mocked, with real persistence code.** `complianceProviderRegistry` has only a mock registered. Unknown keys fall back to mock. Its result is always verified/low risk with clear sanctions/PEP. The UI default and service default are both `mock`. The browser writes profile, run, checks and audit rows; UI flags are not database authorization [E4–E6].

Statuses already include `in_progress`, `verified`, `review_required`, `failed`, `incomplete`, `expired`; risk includes low/medium/high/review_required/unknown. Reuse these with an explicit mapping to requested pending/manual_review vocabulary. Expiry fields alone do not prove scheduled re-screening. The active-run check is a query before insert, not a concurrency guarantee; multiple writes are not atomic and errors can leave partial evidence [E4–E5].

**Knowledge Factory FICA: manual workflow / integration readiness.** Checklist and staff consent are persisted, but the UI says submission is disabled. The GraphQL function contains operation type names including FICA/credit, while its dispatched actions implement other supplier capabilities; an operation name is not an implemented KYC integration [E8]. No live Knowledge Factory/TPN FICA result was established by this audit.

## 5. Current document handling and security

Uploads are deferred from the main form to the follow-on checklist, but basic individuals still receive ID and address requirements in `purchaserPersonas`. Canonical seed rules independently require buyer identity when legal type exists, with OTP/attorney-instruction gates. Entity, trust, foreign, spouse and finance packs add conditional requirements. Attorney requirements also expect FICA evidence. Therefore, fixing just the onboarding page would not achieve risk-based uploads across the transaction [E10–E12, E20].

Categories are already useful: buyer identity/FICA, entity authority, finance and other transaction packs. Documents carry storage paths/buckets, visibility, uploader information and canonical links; portal access uses signed URLs. Requirement events support upload/review/approve/reject/waive/expire history. Compliance report viewing logs a client event but suppresses failures; finance has a separate access audit. This is partial audit coverage, not guaranteed logging of every sensitive read/download/change [E4, E6, E11–E14].

**RLS is not yet sufficient for the requested assurance:**

- Compliance tables use active-org-member `FOR ALL` policies and authenticated select/insert/update grants. Any active member within that policy can change provider outcomes and audit rows; there is no assigned-agent/compliance-role separation. Do not infer DELETE permission solely from `FOR ALL`: actual grants matter [E5].
- Knowledge Factory read/update policies admit `created_by = auth.uid()` without also requiring current membership on that branch. A former member may retain case access; permitted updates do not pin org/creator/consent fields. This needs tenant and field-integrity tests [E8].
- The September document migration adds a restrictive audience boundary to rows and bytes, checks portal tokens, and patches definer projections. This is a meaningful improvement. But professional-shared records are broadly available to professional readers, non-transaction surfaces retain other policies, and FICA purpose/subject restrictions are not a separate boundary. Verify buyer/seller separation, co-buyers, former assignees, entity representatives and raw bytes [E13].
- Database policies do not prove bucket privacy or deployed behavior. Verify private buckets, signed-link lifetimes, old URLs, RPC grants and service-role handlers against the actual environment before clearing the security blocker [E12–E13].

## 6. Gap analysis

P0 = block compliance reliance; P1 = required implementation; P2 = operational improvement.

| Area | Current State | Required State | Gap | Priority |
|---|---|---|---|---|
| Verification truth | Mock writes successful results [E4–E6] | Genuine provider/manual evidence clearly distinguished | False assurance and silent provider fallback | P0 |
| Consent gate | Final terms; run has no consent input [E1–E4] | Buyer event required before checks | No enforced traceability | P0 |
| Evidence integrity | Client writes outcomes/audits [E5] | Authorized server writes; immutable history | Members can alter evidence | P0 |
| Purpose separation | Credit/originator fields, bundled sharing [E1–E2, E14] | Separate compliance, credit, finance sharing, attorney sharing, marketing | Missing or overlapping purposes | P1 |
| Wording history | Snapshot/version, skipped projection [E2–E3] | Exact server-selected wording/version receipt | No durable event for current online terms | P1 |
| Identity context | Org/contact profile; transaction elsewhere [E5, E9] | Buyer/party/transaction/org/actor chain | Unenforced cross-model links | P1 |
| Buyer classification | Individual, foreign, company, trust and authority details [E10] | Verified subject plus representative/beneficial-owner roles | General representative-for-another-person flow not established | P1 |
| Risk | Fields exist; mock low result [E4–E5] | Explainable, versioned risk decision | No approved RMCP evaluation in traced verification | P1 |
| Documents | Persona and canonical default requirements [E10–E12] | Requests based on evidence/risk/RMCP/attorney rules | No successful electronic-check substitution | P1 |
| Access | Org-wide compliance and scoped document policies [E5, E13] | Purpose/role/assignment and subject boundaries | Too broad / deployed state unverified | P0 |
| History | Requirement/review/report/finance events [E6, E11, E14] | Complete protected sensitive-access and decision history | Client best-effort events; fragmented ledgers | P1 |
| Staff experience | FICA panel, case checklist, attorney review [E6, E8, E16] | Unified consent/check/risk/evidence timeline | Several independent status sources | P1 |
| Rechecks | Expiry/review fields [E5, E8] | Expiry scheduling, renewed authority where needed | Automation not established | P2 |

## 7. Recommended implementation plan

### Phase 1 — Audit-safe consent capture

Add Compliance & Consent after personal/entity details and before any verification action. Show the exact approved purposes, providers/recipient categories, retention notice and lawful bases. Separate credit/affordability, optional finance sharing, attorney sharing and marketing decisions; no preselected optional choices. Preserve declines and withdrawals. Mandatory legal obligations must not be misrepresented as optional consent.

Use a token-scoped server/RPC endpoint to select immutable published wording and save acceptance atomically. Return a receipt ID and block dependent actions if persistence fails. Do not simply reactivate the fee-consent helper. For multiple buyers/representatives, record who accepted, for whom and under what authority. Existing rows must remain legacy evidence; never invent historic consent.

**Acceptance:** the server rejects missing/stale/wrong-party consent; exact text is retrievable after wording changes; retries do not duplicate events; refusal cannot be interpreted as acceptance. Addresses E1–E3, E7, E14.

### Phase 2 — Compliance record model

Reuse `compliance_profiles`, runs/checks and document requirement tables. Add either an append-only `consent_events` ledger or a generalized successor to `transaction_consents`; avoid maintaining two competing sources of truth.

Recommended schema changes:

- Published consent wording: purpose, version, exact text/hash, effective dates, locale, lawful basis and immutable publication record.
- Consent event: org, buyer/contact and transaction-party FKs, optional pre-transaction onboarding scope, onboarding/session reference, purpose, decision, wording reference/snapshot, server time, authenticated actor or bounded token identity, subject/representative and authority evidence; trusted IP/user-agent when available; supersedes/withdrawal reference and idempotency key. Do not store bearer tokens.
- Verification run: required qualifying consent-event link (or join for several purposes), transaction/party scope, stable provider key/environment, check types, request ID/idempotency key, subject snapshot hash, timestamps/expiry and failure classification. Enforce org/subject consistency with constraints or trusted transactional validation.
- Risk decision history: run/profile/transaction, rating, reason codes, rule/RMCP version, assessor, decision time, next review and enhanced-diligence requirements. Keep current profile as a projection.
- Evidence links: run/check ↔ existing document/requirement; record document version/hash, verified by/when, expiry, source and permitted audience.
- Protected audit events: append-only server writes for decisions, access, changes, requests and downloads; retention/legal hold rules must prevent inappropriate cascade erasure of required evidence.

**Acceptance:** every new verification traces to actual buyer onboarding evidence; legacy runs remain visibly unproven until reviewed. Addresses E5, E7, E9, E11, E14.

### Phase 3 — Verification integration readiness

Reuse the provider abstraction but move execution and credentials server-side. Disable mock outside explicit test/demo contexts and fail closed for unknown/unconfigured providers. Define adapters for an approved supplier only after checking supported identity, address, sanctions/PEP and entity/beneficial-owner capabilities; provider selection alone is not coverage.

Implement start/status/result/report operations, signed callbacks or trusted polling, replay protection, bounded retries, idempotency and transactional state transitions. Map pending → in_progress and manual_review → review_required consistently, or migrate all consumers together. Keep raw payloads in restricted server storage; expose minimized normalized results and short-lived report access. Log provider environment so test data cannot satisfy real workflow gates.

**Acceptance:** failure, timeout, partial match, manual review and expiry never turn green; concurrent retries produce one logical run; absent/revoked authority blocks applicable checks. Addresses E4–E8.

### Phase 4 — Risk-based document uploads

Update the canonical requirement rules and their persona/attorney compatibility consumers together. The rule decision must consider subject type, verification result, risk, approved RMCP version, attorney request and representative authority. A low-risk individual with acceptable electronic evidence may need no initial upload only where the approved rules allow it; unknown/failed checks and enhanced-risk/entity/foreign/representative cases request the specific evidence needed.

Record the reason for each request or evidence-based waiver. Update OTP/transfer readiness so accepted electronic evidence satisfies the right requirement without pretending a file was uploaded. Preserve explicit attorney requests and historical document decisions.

**Acceptance:** test basic individual, failure, high risk, RMCP override, attorney request, foreign national, company, trust, representative and co-buyer; test both canonical and compatibility paths. Addresses E10–E12, E16, E20.

### Phase 5 — Staff/admin compliance view

Extend the existing FICA panel rather than build another checklist. Show consent purposes/receipt/text, provider and environment, per-check results, risk reasons, document requirements and their reasons, expiry, reviewer decisions and protected audit history. Distinguish “information complete”, “check complete” and “compliance approved”. Provide safe summaries to buyer/attorney/originator according to their assignments; raw reports require explicit authorized access.

**Acceptance:** staff can explain why a buyer is blocked and export a coherent evidence package without collecting unrelated finance/marketing data. Addresses E6, E8, E13, E16.

### Phase 6 — Security and RLS review

Design this alongside Phase 1, not after launch. Remove direct browser mutation of provider results/audits; separate read/run/review/admin capabilities. Require active membership and relevant assignment on every applicable branch; prevent reassignment of org, subject and actor fields. Apply least-privilege controls to consent, documents, payloads, reports and all SECURITY DEFINER/service-role endpoints.

Verify actual grants/policies, private storage and signed URLs with a role matrix: unrelated tenant, same-org unassigned member, assigned agent, compliance reviewer, buyer, co-buyer, seller, representative, attorney, originator and removed/expired user/token. Test row metadata and file bytes separately. Verify logs remain complete when UI closes or client logging fails.

**Acceptance:** negative access tests pass in an explicitly selected environment; no deployment assurance based only on migration text. Addresses E5, E8, E13–E14.

### Concrete UI and API work list

UI: modify `ClientOnboarding` step assembly and review; purpose-specific controls and receipt; representative authority capture; explainable document requests; enhance shared FICA panel and portal summary. Keep seller acceptance separate even when sharing components.

API/RPC: extend or compose with `bridge_save_buyer_onboarding_snapshot`; add authoritative acceptance/withdrawal/read-receipt endpoints; replace browser verification writes with start/status/callback/review handlers; add authorized report/download endpoints and server audit; make originator sharing depend on saved evidence rather than a nullable upsert result. Integrate canonical requirement recalculation after verified risk changes.

All schema changes should be new append-only migrations. No migration or deployment is authorized/performed by this report.

## 8. Checks performed and remaining decisions

Passed existing local source-contract checks:

- `node scripts/knowledge-factory-phase4-fica-kyc.test.mjs`
- `node the-it-guy/scripts/buyer-fica-verification-panel.test.mjs`
- `node the-it-guy/scripts/buyer-onboarding-online-terms-no-platform-fee.test.mjs`

These are static assertions, not live provider, browser or RLS tests. No broad build/release suite was needed for a report-only change.

Decisions required before implementation: approve wording/lawful bases and retention; confirm current RMCP and electronic evidence criteria; select/contract the actual provider and coverage; define reviewer and recipient privileges; agree treatment of historical mock results and legacy consent; confirm deployed migrations, bucket privacy and signed-link behavior. The requested six phases are implementation recommendations only.

## Evidence index

Every E-reference above links to inspected source below. Line anchors identify the relevant entry point; some findings span the surrounding function or migration.

- **E1** — [Buyer routes and steps](/Users/alexanderlandman/the-it-guy/the-it-guy/src/App.jsx:4000)
- **E1** — [Step definitions](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/purchaserPersonas.js:2423)
- **E1** — [Buyer step assembly and review](/Users/alexanderlandman/the-it-guy/the-it-guy/src/pages/ClientOnboarding.jsx:2370)
- **E1** — [Originator and credit fields](/Users/alexanderlandman/the-it-guy/the-it-guy/src/pages/ClientOnboarding.jsx:1342)
- **E2** — [Exact online terms and acceptance normalization](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/platformFeeConsent.js:1)
- **E3** — [Skipped consent projection](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/api.js:42903)
- **E3** — [Snapshot and submission persistence](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/api.js:44278)
- **E3** — [Token-scoped snapshot RPC call](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/api.js:42735)
- **E4** — [Verification writes and audit](/Users/alexanderlandman/the-it-guy/the-it-guy/src/services/clientComplianceService.js:106)
- **E4** — [Mock registry and fallback](/Users/alexanderlandman/the-it-guy/the-it-guy/src/services/complianceProviderRegistry.js:1)
- **E5** — [Compliance schema, grants and policies](/Users/alexanderlandman/the-it-guy/supabase/migrations/202608290002_client_compliance_verification.sql:1)
- **E6** — [Shared panel permissions and execution](/Users/alexanderlandman/the-it-guy/the-it-guy/src/components/compliance/SellerFicaVerification.jsx:87)
- **E6** — [Buyer wrapper](/Users/alexanderlandman/the-it-guy/the-it-guy/src/components/compliance/BuyerFicaVerification.jsx:1)
- **E7** — [Fee-specific consent schema](/Users/alexanderlandman/the-it-guy/supabase/migrations/202607270006_arch9_transaction_platform_fee_consent.sql:99)
- **E8** — [Knowledge Factory cases and RLS](/Users/alexanderlandman/the-it-guy/supabase/migrations/20260909200653_knowledge_factory_phase4_fica_kyc_cases.sql:1)
- **E8** — [Staff case creation](/Users/alexanderlandman/the-it-guy/the-it-guy/src/services/propertyIntelligence/knowledgeFactoryFicaService.js:20)
- **E8** — [Manual FICA UI](/Users/alexanderlandman/the-it-guy/the-it-guy/src/components/canvassing/KnowledgeFactoryFicaWorkspace.jsx:1)
- **E8** — [Supplier endpoint implementation](/Users/alexanderlandman/the-it-guy/supabase/functions/knowledge-factory-graphql/index.ts:1)
- **E9** — [Onboarding token and snapshot persistence](/Users/alexanderlandman/the-it-guy/supabase/migrations/202607230006_buyer_onboarding_portal_token_handoff.sql:142)
- **E9** — [Token fence](/Users/alexanderlandman/the-it-guy/supabase/migrations/202607230007_buyer_onboarding_snapshot_token_fence.sql:1)
- **E10** — [Purchaser/entity/foreign branch contract](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/buyerOnboardingFlowContract.js:300)
- **E10** — [Individual required documents](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/purchaserPersonas.js:1394)
- **E11** — [Canonical document tables](/Users/alexanderlandman/the-it-guy/supabase/migrations/202605250001_canonical_document_system_phase1.sql:115)
- **E11** — [Default buyer identity rule](/Users/alexanderlandman/the-it-guy/supabase/migrations/202605250001_canonical_document_system_phase1.sql:461)
- **E12** — [Buyer document workspace](/Users/alexanderlandman/the-it-guy/the-it-guy/src/components/client-portal/documents/BuyerDocumentWorkspace.jsx:1)
- **E12** — [Signed portal URLs](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/api.js:49845)
- **E12** — [Document persistence fields](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/api.js:52204)
- **E12** — [Compatibility requirement engine](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/buyerRequirementEngine.js:1)
- **E13** — [Document audience and storage boundary](/Users/alexanderlandman/the-it-guy/supabase/migrations/20260911081342_document_storage_audience_boundary.sql:1)
- **E14** — [Bond consent/access audit schema](/Users/alexanderlandman/the-it-guy/supabase/migrations/202607220013_bond_application_consent_and_finance_document_audit.sql:1)
- **E14** — [Nullable mutable bond consent upsert](/Users/alexanderlandman/the-it-guy/the-it-guy/src/lib/api.js:29457)
- **E15** — [Agency buyer panel wiring](/Users/alexanderlandman/the-it-guy/the-it-guy/src/pages/agency/AgencyPipelinePage.jsx:37116)
- **E16** — [Consolidated attorney FICA tasks](/Users/alexanderlandman/the-it-guy/supabase/migrations/20260909194621_consolidate_fica_review_workflow.sql:1)
- **E17** — [Seller POPI derivation](/Users/alexanderlandman/the-it-guy/the-it-guy/src/pages/SellerOnboarding.jsx:4441)
- **E18** — [Retired generator and signed-document workflow](/Users/alexanderlandman/the-it-guy/the-it-guy/README.md:5)
- **E19** — [Bond declarations and signature fields](/Users/alexanderlandman/the-it-guy/the-it-guy/src/modules/bond/application/bondApplicationCompletion.js:123)
- **E19** — [Current signed-version handoff enforcement](/Users/alexanderlandman/the-it-guy/supabase/migrations/20260913124839_bond_originator_handoff_workflow.sql:1)
- **E20** — [Attorney FICA document expectations](/Users/alexanderlandman/the-it-guy/the-it-guy/src/services/attorneyWorkflow/attorneyDocumentRequirementsResolver.js:119)
