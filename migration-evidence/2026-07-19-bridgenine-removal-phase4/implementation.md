# Bridgenine domain removal — Phase 4 deployment evidence

Executed: 2026-07-19 (Africa/Johannesburg)

## Outcome

Phase 4 deployed the Phase 2 application/configuration cleanup and the Phase 3 data migration compatibility changes to the production `bridge` and `bridge-admin` Vercel projects. Both production deployments reached `Ready`, the Arch9 custom domains resolve to the new artifacts, and the retained Bridgenine aliases remain attached for the later domain-detachment phase.

## Rollback baselines

| Surface | Pre-Phase-4 deployment | Previous production URL |
| --- | --- | --- |
| Main app | `dpl_AW3iGrrBdov2YHXDBrCQazmTxb2p` | `bridge-e5ihq3s3h-alexs-projects-f5496a21.vercel.app` |
| Admin app | `dpl_HSmkLBDrxV12h5Gw9Jx4M2RivdaN` | `bridge-admin-9c30xz8wm-alexs-projects-f5496a21.vercel.app` |

## Production deployments

| Surface | Project | Deployment | Production URL | Status |
| --- | --- | --- | --- | --- |
| Main app | `bridge` / `prj_rbfXykMU6mU1eECbc0lJS9sPspmp` | `dpl_DNkxVsy5LT66nwZTG2Zm6KDHPEzQ` | `bridge-qlk3e371d-alexs-projects-f5496a21.vercel.app` | Ready |
| Admin app | `bridge-admin` / `prj_UBUboNzbfFH5vNfaWgKE6heEgrK7` | `dpl_2y6e3rtyQzvhUnYfsqySuCENqw9v` | `bridge-admin-4stbkn7qj-alexs-projects-f5496a21.vercel.app` | Ready |

The releases were built as previews, checked through Vercel's authenticated preview access, promoted, and then inspected by their exact production deployment IDs until both reported `Ready`.

## Production verification

- `https://app.arch9.co.za/`, `/auth`, and `/buy`: HTTP 200.
- `https://admin.arch9.co.za/` and `/login`: HTTP 200.
- `https://app.arch9.co.za/api/public/listings`: HTTP 200 with the expected `count`, `generatedAt`, `items`, `limit`, and `offset` response contract.
- Main login UI rendered as `Arch9 | Platform`; admin login UI rendered as `Arch9 | Command`.
- A one-time, non-email Supabase magic link for the existing canonical QA attorney account completed the live `/auth/callback` flow and reached `/attorney/dashboard`.
- The authenticated QA surface contained no links to `bridgenine.co.za`; the temporary QA session was logged out after verification.
- Transaction-partner invitation unit and organisation-connection tests passed.
- The fallback transaction invitation URL resolved to `https://app.arch9.co.za/transaction-invite/phase4-smoke`.
- The deployed main and admin JavaScript bundles each contained zero `bridgenine.co.za` occurrences.
- Browser console verification was clean on unauthenticated main/admin surfaces. The authenticated attorney fixture emitted one non-blocking warning about a saved workspace selection that is not present in its active memberships; no browser errors occurred.
- Vercel reported no grouped runtime errors for the main project in the post-deploy window. The admin application is static; its Vercel runtime-error connector returned 403, while its deployment, HTTP, and browser-console checks passed.

## Credential fixture note

The saved password and browser-session fixtures are stale and no longer authenticate. This did not block the production auth check: the canonical QA account was verified through a one-time admin-generated magic link, exercising the actual Arch9 callback and authenticated workspace routing without sending email or creating application records.

## Phase boundary

The Bridgenine domains intentionally still return HTTP 200 because their Vercel aliases have not yet been detached:

- `https://app.bridgenine.co.za/`
- `https://admin.bridgenine.co.za/`

Domain detachment, DNS removal, and post-detachment monitoring belong to the next phase. The old production deployment IDs above remain the immediate application rollback points.

## Exit decision

Phase 4 deployment and Arch9 smoke testing: complete.  
Ready for the controlled domain-detachment phase: yes.
