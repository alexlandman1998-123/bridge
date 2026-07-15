# Conveyancer Document Templates — Phase C1

## Purpose

C1 establishes one strict governance contract for conveyancing document-template versions. It extends the existing legal-template registry and lifecycle utilities; it does not create another template store or generator.

The executable source of truth is `src/core/documents/legalTemplateGovernance.js`.

## Governed identity and versioning

Every version records:

- Stable template and template-version IDs.
- Organisation scope, module, packet type, document kind and legal lane.
- Sequential version number, predecessor and classified change summary.
- Jurisdiction, language and—where applicable—legal instrument family.
- Immutable content hash and a storage or structured-section source.
- Authorship, approval, publication and withdrawal evidence.

Version one cannot have a predecessor. Later versions require the immediately preceding released version, a changed content hash and a patch, minor, major or emergency change classification.

## Field and clause governance

- Every placeholder must map to one uniquely keyed variable.
- Every required variable must appear in the template.
- Mapped and calculated values require a source path.
- Manual values require explicit manual-entry authority.
- Variable legal text must reference an approved clause.
- Required clauses carry a version, immutable hash and authorised approval.
- Mapping gaps and unapproved required clauses block publication.

## Authority and lifecycle

- Secretaries can author and submit drafts but cannot approve them.
- Conveyancers and transfer attorneys can independently approve legal wording.
- The author cannot approve their own version.
- Only a firm manager can publish, supersede or withdraw a released version.
- Published, superseded and withdrawn versions are immutable.
- Draft mutation requires the original author or a firm manager; identity fields cannot be edited and content changes require an updated hash.
- Publishing requires a matching governance fingerprint over identity, routing, content, fields and clauses, plus complete field/clause governance.

The lifecycle remains `draft → attorney_review → approved → published → superseded`, with reasoned return, withdrawal and supersession paths.

## Applicability and selection

Applicability can restrict transaction type, finance type, party entity types, property tenure, existing-bond state and legal lane. Missing routing facts fail closed.

Selection considers only valid, independently approved, currently effective published versions. Organisation versions outrank global defaults, more specific routes outrank generic routes, and another organisation’s template is never eligible. Equal-priority conflicts are reported while retaining deterministic ordering for diagnostics.

## Existing infrastructure

The current `document_packet_templates`, `document_packet_template_versions`, field-mapping, approval, approved-clause and audit tables already support this contract. C1 therefore requires no database migration.

## Phase boundary

C1 validates and selects governed template definitions in memory. It does not persist records, publish templates, move live pointers, generate documents, resolve matter variables, assemble clause text or migrate legacy templates automatically.
