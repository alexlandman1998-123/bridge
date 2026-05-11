# Legal Document Builder Current-State Audit

Date: 2026-05-11  
Project: Bridge 9 (`/Users/alexanderlandman/the-it-guy/the-it-guy`)

## 1. Current Document System

### What exists now
- Core document tables in baseline schema (`sql/schema.sql`):
  - `documents`
  - `document_request_groups`
  - `document_requests`
  - `transaction_required_documents`
  - `document_templates`
  - `document_requirement_rules`
  - `document_groups`
  - `development_documents`
  - `transaction_attorney_closeout_documents`
  - `transaction_bond_closeout_documents`
- Seller-side document domain in migration layer (`sql/20260509_private_listing_foundation.sql`, `sql/20260509_private_listing_requirement_engine.sql`):
  - `private_listing_documents`
  - `private_listing_document_requirements`
  - `private_listing_seller_onboarding`

### Current upload/request/review flows
- Internal/staff upload path: `src/lib/api.js` (`uploadDocument`), used by:
  - `src/pages/Documents.jsx`
  - transaction pages/workflow panels
- Client portal upload path: `src/lib/api.js` (`uploadClientPortalDocument`), used by:
  - `src/pages/ClientPortal.jsx`
- Request flow:
  - request creation/status/resend in `src/lib/api.js` (`createTransactionDocumentRequests` + related status/update methods)
  - request rendering and status shown in documents/transaction UIs
- Approval/rejection:
  - request lifecycle includes requested/submitted/approved/rejected patterns
  - review metadata and rejection reasons are stored and surfaced

### Visibility model in current system
- Existing fields support internal vs client-safe split:
  - `documents.visibility_scope` (internal/shared/client style behavior)
  - `documents.is_client_visible`
  - `documents.external_access_id` for token-scoped access
- Token-aware portal/external access patterns are already in app + SQL hardening phases.

### Storage usage
- Primary storage model uses Supabase bucket(s), defaulting to `documents` when env candidates are absent (`src/lib/supabaseClient.js`).
- Paths include transaction/client-portal/organisation style foldering depending on feature flow.

### Document metadata currently captured
- Typical fields across flows:
  - document type/category/group
  - uploaded by role/user/email
  - stage linkage
  - transaction/development/unit linkage
  - request linkage (where applicable)
  - visibility and review status

### Where documents are linked today
- Transaction: strongly linked (`transaction_id` everywhere)
- Buyer/client: via onboarding/request/client-portal associations
- Development/unit: present in schema and query usage
- Organisation: present in modern flows and packet layer
- External token/client portal: supported via token-aware retrieval paths

---

## 2. Current Template / Generation System

### Existing template/generation capabilities
There is already a substantial packet/template/signing foundation in migrations and code.

### Existing packet/template tables (migration layer)
From `sql/20260508_document_packet_foundation.sql` + related scripts:
- `document_packet_templates`
- `document_template_sections`
- `document_placeholder_registry`
- `document_packets`
- `document_packet_versions`
- `document_packet_events`

From signing migrations:
- `document_packet_signers`
- `document_signing_fields`
- plus signer token/signature asset/final artifact support via additional 20260508 migrations.

### Current generation approach
- DOCX template merge exists via Edge Functions:
  - `supabase/functions/generate-mandate/index.ts`
  - `supabase/functions/generate-otp/index.ts`
- Libraries used: `Docxtemplater`, `PizZip` (DOCX merge path), and `pdf-lib` for final signed output assembly (`generate-final-signed-document`).
- Packet orchestration logic exists in:
  - `src/core/documents/packetService.js`
  - `src/core/documents/packetWorkflow.js`
  - `src/lib/documentPacketsApi.js`

### Template storage model
- Template registry is DB-backed (`document_packet_templates`) with storage path metadata.
- Actual template files are expected in Supabase Storage (e.g., under `documents/...`) referenced by `template_storage_path`.

### Merge fields / placeholders
- Placeholder registry table exists and merge resolution/validation is already implemented in packet workflow code.

### PDF/report generation already present
- Legal flow uses DOCX template rendering + PDF/final artifact handling.
- Reporting/export uses separate report-specific logic (not a single universal legal-doc engine).

---

## 3. Available Merge Field Data

### Buyer-side data availability
Available from `buyers`, `transaction_onboarding`, `onboarding_form_data.form_data`, and transaction-linked profile/contact data:
- names/contact basics
- marital and spouse fields
- company/trust shape fields
- identity/FICA-related fields (varies by onboarding completion)
- finance and affordability-related onboarding fields

