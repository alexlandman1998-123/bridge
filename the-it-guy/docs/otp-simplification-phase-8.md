# OTP simplification — Phase 8 live assurance

Phase 8 answers one operational question in plain language: **Are generated OTPs coming from the approved master and being released safely?**

It is a read-only audit. It does not create clauses, edit the master OTP, approve a document, send signing links, or trigger rollback.

## Exact master-version evidence

Every canonical generated OTP carries:

- the canonical parent template ID;
- the exact immutable template-version ID;
- the template version label;
- the canonical DOCX content hash; and
- a fingerprint of the rendered transaction data.

The audit resolves that version against `document_packet_template_versions`. A version is valid only when it belongs to the same organisation and parent template, has a released status (`published` or `superseded`), and its content hash matches the generation provenance.

A superseded version remains valid evidence for documents generated while it was live. Changing the current live pointer does not invalidate existing documents.

## Operator decision

The OTP overview combines the Phase 7 recovery health with generated-document evidence:

- **Healthy — release may continue:** exact version evidence, readiness, approval and release checks pass.
- **Hold for review:** an operational or attorney approval queue remains.
- **Stop signature release:** immutable version evidence or approval evidence is unsafe.
- **Audit incomplete:** a required query or registry is unavailable, so the audit fails closed.
- **Awaiting first canonical OTP:** the master is live but no generated canonical document exists yet.

The screen shows the number of canonical documents whose exact master versions were verified. A finding names the packet, generated version, short master-version ID, state and next action.

## Delivery boundary

Phase 8 adds no database migration and performs no deployment. It depends on the Phase 2 version registry and the Phase 7 provenance fields. The audit remains an explicit administrator action and never changes live data.
