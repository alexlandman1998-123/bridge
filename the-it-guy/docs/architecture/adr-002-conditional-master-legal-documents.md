# ADR-002: Conditional master templates for Mandate and OTP

- Status: Accepted
- Date: 2026-07-20
- Owners: Legal documents and agency workflows
- Supersedes: Scenario-specific template selection for standard Mandate and OTP generation

## Context

The legal document editor presents a Mandate and an OTP as documents with standard wording, situation wording, signing setup, previews, and revision history. The rendering system already supports section-level `condition_json` rules and canonical legal scenario facts.

A second model was later introduced in which seller, buyer, property, marital, and finance facts selected different template records. That made a legal scenario look like a template version, duplicated agency wording, created drift between variants, and conflicted with the editor's conditional-document model.

## Decision

Mandate and OTP each use one logical conditional master template per organisation.

- A document type is `mandate` or `otp`.
- A template revision is an immutable published revision of that organisation's master document.
- A legal scenario is the canonical set of party, property, marital, and finance facts for a packet.
- A conditional pack is a section or group of sections activated by those facts.
- Scenario facts select conditional sections inside the active master revision. They do not select another template.
- Only one published revision is active for each organisation and document type at a time.
- An organisation-owned master takes precedence over the shared platform master. Existing active-template ownership and default tie-breakers remain authoritative.
- Explicit templates may still be supplied by controlled preview, revision, recovery, and historical-packet flows.
- Generated packets remain pinned to the exact template revision, resolved placeholders, visible-section manifest, signer plan, and scenario provenance used at generation time.

## Runtime contract

Standard generation follows this sequence:

1. Resolve the active master by organisation, document type, and supported module.
2. Resolve canonical legal scenario facts from saved transaction or onboarding data.
3. Validate that required facts are complete and non-conflicting.
4. Resolve active conditional packs and their data requirements.
5. Evaluate each section's `condition_json` against the canonical placeholders.
6. Render only visible sections and build the matching signer plan.
7. Persist the selected master revision and complete resolution provenance.

Legacy scenario-routing metadata remains readable for historical audit and migration, but it must not influence standard template selection.

### Canonical scenario resolver (Phase 2)

All Mandate and OTP entry points call `resolveCanonicalLegalDocumentScenario`. Its contract is:

- canonical party values: `individual`, `company`, `close_corporation`, or `trust`;
- canonical marital values: `single`, `out_of_community`, or `in_community`;
- canonical property values: `full_title` or `sectional_title`;
- canonical OTP finance values: `cash`, `bond`, or `combination`;
- explicit source provenance for every resolved fact;
- separate missing, unsupported, and conflicting fact collections;
- fail-closed completion when any required fact is missing, unsupported, or conflicting; and
- one ordered `activePackKeys` result used by readiness, generation, preview, and signing.

Blank values remain blank. Data mappers and editors must not manufacture an individual, company, cash, full-title, or sectional-title answer. Legacy aliases may normalize into the canonical vocabulary, but contradictory saved sources block generation until corrected.

### Scenario-aware data collection (Phase 3)

The canonical profile also controls the intake experience:

- seller type, buyer type, property title type, finance type, and applicable marital position are routing questions;
- unanswered routing questions do not expose or require downstream scenario fields;
- company and close-corporation profiles reveal company authority fields;
- trust profiles reveal trustee authority fields;
- an individual married in community reveals spouse-consent fields;
- sectional-title and full-title profiles reveal only their applicable property identifiers;
- cash, bond, and combination finance profiles reveal only their applicable amount fields;
- required markers, readiness groups, generation preflight, and the editor use the same requirement result; and
- when a routing answer changes, values that are no longer applicable are cleared from the draft.

Saved source data may prefill applicable fields, but it does not bypass scenario completeness or conflict validation.

### Conditional master artifacts (Phase 4)

The platform ships exactly two global residential agency masters:

- `mandate_default_v1`, containing standard mandate wording plus six locked seller/property packs; and
- `otp_default_v1`, containing standard OTP wording plus thirteen locked buyer, seller, property, and finance packs.

The OTP combination-finance scenario activates both bond wording and a dedicated cash-contribution pack. It does not reuse cash-sale wording. Each master includes one signature section and a default signer-role plan; spouse roles remain conditional.

The master manifest is shared by the runtime default and the template editor. Database sections carry `conditional_master_version`, `conditional_pack`, and `condition_rule_locked` metadata. Organisations may edit approved legal wording in their copied revision, while core activation conditions remain platform-controlled.

## Editor contract

- **Standard wording** edits unconditional sections in the master.
- **Situation wording** edits conditioned sections in the same master.
- **Signing setup** edits the signer configuration associated with that master and its conditional packs.
- **Scenario preview** renders the same master against selected sample facts.
- Core conditional-pack activation rules are platform-controlled. Organisation administrators edit approved wording, not the meaning of the core activation rule.

