# Domain API boundaries

Each directory is the future public boundary for one business capability. New application code may import from a domain's `api.js` only after that domain has been extracted from `src/lib/api.js`.

During Phase 2 these folders are intentionally empty of business logic. Phase 3 will move one low-risk domain at a time while `src/lib/api.js` continues to provide the compatibility exports used by existing screens.

Domain modules may depend on `src/lib/api/shared` and `src/core`, but must not depend on pages, components, or the legacy `src/lib/api.js` facade.
