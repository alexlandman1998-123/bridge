# Legal Template Platform Defaults: Phase 1 Product Rule

Date: 2026-07-24

Scope: product rule and governance contract only. This phase does not promote templates, change routing precedence, modify readiness scoring, archive existing records, or alter document generation behaviour.

## Decision

Ultron provides platform-owned, legally approved default legal templates for residential `otp` and `mandate` packets.

Agencies must be able to use the platform immediately without first uploading, editing, publishing, or approving their own OTP or mandate template.

Agency-owned templates are optional customisations. They may override the platform default only after they are saved as organisation-owned templates and pass the same publish, approval, and runtime-release controls required for live legal generation.

## Canonical Default Model

The out-of-box template row is platform-owned:

- `organisation_id` is `null`.
- `module_type` is `agency`.
- `packet_type` is `otp` or `mandate`.
- `template_key` is `otp_default_v1` or `mandate_default_v1`.
- `status` is `published`.
- `is_active` is `true`.
- `is_default` is `true`.
- `template_format` is `structured` or `json`.
- `metadata_json.render_mode` is `native_structured`.
- Legal approval and runtime release metadata are complete before live generation.

This is the Ultron boilerplate. It is not a demo template and must not be treated as a second-class fallback when it is approved and active.

## Product Behaviour

New organisations inherit the platform defaults automatically. No organisation-owned template row is required for first use.

If an organisation has no approved custom template for a packet type, generation routes to the approved platform default.

If an organisation has an approved custom template for the packet type and route, that organisation template wins.

If an organisation has a draft, inactive, archived, or unapproved custom template, it must not override the approved platform default for live generation.

Editing a platform default creates or updates an organisation-owned draft copy. The platform default remains immutable from the agency user's perspective.

## Document Logic Boundary

Mandate smart logic is seller and agency focused:

- seller individual, company, trust, or close corporation
- seller marital status and spouse consent where applicable
- property title type
- agent and agency authority
- mandate signing roles

OTP smart logic is transaction-party focused:

- seller individual, company, trust, or close corporation
- buyer individual, company, trust, or close corporation
- buyer and seller marital status and spouse consent where applicable
- property title type
- finance type
- suspensive and special conditions
- OTP signing roles

Buyer-type conditional wording belongs in OTP unless a mandate clause explicitly and legally depends on buyer identity.

## Readiness Meaning

For later phases, readiness must follow this product rule:

- `ready`: an approved active organisation template is selected.
- `ready`: no organisation template is required and an approved active platform default is selected.
- `warning`: the organisation is using the platform default while it has draft custom work in progress.
- `blocked`: no approved active platform or organisation template is available.
- `blocked`: a default/custom template is selected but is unapproved, inactive, archived, or not runtime released.

## Phase 1 Acceptance Criteria

- The product rule is documented in the repository.
- The rule states that platform defaults remove first-use template publishing friction.
- The rule names `otp_default_v1` and `mandate_default_v1` as the canonical default keys.
- The rule states that unapproved organisation templates must not override approved platform defaults.
- The rule defines the mandate/OTP smart-logic boundary.

## Later Phases

Phase 2 promotes the actual global mandate template to match the OTP release standard.

Phase 3 prevents unapproved organisation templates from winning live routing.

Phase 4 updates readiness semantics so approved platform defaults count as ready.

Phase 5 polishes the customise/clone workflow.

Phase 6 verifies scenario-specific conditional logic.

Phase 7 adds a read-only release gate that packages platform default presence, B3 legal release, native starter quality, readiness semantics, clone safety, and scenario logic into one GO/NO-GO certificate.

Phase 8 adds a guarded remediation planner for Phase 7 failures. It can normalise safe platform-default routing state and replay eligible B3 runtime releases through the service-owned RPC, but it must not forge counsel approval metadata or change legal wording.