The editor must not offer Mandate routes, OTP "Used when" template routing, variant-pack creation, or route-specific launch readiness for standard Mandate and OTP documents.

## Phase 5 — Conditional-section editor

The organisation editor derives its conditional-section catalogue directly from the conditional-master manifest. It does not infer editor navigation from labels, clause text, or regular expressions.

- Mandate exposes six exact conditional sections and OTP exposes thirteen.
- Purchaser and seller capacity packs are separate editor targets.
- Full-title and sectional-title wording are separate editor targets.
- Bond, cash-sale, and combination cash-contribution wording are separate editor targets.
- The editor groups these sections for navigation, but a selection always resolves to an exact section key.
- Organisation users may edit legal text and use approved clauses inside a core pack.
- They may not rename, remove, reorder, or change the required merge fields, identity, or activation rule of that pack.
- Publishing fails closed if a required pack or protected rule is missing, duplicated, unlocked, or if the master no longer has exactly one signature section.

Legacy `?situation=` links remain readable as compatibility aliases, but all newly generated editor links use exact conditional-pack keys.

## Phase 6 — Hardened conditional engine

Legal-document generation uses a strict conditional engine with an explicit version. The legacy convenience evaluator remains available for non-legal compatibility, but Mandate and OTP master packs use strict evaluation.

- Malformed rules, unsupported operators, empty enabled rules, missing expected values, and contradictory alias values are invalid and excluded.
- Missing data cannot satisfy a negative operator such as `not_equals` or `not_in`.
- Every protected pack rule must match the rule stored in the conditional-master manifest.
- Every evaluated pack result must agree with the canonical scenario resolver's active pack set.
- A missing, duplicated, unlocked, drifted, or mismatched pack blocks preview and generation.
- An incomplete canonical scenario excludes all conditional packs and blocks generation.
- Editable section manifests are checked against the same expected pack selection before rendering.
- The validation snapshot stores the full conditional-engine audit, including included and excluded sections, rule traces, issue codes, and engine versions.
- Render provenance stores the included/excluded pack keys and a deterministic decision hash so a generated document's assembly can be reconstructed.

The engine does not silently fall back from a rejected core pack to unconditional wording.

## Phase 7 — Conditional signing

Mandate and OTP use one versioned signing resolver driven by the canonical legal-document scenario. The signer roster is not inferred independently by the editor, signing-field template, or dispatch workflow.

- Individual parties sign in their personal capacity.
- Company and trust parties use the same stable party role with an authorised-representative label and contact details.
- A buyer or seller spouse is selected only when the canonical party profile requires spouse consent.
- A captured second buyer remains distinct from a spouse and is never inferred for an entity buyer.
- Mandate uses `seller_spouse` as the canonical spouse role; the legacy `purchaser_2` surrogate is not created for new signing plans.
- Template signing fields control placement, but cannot introduce an excluded scenario-controlled role or omit or duplicate a required signature role.
- Missing signer contact facts do not prevent document assembly, but they fail closed before signing preparation.
- Existing signing rows are checked against the current generated version; a stale spouse or party row requires signing preparation to be reset.
- Dispatch assurance repeats the canonical roster and field checks before links can be issued.
- Validation snapshots and render provenance record the signing-engine version, selected/excluded roles, and a deterministic signing-decision hash.

The generated version's resolved placeholders are the signing source of truth. Caller-supplied preparation data cannot change the legal scenario or signer roster after generation.

## Phase 8 — Coverage readiness

Publish and runtime readiness are properties of the complete conditional master, not of scenario-template routing inventory.

- Mandate coverage evaluates 12 supported fact cases across seller entity/marital classifications and both property-title types.
- OTP coverage evaluates 216 supported fact cases across seller and buyer entity/marital classifications, both property-title types, and all three finance types.
- Equivalent clause profiles may share a scenario key, but close-corporation and marital normalization inputs are still exercised independently.
- Every supported case must resolve completely, include exactly the canonical pack set, and produce a compatible conditional signer plan.
- Every protected pack must be present, uniquely keyed, locked, version-current, reachable, and contain wording.
- The master must contain exactly one signature section and its protected signer-role conditions must match the manifest.
- A failure in a branch unrelated to the transaction currently being generated still blocks publication and generation because the master is not safe for universal use.
- Coverage readiness is shown in the editor and legal-document library and is recorded in validation snapshots and render provenance with a deterministic decision hash.
- Generation overrides cannot bypass a coverage-readiness failure.

Legacy route audits remain readable as historical diagnostics only. A generic fallback or a collection of route-specific templates is not coverage evidence.

