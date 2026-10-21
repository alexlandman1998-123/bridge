# Public database function access review — 21 October 2026

Target: Arch9 SaaS production (`isdowlnollckzvltkasn`). Owner: the shared Supabase layer and primary transaction workspace.

A public-schema function is not automatically an anonymous data endpoint. PostgreSQL EXECUTE permits entering the function; its identity, organisation, permission or portal credential checks still decide what it can return or change. Removing a grant indiscriminately can also break row-security policy evaluation and legitimate client links.

## Remaining access contracts

The [function inventory](public-database-functions.csv) records all 340 remaining anonymous-executable SECURITY DEFINER signatures, their return types, access-contract classifications, relevant guard dependencies and deployed-definition hashes. Classifications describe reviewed source contracts; a keyword or hash alone is not proof of safety.

| Contract | Count | Why access is retained and what limits it |
| --- | ---: | --- |
| Credential-scoped client, seller, offer, onboarding or invitation workflow | 111 | A recipient may not have an app login. A valid, scoped link/token/session is their authorization. Missing or wrong credentials must not disclose the underlying record. |
| Row-security policy dependency | 81 | PostgreSQL may evaluate these functions while enforcing table access. The helper returns caller-bound identity, scope or an authorization result; removing EXECUTE can make otherwise safe queries fail during policy planning. |
| Staff workflow guarded by authenticated identity and delegated membership/permission checks | 136 | The grant does not permit anonymous staff actions. These routines reject missing identity or return denied/empty results before protected work. Existing grants are retained for compatibility with callers and delegated checks; direct anonymous execution has no product requirement and may be narrowed further after dependency-specific regression coverage. |
| Non-personal utility or organisation classification/relationship result | 6 | These generate random tokens or derive organisation types/relationship eligibility. They do not return customer records or existing access tokens. |
| Published public information or bounded public enquiry/telemetry input | 4 | Public development pages, public attorney intake metadata, development telemetry and inbound lead submission intentionally serve visitors. Input acceptance does not authorize reading or overwriting existing contacts. |
| Caller request-header utility | 2 | These return input supplied by that caller and do not retrieve another caller's credentials. |

The six utility functions are `bridge_random_token`, `bridge_has_accepted_partner_relationship`, `bridge_partner_role_for_organisation`, `bridge_phase4_organization_type`, `bridge_phase4_can_connect` and `bridge_phase4_relationship_type`.

## Corrections released

Seven forward migrations on 21 October close anonymous client/offer-context access, avoid anonymous policy-planning timeouts, narrow privileged RPC grants, preserve scoped seller continuity, enforce remaining RPC scope checks, preserve existing contact identity during public duplicate lead submissions, and enforce closeout authority before event writes.

The final two migrations remove anonymous/PUBLIC EXECUTE from 32 additional staff routines while retaining authenticated and service-role execution. Closeout now checks login and organisation authority before recording any blocked-closeout event. Duplicate public enquiries keep their submitted payload for staff review without replacing an existing contact's authoritative identity.

A committed production legacy service-role key was replaced across 64 Edge Functions, both production server consumers, browser publishable configuration and scheduled callers before retirement. Both legacy API keys and the old HS256 signing key were disabled/revoked. The active ES256 login signer was retained. Retirement verification tested the leaked JWT both alone and paired with a new publishable key: REST rejected both with 401; Auth, Storage and a worker rejected it as well. Replacement worker and server requests succeeded.

Deployed Edge handlers no longer treat a decoded, unverified `service_role` JWT claim as proof of service authority. The shared runtime credential adapter preserves user JWT identity, requires exact known server credentials for service calls, and keeps retired-key compatibility disabled.

Native leaked-password protection is enabled. The exposed QA test-account password was also rotated to separate replacements in production and staging; old-password sign-in was rejected in both and refresh sessions were revoked. Replacements are stored in macOS Keychain under service `Arch9 QA test account`, with account names `<project-ref>:qa.attorney+canonical@arch9.co.za`. Local automated checks must supply the replacement through their existing `STAGING_INTERNAL_PASSWORD` input; historical environment backups remain stale and must not be reused. Tracked private environment files were removed from the source tree, ignore rules were strengthened, and the existing repository-health check now flags tracked private environment files. Historical copies cannot be made safe by deletion alone; the exposed credentials must remain revoked.

## Verification and limits