### Seller-side data availability
From private listing + seller onboarding domain:
- seller individual/company/trust details
- representative details
- contact details
- marital/ownership regime fields
- onboarding declarations and form payload

### Property/unit data availability
From `transactions`, `units`, `developments`, and private listing flows:
- development name
- unit identifiers
- property addressing and type indicators
- deal price/deposit/finance values
- linked participants/agent ownership fields

### Transaction data availability
From `transactions` + role assignments + workflow state:
- finance type, bond/cash/deposit amounts
- stage and status markers
- attorney/bond/agent/developer assignments
- timeline fields used in current workflow UIs

### Document-state data availability for merge/render context
- requested docs + uploaded docs + status + visibility
- client-visible/internal split signals
- packet state/version/signing readiness signals in packet layer

Assessment: **merge field coverage is already strong enough for an MVP legal-doc builder without schema redesign**.

---

## 4. Current Onboarding Data Available for Legal Docs

### Buyer onboarding
- Routes/components:
  - `src/pages/ClientOnboarding.jsx`
- Storage:
  - onboarding token/state + `onboarding_form_data` JSON payload
- Contains rich data for purchaser party, structure, and compliance context.

### Seller onboarding
- Routes/components:
  - `src/pages/SellerOnboarding.jsx`
  - `src/pages/SellerPortal.jsx`
- Storage:
  - `private_listing_seller_onboarding` (+ linked private listing and requirement/document records)
- Captures seller identity/type/marital/ownership and listing intent context.

### Normalized vs JSON reality
- Mixed model:
  - core entities normalized (`transactions`, `profiles`, `buyers`, `private_listings`)
  - form richness in JSON (`onboarding_form_data.form_data`, seller onboarding form payloads)

Assessment: **usable now**, but mapping rules need standardization to avoid field drift between template versions.

---

## 5. Current Signing / Review Capability

### What exists
- External signing route and token flow:
  - UI: `src/pages/SignerPortal.jsx`
  - API wrapper: `src/lib/externalSigningApi.js`
  - function: `supabase/functions/signer-signing-action/index.ts`
- Seller portal review/sign progression:
  - UI: `src/pages/SellerPortal.jsx`
- OTP signature capability exists in client-side onboarding flow.
- Packet lifecycle events/logging exist (`document_packet_events`) and broader transaction activity logging exists.

### What this means practically
- Platform already supports:
  - prepare signer links
  - external token-based signing entry
  - signing field preparation and completion actions
  - post-sign artifact generation path

### Current fragility observed
- If template storage path or packet version generation fails, signing path falls back and can feel partial.
- RLS/policy stability on packet event and packet version tables has required dedicated stabilization migration.

---

## 6. Current Legal Document Permission Gaps

### Current state
- App-level checks exist (organisation role/admin gating for packet/template management).
- DB-level RLS exists for packet tables/signing tables, with later stabilization to reduce onboarding/demo breakage.

### Gaps
Missing as a clearly defined legal-doc permission model:
- explicit roles for:
  - template author
  - template approver
  - legal reviewer
  - publisher to client portal
  - signing initiator
- explicit rule set for who can edit generated draft after generation but before send
- explicit distinction between internal legal draft visibility vs client-visible draft visibility across all doc surfaces
- immutable lock/finalize semantics consistently enforced after signing completion

Assessment: **partially exists; needs a dedicated permission matrix before production-grade legal workflow scale**.

---

## 7. Database and Storage Gap Analysis

Requested target objects and current status:

- `legal_templates`: **missing** (can reuse `document_packet_templates`)
- `legal_template_versions`: **partially exists** (reuse `document_packet_versions` pattern; template versioning model still lightweight)
- `legal_template_sections`: **partially exists** (reuse `document_template_sections`)
- `legal_template_merge_fields`: **partially exists** (reuse `document_placeholder_registry`)
- `generated_legal_documents`: **partially exists** (reuse `document_packets` + `document_packet_versions` + `documents`)
- `generated_document_versions`: **partially exists** (reuse `document_packet_versions`)
- `signing_requests`: **partially exists** (reuse `document_packet_signers` + signer token tables)
- `signing_parties`: **partially exists** (reuse `document_packet_signers`)
- `signature_events`: **partially exists** (reuse `document_packet_events` + signing actions)
- `document_audit_events`: **partially exists** (packet events exist; full cross-doc unified audit table missing)

### Storage gap notes
- Storage bucket pathing works, but legal template availability depends on correct file placement + `template_storage_path` accuracy.
- Baseline drift risk: packet/signing tables come from migration files and are not fully represented in old minimal setup paths.

---

## 8. Recommended Architecture

### Option comparison