## Phase 9 — Scenario preview

Scenario preview is a read-only projection of the same canonical scenario resolver, conditional-master engine, and conditional-signing engine used by generation. Scenario preview does not maintain a second set of conditional rules.

- Presets are shortcuts only. An administrator can adjust seller type and marital position, buyer type and marital position for OTP, property title type, and OTP finance type.
- Mandate preview omits buyer and finance facts because they cannot affect a mandate master. Entity parties omit marital-position controls because those facts are not applicable.
- Before rendering, preview identifies included wording, excluded wording, the selected signer roles, and any readiness failure produced by the production engines.
- The dedicated scenario-preview page and the editor's current-unsaved-edits preview both use the same versioned preview model.
- Preview uses clearly synthetic sample identities and performs no source-data writes, packet creation, signing preparation, or dispatch.
- A preview result is evidence of the selected case only. Universal publish and runtime safety still require the Phase 8 coverage-readiness result.

## Phase 10 — Safe migration

Organisation migration to the two conditional masters is a four-step, audited state machine: prepare, activate, observe or roll back, and finalise. Migration is never an in-place rewrite of a published template.

- Preparation is idempotent and creates one organisation-owned draft from the applicable global master. It copies all protected packs and rules from the global master and reconciles exact-key standard wording from the organisation's current default.
- All previous organisation templates remain immutable and addressable. Wording that cannot be reconciled automatically remains in its source revision and is surfaced for explicit review.
- Activation requires a complete Phase 8 coverage result, its deterministic decision hash, and confirmation that reconciled wording was reviewed.
- Activation changes the default pointer but does not archive legacy variants. It opens a 14-day rollback window recorded in the migration audit row and candidate metadata.
- Rollback restores the recorded previous default without mutating generated packets, packet-version snapshots, template revisions, or signing evidence.
- Finalisation is a separate administrator action. It is rejected before the rollback deadline and archives only the exact legacy template IDs captured during preparation.
- Database RPCs repeat administrator, candidate-structure, state-transition, and deadline checks. Client readiness alone cannot activate or finalise a migration.
- Mandate and OTP migrate independently so an organisation can hold or roll back one without affecting the other.

No migration step deletes a template or changes the template revision recorded by an existing document.

## Phase 11 — Verification

Verification is a point-in-time certification of the live migrated master, not another editable readiness flag. It combines a client-side recomputation of the full legal scenario matrix with an independent database evidence check.

- The client recomputes conditional-master coverage from the current stored sections and requires the result's version and deterministic decision hash to match the Phase 10 activation record.
- The database verifies the recorded global source, organisation candidate, one live default, exact protected-pack count, locked rules, non-blank wording, and one signature section.
- During an activated migration, every recorded legacy template must remain unarchived and the rollback deadline must exist. After completion, every exact recorded legacy ID must be archived and inactive.
- Historical packets linked to the candidate or legacy templates must retain their template revision ID, version tag snapshot, and immutable template-definition snapshot.
- Verification does not update templates, sections, packets, packet versions, signer evidence, migration state, or default pointers.
- Each attempt creates an immutable receipt containing coarse counts and issue codes. Failed receipts are retained as evidence and cannot be presented as verified.
- A receipt is current only while its candidate ID, migration state, verification version, coverage version, and coverage decision hash still match the live evidence.
- Mandate and OTP receive separate verification receipts and can fail or pass independently.

A green user-interface state without a current durable verification receipt is not Phase 11 evidence.

## Compatibility and migration

- Existing generated packet versions are immutable and continue to use their recorded template and data snapshots.
- Existing scenario-specific templates are not deleted during this phase.
- Their routing metadata is treated as legacy audit data.
- The global conditional masters are seeded without deleting organisation wording or historical generated versions.
- A later migration will create or reconcile an organisation-owned draft from the global master, verify wording and scenario coverage, publish it, and archive obsolete scenario templates after a rollback window.

## Consequences

### Positive

- Agencies maintain one Mandate and one OTP.
- Standard wording cannot drift across legal scenarios.
- Conditional behaviour matches the editor's mental model.
- Revision history represents real wording changes rather than party/property combinations.
- Scenario coverage can be validated as a property of one master revision.

### Trade-offs

- Conditional-pack coverage becomes a hard publish requirement.
- Canonical scenario facts and fail-closed validation must be completed before final generation can be certified.
- Legacy variant dashboards and tests must be replaced with conditional-master coverage checks.

## Follow-up decisions

The following are deliberately deferred to later phases:

- locking core conditional rules in the organisation editor;
- seeding missing Mandate and OTP conditional packs;
- replacing route readiness with conditional-pack coverage readiness;
- migrating and archiving existing scenario-specific templates;
- completing the Mandate and OTP scenario render matrices.
