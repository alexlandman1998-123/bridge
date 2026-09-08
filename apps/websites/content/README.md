# Team-managed journal

Edit `articles.json` and release the websites app to publish changes. This catalogue is managed by the Arch9 team, not by agency users in Website Studio.

Each article has a unique lowercase URL `slug`, title, excerpt, category, ISO publication date, status (`draft` or `published`), audience, image and content sections. Sections contain plain-text headings, paragraphs and optional bullet points. HTML is not accepted or rendered.

- `audience: "shared"` explicitly makes a general guide available to every agency.
- For agency-specific articles, use `audience: "site"` and `siteIds: ["the-resolved-website-site-uuid"]`. Use website site IDs, not organisation IDs, client names or hostnames. Never mark private or agency-specific content as shared.
- Draft, future-dated and unassigned site articles are excluded from listing pages, direct article URLs and sitemaps. Drafts are source-controlled content, not an appropriate place for confidential material.
- Set status to `draft` and redeploy to unpublish a post.
- Use local images in `public/images`, with descriptive alt text. Review reuse rights before adding external imagery.

The initial three articles are general shared editorial guides. Existing client-managed About/Contact pages continue to use Website Studio.

## Calculators

Bond repayments assume a fixed nominal annual interest rate with monthly instalments. The initial 10% is explicitly illustrative. Affordability estimates use take-home income minus living costs, debt repayments and a user-selected savings buffer; they are not lending decisions. Deposit planning excludes savings interest. No calculator values are transmitted.

Run calculation checks with `node --experimental-strip-types --test apps/websites/lib/finance.test.mjs` from the repository root.

## Preapproval

`/preapproval` is a seven-stage individual/joint application: buying plans, applicants, employment, affordability, credit/assets, document readiness, and review/declarations. Details are held in React memory only. Each joint applicant completes their own declaration. No automatic approval or credit check occurs.

The structured payload goes to `/api/preapproval`, with shared client/server validation and bounded input. Sensitive application details never enter general lead notes. Document availability is captured; documents are collected separately through the originator’s secure process (this page does not upload files).

The prepared migration `20260908102139_website_preapproval_intake.sql` stores submissions separately, limits reads to the assigned originator, and uses the agency’s explicit active `partner_routing_rules` allocation for `bond_originator`. Only an unambiguous organisation-level direct-consultant allocation is supported. Queue, branch, round-robin, ambiguous or missing allocations fail closed and need integration with the canonical routing resolver before they can be enabled. Applicant-supplied recipient IDs are never accepted.

**Not activated:** the migration has been tested in an isolated PGlite database with representative dependency tables, not applied remotely. Wire `website_preapproval_applications` into the allocated originator’s authenticated inbox and secure document workflow, verify against the target database’s actual routing/RLS policies and run advisors, then explicitly set `WEBSITES_PREAPPROVAL_ENABLED=true`. The flag defaults off, and disabled submission preserves the form with an explanation. No notification or live inbox integration is claimed by this local preview.

Validation tests: `node --experimental-strip-types --test apps/websites/lib/preapproval.test.mjs`.

Database isolation tests: install `@electric-sql/pglite@0.3.14` into a temporary test directory, set `PGLITE_MODULE_PATH` to its `dist/index.js`, then run `node apps/websites/tests/preapproval-db.mjs`. The test uses only synthetic fixtures and never connects to a remote project.

## Deploying this app

Run Vercel from the website app/release directory and explicitly provide its `vercel.json` using `--local-config`. A repository-root Vercel config contains SPA rewrites that must not be applied to this Next.js app.