- Option A: DOCX in Storage -> merge -> PDF
  - Pros: fastest for legal formatting fidelity, attorney-friendly starting point.
  - Cons: weak online editing/version governance unless additional layer is added.

- Option B: fully structured DB template + online editor first
  - Pros: excellent product editing UX and version governance.
  - Cons: highest complexity/risk and slower legal-grade formatting parity.

- Option C (Hybrid): import DOCX, normalize into structured template metadata, allow controlled online edits, export PDF/DOCX
  - Pros: best long-term fit for Bridge: legal fidelity now + scalable editing/signing/audit later.
  - Cons: requires staged rollout discipline.

### Recommendation for Bridge
**Choose Option C (Hybrid), implemented in phases on top of existing packet/signing foundations.**

Why this is best for Bridge right now:
- Reuses current packet/template/signing groundwork immediately.
- Keeps legal documents attorney-compatible from day 1 via DOCX templates.
- Adds online editing and governance incrementally without rewriting current flows.
- Supports future template library, locking, audit, and client-portal-safe publication model.

---

## 9. MVP Legal Document Builder Build Plan

## Phase A: Template Library Foundation
- Objective:
  - normalize template catalog and required metadata (type, jurisdiction, role, activation/default rules).
- Likely files:
  - `src/pages/settings/SettingsSigningTemplatesPage.jsx`
  - `src/lib/documentPacketsApi.js`
  - packet migrations (non-breaking additive)
- DB likely needed:
  - additive metadata/version columns or helper views on packet template tables.
- Reuse:
  - `document_packet_templates`, `document_template_sections`, storage paths.
- Do not touch:
  - auth/onboarding core.

## Phase B: Online Template Editor
- Objective:
  - in-app section editing and placeholder insertion with safe preview.
- Likely files:
  - template settings pages + packet workflow editor components.
- DB likely needed:
  - section ordering/content schema hardening and editor-safe validation.
- Risks:
  - rich text structure drift, formatting parity with DOCX.

## Phase C: Merge Field Engine
- Objective:
  - canonical merge registry + mapping from transaction/onboarding/seller data.
- Likely files:
  - `src/core/documents/packetWorkflow.js`
  - merge resolver utilities
- DB likely needed:
  - stronger placeholder metadata and validation rules.
- Reuse:
  - existing `document_placeholder_registry` and packet version pipeline.

## Phase D: Generated Draft Documents
- Objective:
  - reliable draft generation/versioning with clear provenance.
- Likely files:
  - `src/core/documents/packetService.js`
  - mandate/otp generation function paths
- DB likely needed:
  - explicit draft state machine fields and generation error tracking.

## Phase E: Review / Approval / Locking
- Objective:
  - legal review lifecycle before signer send; lock after approval/signing.
- Likely files:
  - document packet workflow panels
  - lead/transaction action panels
- DB likely needed:
  - approval actor/time/reason and locked-final flags.

## Phase F: E-signature Request Flow
- Objective:
  - robust signer invite, reminders, expiration, multi-party order.
- Likely files:
  - `src/lib/externalSigningApi.js`
  - signer portal pages
  - `supabase/functions/signer-signing-action/index.ts`
- DB likely needed:
  - signer request lifecycle expansions (reminders/escalation states).

## Phase G: Final Signed PDF Archive
- Objective:
  - immutable signed artifact storage and retrieval in client/internal portals.
- Likely files:
  - `src/lib/documentPacketsApi.js`
  - final-signed document function path
- DB likely needed:
  - finalized artifact index/search metadata + strict retention flags.

---

## 10. Risks / Unknowns / Decisions Needed

### Key risks
- Schema/migration parity drift across environments (packet/signing tables missing or partially applied).
- Template file path drift in storage causing runtime generation failures.
- Permission ambiguity between operational roles and legal author/reviewer roles.
- Mixed normalized+JSON onboarding data causing merge-field inconsistency if not canonicalized.

### Unknowns to confirm
- Final legal template governance owner (ops vs legal team vs principals).
- Required jurisdiction/template variants at launch.
- Whether multi-signer order/parallel signing is required in MVP.
- Legal retention and audit requirements for signed docs (compliance period, immutable storage expectations).

### Decisions needed before implementation
- Confirm Option C hybrid path as product direction.
- Define canonical merge-field contract and naming (single source of truth).
- Define legal permission matrix (author/reviewer/approver/sender/signer visibility).
- Define minimum template set for launch (mandate, OTP, addenda, disclosures).

---

## Bottom Line
Bridge already has a meaningful legal-document/signing foundation in place (packet templates, versioning, signer routes, and final artifact generation). The best path is to consolidate and harden what exists via a hybrid architecture, rather than introducing a separate net-new legal-document stack.
