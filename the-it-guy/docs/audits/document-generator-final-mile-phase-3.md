# Document Generator Final-Mile Phase 3

Date: 2026-07-26

## Objective

Repair final signed access resolution without weakening the final artifact fence.

## Implementation

Updated:

- `../supabase/functions/resolve-final-signed-document-access/index.ts`
- `src/core/documents/finalSignedArtifactAccess.js`

Changes:

- Added service-role workspace authorization for operational smoke/recovery checks.
- Added signer-context client wrapper support.
- Passed `signingToken` through the client access wrapper.

## Required Truth

The access resolver may mint a short-lived signed PDF URL only through `resolvePublishedFinalSignedArtifact`.

This phase does not relax the final artifact fence. The shared fence still requires:

- exact F2 artifact evidence
- exact final generated event
- exact published `documents` row
- shared/client-visible final signed document state
- storage signed URL creation from the verified bucket/path

## Not Included

This phase does not change workspace UI rendering. That remains Phase 4.
