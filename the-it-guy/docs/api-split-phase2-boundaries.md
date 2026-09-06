# API-split Phase 2: target boundaries

Phase 2 creates the domain and shared-infrastructure boundaries without moving a function from `src/lib/api.js`.

Run the guard before every extraction:

```sh
node scripts/api-split-phase2-boundaries.test.mjs
```

Rules enforced now:

- A domain may not import a page or component.
- A domain may not import the legacy `src/lib/api.js` facade.
- Shared API infrastructure may contain only cross-domain primitives.
- Existing callers continue to use `src/lib/api.js` until a domain’s Phase 3 extraction is complete.
