# Conveyancer Document Templates — Phase C5

## Purpose

C5 establishes independent assurance and a guarded legal-instrument pilot across C1 template governance, C2 deterministic value resolution, C3 governed data validation and C4 operational-document assembly.

The executable service is `src/services/attorneyWorkflow/conveyancerLegalInstrumentPilot.js`.

C5 certifies only that an immutable draft is safe to enter controlled attorney review. It does not certify legal approval, rendering, execution, signing or delivery.

## Per-instrument assurance

Critical checks independently verify:

- A valid active A-series matter plan and non-terminal action binding.
- A valid, published and fingerprint-matched C1 template version.
- A recognised legal-instrument family.
- Exact plan, transaction, organisation, template and content-hash bindings.
- A C4 draft contract with an independently recomputed SHA-256 content fingerprint.
- A structurally valid renderer-neutral section and signing-field model.
- A C3 data outcome with no blocking checks.
- Mandatory human review with persistence, signing and dispatch disabled.
- A redacted generation event bound to the exact document.
- No rendering, persistence, signing or dispatch side effect.

Critical failures produce `blocked`. A warning-only data result produces `observe`. A clean draft produces `ready`, meaning ready for attorney review only.

## Pilot scenarios

The deterministic suite covers:

- Residential transfer instruction.
- Commercial company transfer resolution.
- Bank-appointed bond application.
- Existing-lender cancellation instruction.
- A warning-only declaration that must remain under observation.
- An invalid identity that passes the scenario only when C4 blocks assembly.

This exercises transfer, bond and cancellation lanes, recognised residential and commercial instrument families, multiple operational document kinds and both successful and fail-closed paths.

## Operational thresholds and rollback

The pilot observes generation failures, data-block rates, warning rates and attorney-review SLA breaches. It holds or rolls back immediately for:

- Template-selection conflicts.
- Content-integrity failures or accepted tampering.
- Accepted unauthorised generation.
- Audit gaps.
- Any render, persistence, signing or dispatch attempt inside the C5 boundary.
- Critical threshold breaches.

Threshold overrides may make the pilot stricter but cannot weaken the default safety limits.

## Pilot manifest

The manifest requires:

- One to three named pilot firms.
- Exact approved template-version IDs.
- Explicit legal-instrument families and legal lanes.
- Five to twenty-five matters and no more than ten documents per matter.
- Named assurance, legal-review, rollback and support owners.
- Start and end dates.
- A legacy document fallback and kill switch.

The manifest cannot enable database writes, automatic rendering, legal approval, signing, dispatch or production packet integration.

## Phase boundary

C5 produces immutable assurance evidence, scenario results, rollout decisions and a pilot manifest in memory. It does not enrol firms, activate flags, render files, persist packet records, approve legal wording, create signatures, send documents or execute rollback actions.

No database migration is required.
