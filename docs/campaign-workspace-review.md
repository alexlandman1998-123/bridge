# Arch9 Campaigns review — 25 October 2026

This change belongs to the primary `the-it-guy/` workspace and the shared email content-check/worker layer. The public websites and admin products were not changed. This is a local implementation and review bundle; no production deployment, hosted database change, paid model request, advert or actual email send was performed.

## Review the result

The offline review uses real application components with a synthetic Oak & Stone agency, sample property photographs, test contacts, a mocked AI response, and a browser-local draft adapter. It cannot access a connected account or send an email.

```sh
# Repository root. Uses existing installed esbuild; no package install.
node output/playwright/campaign-flagship-20261025/build.mjs --after
python3 -m http.server 4193 --bind 127.0.0.1 --directory output/playwright/campaign-flagship-20261025
```

Open <http://127.0.0.1:4193/?section=campaigns>. The synthetic-data banner remains visible. The fixture is review evidence, not a replacement backend. Browser-local storage demonstrates reopening UI content; authenticated persistence, conflicts, RLS and delivery are tested separately.

For the actual primary app, enable the new workspace at process/build time:

```sh
VITE_FEATURE_CAMPAIGN_WORKSPACE=true npm --prefix the-it-guy run dev
```

Open `/marketing?section=campaigns`. The flag defaults off. It governs the new home, recipes/opportunities/readiness entry points and the new AI Studio. With it off, existing Campaigns and the preserved legacy assistant remain available. Source freshness and save reliability protections apply independently of the visual flag.

## What changed

- **A more useful starting point.** Campaigns now starts with new-listing, price-reduction and show-day email recipes, latest plan or Email draft, and a small evidence-backed property opportunity collection. The existing work queue appears before the campaign list. The full Studio/template library remains available. Unavailable metrics and disconnected-spend cards no longer dominate the new home.
- **A coherent property email studio.** Focused source/brief controls sit beside the canonical email preview on desktop. Phones switch between editing and preview without losing copy. The preview uses the delivery renderer, genuine supplied property photography, factual property details, brand header and protected footer; a readable-copy view accompanies it. The ordinary visual/manual editor remains the final editable document.
- **Precise assistance.** Select a subject, preview, heading, introduction or CTA for revision. Other fields stay byte-for-byte intact. Substantial changes and full Afrikaans translation are proposals with apply/discard and undo. Newer manual edits invalidate an old undo/result. Cancellation stops waiting and never promises that an already accepted provider request is free.
- **Real recipe context.** Listing/objective/saved-event IDs survive navigation and draft creation. Saved public show-day times are loaded in SAST, checked by the server and retained for later freshness checks. Price reductions require explicit confirmation of the previous price; that amount is not manufactured from campaign history.
- **Concrete readiness.** Property campaign detail can reload its saved revision and authorised sources. Checks distinguish ready, blocked, review and unchecked, with separate listing/event check times. This is preparation readiness; channel recipient, sender, content, cost and launch approval checks remain authoritative.
- **Freshness before delivery.** AI property drafts retain a versioned source snapshot. Review/content checks and every recipient dispatch recheck current listing availability/asking price. Saved show days also require the same agency/property, public status, unchanged date/time and a future start. Changed sources stop remaining work; temporary read failures leave recipients queued. Prior provider acceptance and engagement evidence are preserved.
- **Safer persistence.** Existing drafts use `updated_at` as an atomic update predicate. Conflicts preserve unsaved edits and ask for reload. First saves use stable client IDs; a retry only recovers an exact same-intent draft belonging to the same actor and agency. Restoring a historical version retains the current concurrency base.
- **Truthful opportunity rules.** Recent listing records, lower current prices than the latest saved campaign and public upcoming events generate suggestions. Evidence and time windows are visible; records do not imply portal analytics, verified historical prices or predictive buyer intent. Dismissal is scoped to agency and person on this browser. Draft/scheduled Email associations suppress duplicate suggestions using saved listing/objective/event IDs, never names.

## Design decision

I compared the existing catalogue-led composition (large statistics, disconnected operational cards and sample template grid) with an opportunity-led working surface. The latter gives a returning agent an immediate task and a route into the existing composer. A quiet neutral/sage foundation leaves genuine property imagery and agency identity prominent. The original composition remains behind the flag-off path.

