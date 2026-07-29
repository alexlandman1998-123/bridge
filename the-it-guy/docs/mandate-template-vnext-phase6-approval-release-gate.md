# Mandate Template vNext Phase 6 Approval and Release Gate

Generated: 2026-07-28T12:00:00.000Z
Version: mandate_template_vnext_phase6_approval_release_gate_v1
Status: RELEASE_GATE_PASSED
Release allowed: yes
Mutated data: false

## Release Contract

| Item | Value |
| --- | --- |
| Phase 6 contract | mandate-template-vnext-release-v1 |
| Required service-owned B3 contract | phase4-b3-integrity-v1 |
| Expected content digest | sha256:91924c1d5d84ca75471825a0976f9ecc463d51b38567ca0e311e4956bdcb6b65 |
| Sections | 16 |
| Merge fields | 57 |
| Max estimated pages | 5 |
| Pre-approval blockers | 0 |
| Approval evidence blockers | 0 |

## Pre-Approval Gates

| Gate | Pass | Detail |
| --- | --- | --- |
| PHASE6_WORDING_READY_FOR_COUNSEL | yes | Phase 4 wording gate is ready for counsel review. |
| PHASE6_PDF_LAYOUT_GATE_PASSED | yes | Phase 5 native PDF layout gate is preserved and refined. |
| PHASE6_CONTENT_PUBLISH_GATE_PASSED | yes | Mandate content publish gate has no blocking issues. |
| PHASE6_DATA_SOURCE_FIELDS_MAPPED | yes | Every vNext merge field has a canonical data-source mapping. |
| PHASE6_DATA_SOURCE_MAP_COVERS_VNEXT | yes | Data source map covers the vNext token set. |
| PHASE6_SECTIONS_VERSIONED | yes | Every section carries the vNext wording version metadata. |
| PHASE6_SECTIONS_LAYOUT_CONTRACTED | yes | Every section carries explicit native PDF layout contract metadata. |

## Approval Evidence Gate

| Gate | Pass | Detail |
| --- | --- | --- |
| PHASE6_COUNSEL_APPROVAL_EVIDENCE_PRESENT | yes | Independent counsel approval metadata is present before release. |
| PHASE6_COUNSEL_DECISION_APPROVED | yes | Counsel review status is approved. |
| PHASE6_COUNSEL_APPROVAL_DATE_PRESENT | yes | Counsel approval timestamp is present and parseable. |
| PHASE6_COUNSEL_APPROVAL_REFERENCE_PRESENT | yes | Counsel approval reference is present. |
| PHASE6_EXPECTED_CONTENT_DIGEST_BOUND | yes | Phase 6 packet includes the expected vNext content digest. |
| PHASE6_COUNSEL_DIGEST_MATCHES_VNEXT | yes | Counsel approval content digest matches the Phase 6 vNext digest payload. |
| PHASE6_COUNSEL_REVIEW_EVIDENCE_DIGEST_PRESENT | yes | Counsel review evidence digest is present. |
| PHASE6_COUNSEL_APPROVAL_NOT_REVOKED | yes | Counsel approval has not been revoked. |
| PHASE6_B1_MANIFEST_BOUND | yes | Approval is bound to the frozen B1 review manifest. |
| PHASE6_B3_APPLICATION_TIME_PRESENT | yes | Service-owned B3 application timestamp is present and parseable. |
| PHASE6_B3_APPLIED_BY_PRESENT | yes | Service-owned B3 applied-by actor is present. |
| PHASE6_B3_APPLICATION_REFERENCE_PRESENT | yes | Service-owned B3 application reference is present. |
| PHASE6_B3_RELEASE_CONTRACT_BOUND | yes | Service-owned B3 metadata carries phase4-b3-integrity-v1. |

## Approval Evidence

| Field | Value |
| --- | --- |
| Status | approved |
| Approved at | 2026-07-28T19:50:52.761Z |
| Reference | COUNSEL-MANDATE-VNEXT-20260728 |
| Content digest | sha256:91924c1d5d84ca75471825a0976f9ecc463d51b38567ca0e311e4956bdcb6b65 |
| Counsel review evidence digest | sha256:ce5d473dd3ae79c8cd893dd51a767cfe72f578408633b3bbbbfda1153f1b7d0b |
| B1 manifest digest | sha256:6f080a20e1fa53b2b0485e3439263a3d80d0ecfa9ab80eadb5ed46271ab1770b |
| B3 applied at | 2026-07-28T19:50:52.761Z |
| B3 applied by | service_role:mandate-vnext-release |
| B3 application reference | B3-MANDATE-VNEXT-20260728 |
| B3 release contract | phase4-b3-integrity-v1 |

## Release Steps

- Freeze the Phase 6 digest payload and provide the Phase 4 wording plus Phase 5 layout report to counsel.
- Record the independent B2 counsel decision against the same content digest.
- Apply runtime approval only through the service-owned B3 path carrying phase4-b3-integrity-v1.
- Render and visually inspect the native PDF artifact before enabling the vNext mandate template for production use.

## Boundary

This Phase 6 gate does not mutate live data and is not itself legal approval. Release remains blocked until independent counsel evidence and the service-owned B3 runtime approval metadata match this packet digest.
