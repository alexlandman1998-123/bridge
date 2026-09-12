# Arch9 repository guide

## Repository map

- `the-it-guy/` is the primary Arch9 transaction workspace: a Vite + Supabase application with its own `package.json`, API routes, services, and focused operational checks.
- `apps/websites/` is the separate public, multi-tenant property website: Next.js + TypeScript. Its deployment and build are independent of the primary app.
- `apps/admin/` is the separate Vite internal Operating Console.
- `supabase/` contains shared database migrations and Edge Functions. `scripts/` contains shared database, staging, and release utilities.
- Root `src/` and `package.json` support the root Vite application and platform-level commands.

Before making a change, identify the one product or shared layer that owns it. Do not make cross-product changes unless the task explicitly requires them.

## Working rules

- Preserve unrelated changes in this frequently active working tree. Do not revert, stage, commit, or delete unrelated work.
- Generated output is never source code. Do not edit or commit `node_modules/`, `.next/`, `dist/`, `.vercel/`, `.vite/`, `test-results/`, or `.env*` files.
- Keep a task small and outcome-focused. Inspect existing patterns and the nearest README before adding a new abstraction, script, or phase document.
- Prefer an existing focused check over creating another numbered `phase` command. Explain which check is relevant and run it after a change where practical.
- Do not claim a deployment, live data change, email delivery, or external integration was performed unless it was actually verified.

## Plain-English requests

The requester is not expected to know the codebase, file names, test names, or technical implementation. Treat their description of the desired user outcome as the primary requirement.

- Translate a plain-English request into: the owning product, the user-facing outcome, constraints, and a focused definition of done.
- For a small, clear request, make reasonable low-risk assumptions and state them briefly. Do not make the requester provide technical details.
- If a product choice or workflow decision would materially change the result, first explain the options in plain English and ask one concise question before implementing.
- For a broad or fuzzy idea, first propose the smallest useful version, name what is deliberately out of scope, and obtain agreement before writing code.
- Use [CODEX_REQUESTS.md](CODEX_REQUESTS.md) as the shared request format. Never require the requester to fill every field; it is a prompt aid, not a form.
- Report results without jargon: what a user can now do, what was checked, and anything still requiring a human decision.

## Commands

Run commands from the package that owns the change, or use `npm --prefix <path> run <script>` from the repository root.

| Area | Develop | Normal verification |
| --- | --- | --- |
| Primary workspace (`the-it-guy/`) | `npm --prefix the-it-guy run dev` | Run the narrow relevant `test:*` script. Use `npm run check:app` before handing over a broad app change. |
| Public websites (`apps/websites/`) | `npm --prefix apps/websites run dev` | Use `npm run check:website` for meaningful website changes. |
| Admin console (`apps/admin/`) | `npm --prefix apps/admin run dev` | Use `npm run check:admin`. |
| Root Vite app | `npm run dev` | `npm run build` |

### Verification menu

- `npm run check:quick` runs the primary app's established fast baseline. It is a starting point, not a replacement for the focused check that covers the change.
- `npm run check:app`, `npm run check:website`, and `npm run check:admin` run the respective build-ready verification suite.
- `npm run check:staging` is a read-only environment safety audit; it can fail when the local staging evidence is absent or unsafe.
- `npm run check:release` combines the app, website, admin, and read-only staging checks. It does not deploy or modify remote data.
- `npm run report:repository-health` is a read-only repository hygiene report. It checks tracked generated files, unusually large source changes, stale npm script targets, and the fast baseline. Add `-- --skip-quick-check` when only inspecting repository metadata.

Do not run a broad release suite by default. Use its narrowest component check for ordinary work. Run staging or production checks only when the task explicitly concerns that environment.

## Supabase and production safety

- Treat `supabase/migrations/` as append-only. Never edit or rename an existing migration; create a new migration when a schema correction is necessary.
- Never run a command that applies migrations, writes remote data, sends email, publishes listings, or promotes a deployment without the user's explicit approval in the current task.
- Before any requested database push, run the applicable guard first (`npm run supabase:guard`) and clearly name the target environment.
- Keep service-role credentials server-side only. Never expose secrets in frontend code, committed files, logs, or responses.

## Definition of done

For each change, report:

1. What changed and which product owns it.
2. The focused checks run and their result.
3. Any remaining risk, manual verification, or explicit approval still required.