The first browser pass exposed a phone preview switch that retained an unhelpful old scroll position, and a reopened draft that required sender setup before editing content. Both were corrected. Manual drafting can proceed before sender setup; final Review still requires a verified sender. Step labels use actual readiness rather than falsely marking skipped setup complete.

## Walkthrough

1. Open Campaigns and choose a property recipe or a suggested property. Review the explanation behind a suggestion.
2. Choose the saved listing, objective and language; confirm prior price or show-day times where required. Select a marketing permission category in the assistant.
3. Preview eligible buyers from saved requirements, or preview the normal editor's current audience. Unknown requirements do not become matches. Zero matches do not select all contacts.
4. Generate once, edit copy, and request a change to one selected field. Review and apply/discard the proposal. Inspect desktop/mobile email and readable copy.
5. Use the email in the draft. Continue in the existing visual editor; save, leave and reopen it. Final sender/audience/image checks remain visible.
6. Review the actual recipients, exclusions, timing and delivery quote through the existing channel workflow. No send is inferred from drafting, copying, downloading or opening a destination.

## Audit: what is real and what still depends on activation

| Capability | Evidence/status |
| --- | --- |
| Campaign plans/templates/playbooks, content packs, CRM audiences/enquiries | Existing substantial local implementation reused; their hosted schema/release state was not asserted |
| New home, recipes, assistant proposals and mobile preview | Implemented and browser-checked with synthetic data |
| Authenticated model routing, bounded structured output, agency usage reservation/replay | Existing adapter hardened; API/provider tests use mocked boundaries |
| Draft conflict protection and first-save recovery | Actual service logic tested with competing sessions and uncertain insert outcomes |
| Source freshness and delivery recovery | Actual shared helper and worker exercised with mocked Supabase/Resend; no inbox delivery claim |
| Authorisation | Existing user RLS and scoped services retained; tests exercise modified IDs, role/agency scopes and stale actors; hosted acceptance still required |
| Meta/social | Existing content/brief/export capabilities retained; no new advertising API execution, spend or provider approval claimed |
| ChatGPT/Meta sign-in | Does not establish Arch9 runtime provider credentials, API entitlement, agency budget or publishing permissions |
| Predictive intelligence | Existing simulated/heuristic modules left unchanged; no invented valuation, intent or ROI claims |

## Verification evidence

- Combined focused Vitest run: **319 tests passed across 19 files**. Covers original campaign/composer/navigation regression, new AI Studio/launchpad, opportunities/readiness, renderer, source checks, worker recovery, save identity and campaign models.
- Serial Node run: **33 tests passed**, including API/provider and actual isolated AI migration/RLS checks.
- The combined run includes the 13-test AI Studio group: reopening renders the actual saved document and later manual wording without a generation call.
- Additional builder regressions verify the UI carries the latest saved timestamp, keeps one first-save identity, preserves in-flight edits and allows drafting before sender setup while blocking launch. See the final follow-up test log for the current count.
- Scoped lint: zero errors; pre-existing warnings in EmailCampaigns and the unused AudienceStudio prop remain. New services/tests also passed their scoped lint checks.
- Existing email landing check: see the final landing-check log.
- Extra broad pack-service regression: 23/24 passed. The unchanged Meta-brief fixture lacks its required saved Meta-compatible objective and fails before the changed save path. It was not relaxed to hide that prerequisite.
- Browser: 1440px desktop, 768px tablet, 390px and 360px phone checks; no page-level horizontal overflow in the exercised views. Verified recipe navigation, audience preview, single-field proposal, retained manual subject, desktop/mobile switching, canonical image/text preview, save/reopen and manual editing. Test provider and browser-local storage only.
- Full production build / `check:app` not run on this limited-memory machine. The feature-specific bundle compiles; that is not a full-app production build claim. Actual email clients, software-keyboard/safe-area behavior, provider entitlement and hosted acceptance still need their respective environments.

Logs and before/after captures live in `output/campaign-flagship-20261025/` and `output/playwright/campaign-flagship-20261025/`. The Playwright CLI package lookup was unavailable through the sandbox network; browser checks used the desktop browser automation API.