- Existing anonymous-boundary, policy-timeout, privileged-RPC and remaining-scope tests: 39 passed.
- Runtime API credential regression tests: 10 passed, including user-JWT preservation and Supabase's post-retirement reserved-key alias behavior.
- Closeout PostgreSQL fixture: 4 tests passed, including nonmember denial before event writes and retained member/server validation.
- Hosted rollback rehearsals and post-release checks covered duplicate contact identity preservation, closeout authorization and the changed grants.
- Fifteen live client/onboarding/offer/seller checks accepted valid credentials and rejected missing/wrong credentials.
- Anonymous exact-count checks across 508 tables found no request/server errors. Eight nonempty readable tables contained public lookup, workflow configuration, demo branding or consent wording data.
- A read-only, no-credentials SQL survey invoked all 340 remaining privileged signatures. Staff responses inspected by the review contained no customer records. Results: 233 returned; 54 permission denials; 26 application denials; 9 invalid-input denials; 11 write/lock attempts stopped by the read-only transaction; 4 missing-auth denials; 2 preexisting overloaded-signature ambiguities; 1 constraint error. The 11 stopped calls require source/guard review rather than being counted as successful payload tests.
- All 889 JavaScript assets in the current primary deployment and five admin JavaScript assets were scanned against the known private Supabase credentials: none were found. The intended publishable browser key was present. Environment/Git-path response bodies exposed no private configuration.
- The primary production offer-branding server route returned 200 with a valid link and 404 for a wrong token. Default and both dedicated replacement server keys passed worker health checks.

These checks provide evidence for the tested access boundaries, not an exhaustive proof of every argument combination, authenticated role or unrelated provider credential. Supabase still reports aggregate public/authenticated SECURITY DEFINER advisories; they are inventory warnings, and are not equivalent to verified data exposure. Public capability links remain authorization credentials and must be handled as secrets.

The websites project's default Vercel hostname has no published tenant mapping: its health endpoint returned 503 on both the preceding and replacement deployment. A complete tenant website journey was not verified. The Google Maps browser key's provider-side referrer/API restrictions were not verified. Historical migration drift and two preexisting overloaded RPC ambiguities remain separate follow-up work.

Production was rebuilt from the exact preceding live application sources. Merging repository `main` can automatically release different business changes because the primary and admin Vercel projects are Git-connected; source cleanup must be merged with that deployment behavior explicitly controlled.

## Repeating the focused local checks

From the repository root:

```sh
node --test scripts/api-credentials-security.test.mjs
cd the-it-guy
node --test --test-concurrency=1 server/tests/anonymousAccessBoundary.test.js server/tests/anonymousPolicyTimeouts.test.js server/tests/privilegedRpcAccess.test.js server/tests/remainingRpcScope.test.js server/tests/remainingPublicRpcAccess.test.js
```

Production verification uses credentials held in service configuration or the local secure credential store. Do not copy them into this document, test fixtures, screenshots, command arguments or logs. Do not restore the revoked legacy signing key as a rollback step; correct a missed caller using a replacement credential.


## Follow-up production remediation — 21 October 2026

The next exact migration (`20261021110538_restrict_lead_prospect_and_catalogue_access.sql`) restricts launch-event lead/referral reads to trusted platform staff, limits lead edits to executives, scopes partner prospects and events to their organisations/authorised transaction history, and restricts shared location-catalogue edits. Public write-only launch capture and public location reads remain available.

Partner invitation RPCs now bind lookup and reuse to the transaction organisation. The company uniqueness constraint is scoped per organisation so two organisations can invite the same firm without exposing or replacing each other's private contact details. Existing restrictive event policies are retained. Local PostgreSQL fixtures and a hosted rollback rehearsal verify denial, staff/member access, independent same-company invitations and normal partner reuse. Post-release hosted assertions passed and fixtures were rolled back.

Production dependencies were updated in isolated copies of each exact live deployment source: PDF.js 6.4.299, React Router 7.18.4, Sharp 0.35.5, the official SheetJS 0.20.3 tarball, Next.js 16.4.2, and affected transitive/build dependencies. Each production dependency audit returned zero advisories. Public website and admin cloud builds passed, as did the primary cloud build. The full local primary build exceeded host resources and was killed; full local lint was stopped under the same resource pressure. Those incomplete local checks are not reported as passing.

Document HTML previews are sandboxed without script execution, PDF calls disable eval optimization, and the primary/admin deployments add compatible browser response protections. The broad primary script policy remains report-only to preserve existing maps, signing and portal integrations; the internal admin console also enforces a framing restriction. A browser fixture rendered a PDF, round-tripped spreadsheet data and confirmed preview-script blocking. Eight existing PDF-preview component tests and the frontend invitation-service check passed. The security regression suite passed 61 tests; each website source passed 55 tests.

The release covers the primary app, admin, the websites production project and the production deployment of the project named arch9-websites-staging, which actually serves Kingdom's customer domains. Kingdom home, properties, blog, valuation and health returned 200 after promotion. Client/onboarding/offer/seller checks passed all 15 cases again, and the anonymous 508-table scan had no errors or new sensitive-data exposure. The minimum for new passwords is now 12 characters with leaked-password protection retained; existing passwords/sessions were not reset. GitHub vulnerability alerts and automatic dependency security updates are enabled. A focused security workflow is added to the source PR.

Remaining owner-dependent work includes MFA enrollment/enforcement and recovery flows, CAPTCHA provider configuration, storage-file backup/restore coverage and any paid point-in-time recovery choice. Google/provider-side key restrictions and historical exposure forensics remain unverified. A failed Vercel candidate was held off live domains and replaced by a tested build with the explicit monorepo/shared-source settings.
