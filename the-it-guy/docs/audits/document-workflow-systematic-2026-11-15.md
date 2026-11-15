# Document workflow audit — 15 November 2026

Owner: primary Arch9 transaction workspace. Production inspected read-only:
`isdowlnollckzvltkasn`. No customer file, approval, signature, commission or
live checklist link was changed. The preventive source fix below is local only.

## Approach and acceptance boundary

Trace a document through bytes → metadata → exact checklist/person/context →
fresh read → review → signing → transaction handover → authorised download.
Passing module tests is not evidence that this entire hosted chain works.

| Boundary | Evidence obtained | Remaining acceptance condition |
| --- | --- | --- |
| Transfer and metadata commit | 91 recovery/policy/observability/progress tests passed; exercises lost responses, rejected saves and retry behaviour | Controlled hosted upload with actual actor permissions |
| Fresh listing read and classification | Storage fallback, seller upload-state persistence and seller persistence regression scripts passed | Reload a newly uploaded hosted file from both owning screens |
| Checklist identity | Reproduced a cross-transaction attachment; regression failed before fix and passed after | Release preventive guard and separately review historical bad links |
| Review and role projection | 43 UI/service tests passed; 1 presentation test passed | Hosted signed-in review walkthrough; no customer approval used as a test |
| Handover and transaction synchronisation | 23 sync tests passed, including the new context regression | Controlled hosted lead/listing-to-transaction continuity check |
| Storage and historical references | Hourly monitor observed running; 30 stores, 3,012 source rows, 3,316 storage objects in latest inspected snapshot | Catalogue presence does not prove readable bytes or role access |
| Monitoring | 35 inventory/monitor tests passed; live latest report at 20:10 SAST | Activity coverage is not the same as route acceptance coverage |
| Download/access | Developer document access, revoked handover and role-projection tests included above | Verify downloaded bytes/hash under permitted actor and denial under another actor |

## Confirmed live findings

The latest inspected report has **27 critical findings**, not 27 distinct lost
documents: 16 missing-object references, 9 canonical-backlink conflicts and
2 wrong-transaction links. Some findings concern the same record. The 2,520
overall findings also include review candidates; unmatched objects must not be
treated as lost uploads or deleted automatically. Only 500 finding details are
retained; the report correctly marks that detail set incomplete.

Two legacy checklist rows on Samlin transaction
`c25df11a-96c7-4544-b91f-e547893b175c` point to document
`2942e6c7-f2bd-4fc6-ac1a-54c1b63b8608`, whose owning transaction is
`27222111-c065-4d49-a185-3df7bba03058`. Checklist row IDs:
`18f1a8ec-4cfe-4492-b004-45f0d362e15c` and
`d0e60979-04ff-47f8-a031-d7f2c3835854`.
These are real, non-demo transaction records. Ownership must be established
before repairing links; moving the original file is not an appropriate guess.

Three Samlin backlink findings and two Samlin wrong-context findings were
attributable through transaction ownership. No critical findings in the inspected
report were attributable to Kingdom through those joins. Global/unowned template
and historical records remain unresolved; this is not a Kingdom health certificate.

The last seven days contain only one observed listing upload attempt (start and
success on 14 November). No new `documents`, `private_listing_documents` or
private requirement-upload records were created after that success in the
checked interval. Therefore the empty latest-hour telemetry does **not** establish
that the collector is broken, nor does it validate the 27 upload surfaces.

## Reproduced preventive defect

`reconcileRequiredDocumentInstanceLinks` matched a canonical instance by document
key and requested role without checking the transaction. A matching foreign
instance was attached in the red regression. The local fix filters candidates by
known transaction context and reports conflicts instead of writing them. Removed
requirements receive the same context check. Existing conflict handling excludes
these rows from upsert. Compatibility instances without context retain existing
behaviour; this helper does not replace database authorisation.

This demonstrates a real defect in the matching function. It does not prove this
function created every historical bad link. The fix does not repair existing data.

## Checks and limits

- 35 inventory/monitor tests, 91 upload recovery tests, 23 sync tests,
  43 UI/access/projection tests and 1 presentation test passed: **193 tests**.
- Three established storage/seller-persistence regression scripts passed.
- Scoped lint and whitespace checks passed for the preventive source fix.
- Node-test files were initially passed to Vitest by mistake; rerun with Node's
  test runner passed. They are not counted as hosted verification.
- No full local build, live test upload, document approval, email, signing or
  production deployment was performed for this audit.

## Next controlled acceptance test

Use an explicitly approved synthetic record and harmless labelled PDF. Capture
source bytes/hash, the saved row and exact requirement IDs. Interrupt a response,
retry, reload both owning views, download and compare bytes, then check review,
handover and permitted/denied access. Retain original evidence throughout.
The available browser session is Samlin, so Kingdom-specific hosted tests require
a Kingdom-authorised session. Production test writes require explicit approval
under repository rules. Historical repairs need a separate exact, fingerprinted
repair packet and ownership confirmation; missing originals must not be invented.

## Authorised hosted QA attempt

The requester subsequently authorised the dummy-PDF upload/interruption/retry/
reload/download test. A Kingdom-authorised browser session was confirmed, and
transaction `deb06201-5b7e-4bc0-9a7c-785d700caf33` was independently confirmed
as demo data linked to `SYNTHETIC OTP QA 20261031 - DO NOT PUBLISH`.

Prepared `kingdom-qa-upload-check-20261115.pdf`, 1,872 bytes, SHA-256
`f4a84bd446cc845d52ecd222fdd7700cde9a908129f333895ded00a5f844daa6`.
The upload dialog selected Internal Working Documents, Internal only, Other,
and General upload (does not satisfy a requirement). The PDF was selected but
the upload submission was not performed. Browser controls failed while preparing
the tab-specific save interruption and subsequently disconnected entirely.

Independent production verification after disconnection found the original
2 QA documents unchanged, 0 matching test document rows and 0 matching Storage
objects. No upload, interruption recovery, reload or download acceptance is
claimed. Resume the already-authorised test when the browser connection is restored.