## Release dependencies and limits

The final targeted total is **352 passing tests** (319 Vitest + 33 Node). No new migration was introduced. Existing AI/audience/email/campaign migrations must be present, including `20261025190213_ai_campaign_assistant.sql` and their prerequisites. Do not blindly apply the working tree's other pending migrations.

Existing server variables include `ANTHROPIC_API_KEY`, server Supabase URL/public key and `SUPABASE_SERVICE_ROLE_KEY`. Delivery uses the existing `RESEND_API_KEY` and worker authentication configuration. No secret is passed to the frontend. Enable the configured runtime model only after confirming account entitlement/rates and provision an explicit agency `ai_campaign_budgets` row; there is no automatic paid allowance or fallback payer. Existing migration/configuration details remain in `docs/ai-campaign-assistant.md`.

A live release needs the existing target identity/recovery guard, exact reviewed migration scope if any, app/API and affected Edge worker/content-check releases, a suitable-environment build, and an explicitly approved internal-recipient test. Production changes and real customer sends were outside this session.

Known limits:

1. Ordinary manual/imported HTML and older property-pack handoffs without authoritative AI listing provenance retain their existing freshness behavior. New AI drafts and their later manual edits retain the snapshot. Do not claim source-aware dispatch for every legacy email.
2. One old property-pack database trigger uses `upcoming/open` while the real public-event schema uses `planning/upcoming`. Readers and the new AI Email path now use real statuses. Correcting the old trigger requires a reviewed additive migration; existing migrations were not edited.
3. Legacy property packs cannot distinguish a deliberate campaign-only contact override from a public contact later removed. Readiness asks for review and preserves intentional manual fallback. Proven nonempty email/phone changes are rejected; adding explicit override provenance is the next correction.
4. External image retention cannot be guaranteed. Permanent approved campaign images and a reachable public property/lead destination remain sending prerequisites. Signed/private/invalid image URLs remain subject to existing validation.
5. Semantic claims still need human review. Schema validation and source snapshots do not prove every adjective or a financial outcome. Opens/clicks are not treated as proof of buyer intent.

## AI beyond Campaigns: recommended next implementation order

These are repository-backed next steps, not features claimed complete by this session:

| Next capability | Existing foundation | Small useful first release |
| --- | --- | --- |
| CRM follow-up assistant | Scoped CRM lead workspace, communication timeline, tasks, saved requirements | Source-linked contact brief plus editable follow-up message/task proposal |
| Inbox reply assistant | Mailbox permissions, persisted threads, drafts, reply identity/signatures, idempotent outbox | Summarise one permitted thread and draft a reply; use existing reviewed send |
| Listing launch coach | Deterministic publication readiness and genuine listing media | Explain exact missing facts, improve approved copy and flag stale related drafts |
| Transaction explainer | Role-aware versioned journey snapshots and blockers | Draft a plain-language status update tied to the saved milestone evidence |
| Document concierge | Canonical role-projected requirements/status catalogue | Explain missing requirements from metadata without sending identity/banking files to a model |

The durable product advantage is the property → campaign → consented response → CRM action → transaction evidence loop. Complete attribution and downstream acceptance before building predictive optimisation. Reuse the bounded provider, identity/permission checks, request/revision envelopes and explicit usage accounting; the current paid ledger is campaign-specific and must not be silently repurposed for other features.

## Review and rollback bundle

This active working tree contained extensive unrelated tracked and untracked work at the start. No unrelated change was reverted, staged, committed or deleted. Instead of moving that work into an isolated checkout, exact pre-edit copies were saved under `output/campaign-flagship-20261025/before/`. `changes.patch` contains only this session's changes relative to those starting copies, and `change-manifest.json` records before/after hashes and new paths.

Turn off `VITE_FEATURE_CAMPAIGN_WORKSPACE` to return to the prior Campaigns/assistant presentation. That does not disable freshness or save protections. Restore only the specific reviewed file from its before-copy if rolling back code; never reset the whole working tree. Retain existing saved drafts, usage and delivery records. No dependency installation, billing change or schema rollback is required for this change set.
