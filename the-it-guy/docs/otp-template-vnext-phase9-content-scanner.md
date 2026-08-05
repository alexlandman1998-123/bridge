# OTP Template vNext Phase 9 Content Scanner

Generated: 2026-08-05T09:58:50.547Z
Version: otp_content_scanner_phase9_v1
Status: OTP_CONTENT_SCANNER_PHASE9_READY_FOR_RENDERER_WIRING
Mutated data: false

## Summary

| Metric | Value |
| --- | --- |
| Routes | 2 |
| Legal sections scanned | 22 |
| Shell sections scanned | 16 |
| Unique scanned tokens | 86 |
| Blockers | 0 |

## Checks

| Check | Pass | Detail |
| --- | --- | --- |
| PHASE9_CONTENT_SCANNER_BOTH_ROUTES_PRESENT | yes | Phase 9 content scanner covers resale and new-development routes. |
| PHASE9_LEGAL_CONTENT_ROUTE_SCAN_PASSES | yes | Legal content passes the route-aware scanner. |
| PHASE9_FULL_CONTENT_SURFACE_SCAN_PASSES | yes | Legal sections plus shell sections pass the route-aware scanner. |
| PHASE9_ALL_SCANNED_TOKENS_CANONICAL | yes | All legal, shell, structured-term and signing tokens are canonical OTP fields. |
| PHASE9_STRUCTURED_TERMS_RENDER_IN_LEGAL_CONTENT | yes | Every structured term field renders through route legal content. |
| PHASE9_SIGNATURE_FIELDS_STAY_IN_SIGNING_PLAN | yes | Signature and initials fields stay in the signing plan, not legal body rows. |
| PHASE9_SHELL_TOKENS_SCANNED_AND_CANONICAL | yes | Branded shell tokens are included in the scanner and canonical. |
| PHASE9_FORBIDDEN_ROUTE_TOKENS_BLOCKED | yes | Resale and new-development content tokens remain route separated. |
| PHASE9_NO_DOCX_REFERENCE_IN_CONTENT | yes | Client-facing OTP content does not refer to DOCX/Word artifacts. |
| PHASE9_ROUTE_SIGNAL_COVERAGE_COMPLETE | yes | Scanner detects required resale and new-development signal families. |

## Route Scans

| Route | Legal Scan | Full Surface Scan | Signals | Tokens |
| --- | --- | --- | --- | --- |
| Existing / resale property OTP | pass | pass | finance_conditions, occupation_rent, parties, resale_disclosure_fixtures, resale_property, shared_offer, subject_to_sale, transfer_conveyancer | 62 |
| New development OTP | pass | pass | development_body_corporate, development_handover, development_unit, development_vat, finance_conditions, parties, shared_offer, transfer_conveyancer | 67 |

## Boundary

Phase 9 scans the OTP content surface against route rules, structured terms, signature plans and shell tokens. It does not render sample PDFs, dispatch signing, approve counsel wording, or replace visual PDF QA.
