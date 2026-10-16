# Arch9 production release — 15 October 2026

The requester approved releasing all local Arch9 source changes in this chat.
The release candidate starts from remote main `5841262e8c97d04ee1d42014f99e71b4cd7064c2`
and merges the active checkout's source changes. Existing remote fixes and source
exclusions are retained. Scratch, generated output, environment files and the
independent Only Realty checkout are excluded. The active working tree remains intact.

## Verified preflight

- Supabase target: Arch9 SaaS, `isdowlnollckzvltkasn`, ACTIVE_HEALTHY.
- Phase 0 target/migration guard passed; no duplicate local timestamps.
- Production recovery: RECOVERY_LOCKED, verified eight physical backups and a
  previously accepted isolated restore rehearsal. No production restore was run.
- Primary app: 352 landlord/Client/listing regressions passed, app checks/build passed.
- Merged candidate: 79 joined rental acceptance tests, 140 seller/rental/listing
  merge tests, 10 Node draft-review tests and production build passed.
- Candidate bundle, operational-script packaging and schema compatibility gates passed.
- Website and admin checks/builds passed. Edge Function checks: 23 passed.
- Changed-source scan found no excluded generated/environment paths or literal
  production service credentials.
- Pre-change database function definitions/ACLs captured privately outside Git;
  previous app deployment retained: `dpl_6L7vhStac5CHwftKmxgp4D1LCYo8`.

## Exact applied database scope

1. `20261015074830_rental_landlord_next_action_contact_step.sql`
2. `20261015083559_rental_landlord_profile_consistent_saving.sql`
3. `20261015100645_rental_landlord_shared_conditional_rules.sql`
4. `20261015103158_rental_landlord_selected_signatories.sql`

The linked dry run contains exactly those four migrations, with no seeds or roles.
The approved direct-production pilot override applies only to this reviewed push.
Apply the database scope before dependent application code. Preserve additive
schema and all historical documents on recovery; restore prior app/function
bundles if necessary and use a separately reviewed forward correction.

## Release state

The four migrations were applied to production and their history, capability
and function permissions were verified. All 34 synthetic draft/submission cases
matched the browser rules in read-only production queries. Security-advisor
finding counts were unchanged; existing findings were not represented as cleared.

Kingdom was promoted successfully to `dpl_By41V5CGpmN24MWtrk1DnTgeS4KX`, served
by `arch9-websites-staging` on its existing production custom domains. The live
valuation page returned Google suggestions for a city lookup; no lead was submitted.

The first main-app deployment exceeded its 130 KiB entry budget. Release-freshness
checks and optional join/client notices now load separately; the immediate
bootstrap-ready signal remains synchronous with mounting. Exact production public
configuration builds at 131,990 bytes gzip, within the unchanged 133,120-byte limit.
Bootstrap and stale-chunk recovery checks pass. No server environment values were
passed to public builds. Admin resolves the shared address input from its own
React/icon/utility dependencies and passes a clean, isolated install/build.

All four application promotions completed successfully. These first release
deployments were verified Ready on their production custom domains. A later
Git-triggered build can replace the app alias with the same feature source:

| Product | Production URL | Verified deployment |
| --- | --- | --- |
| Primary workspace/API (`bridge`) | https://app.arch9.co.za | `dpl_HCPcub7ey4zkyNtdPWzHcoGueE8V` |
| Operating Console (`bridge-admin`) | https://admin.arch9.co.za | `dpl_F5U3WWy5jRe85c2a5N74pFSAY24m` |
| Kingdom public website (`arch9-websites-staging`, existing production domain) | https://kingdomrealestate.co.za | `dpl_By41V5CGpmN24MWtrk1DnTgeS4KX` |
| Home Seekers standalone website (`home-seekers-website`) | https://homeseeker.co.za | `dpl_4fdAmWfmAcXe8Q5MFFnSCCNwBZ6X` |

The primary feature release source is `eaaea82416205cb0b2e4379f2c806907b00c45b1`.
The public login
screen rendered correctly without captured console errors. Home Seekers rendered
its current published home, and Kingdom's valuation form returned Google address
predictions. No public enquiry was submitted during verification.

Home Seekers address suggestions have a remaining provider configuration issue:
Google explicitly rejects requests from `https://homeseeker.co.za/` under the
existing browser key's referrer restrictions. Manual address capture remains
available. Add the Home Seekers production domains to the Google key's authorised
websites through the existing Google Cloud account; no credential restriction was
changed as part of this release. The same key returns suggestions on Kingdom.

The changed Edge Function source was already present on remote main. The deployed
function inventory and local checks were verified; unchanged workers were not
redeployed or invoked. No email, provider publication or genuine customer record
was sent or changed by the verification. Hosted authenticated saving, private
Storage transfers and agency canary flows still require named approved canary
records; automated local acceptance and read-only production rule checks do not
certify those live flows. Existing security-advisor findings remain unchanged.

GitHub main publication was verified at
`c225b864a4000ff1b9f85553553f6fa82291a9dd`. Its automatic Node 22 build exceeded
the entry budget by roughly 0.2 KiB and was not promoted; the working manual
production deployment remained live. A subsequent packaging correction loads the
existing legal extension provider separately, retaining its context scope,
access controls and draft protection. Its 10 existing checks, scoped lint,
bootstrap recovery and stale-chunk recovery pass. The existing budget is unchanged.

The release source and this record are retained on the attached
`codex/arch9-production-20261015` worktree for recovery. Later packaging and release
receipt commits are published through a normal fast-forward push. The original active
checkout is preserved without resetting its branch, index or unrelated files.

## Final post-release verification receipt

GitHub `main` was verified at `23aa53a1ac3d1ab6ad1d532876287a735e5a6a1b`.
Its production deployment `dpl_ZYJKZC98hcgXuf3LzZyUxP3SnZLp` is Ready and
serves https://app.arch9.co.za. The live HTML release marker matches that exact
commit; the sign-in screen finished loading without captured console errors.
Vercel's Node 22 build passed unchanged bundle, operational packaging and schema
checks: entry 129,805 bytes gzip, CSS 158,070 bytes, legacy API 329,422 bytes.
The optional legal provider's 10 checks, scoped lint and startup/stale-chunk recovery
checks passed. The local Node 22 build was terminated during asset generation;
the equivalent Vercel build is the completed build evidence for this correction.

The Git release worktree is clean. This receipt was appended to the active
workspace copy after live verification; application source is fully published.
Admin, Kingdom and Home Seekers retain the verified deployments listed above.
Hosted authenticated save/upload canaries and the Home Seekers Google referrer
configuration limitation remain as stated above.
