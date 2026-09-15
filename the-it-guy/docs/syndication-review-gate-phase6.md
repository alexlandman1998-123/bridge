# Syndication Review Gate: Phase 6

Phase 6 introduces a controlled, per-organisation rollout gate for the channel review created in Phase 5.

- Organisations not opted into the Phase 1 rollout retain the existing Private Property and Property24 publish flow.
- For an opted-in organisation, the first direct publish opens the channel review instead of sending a portal request immediately.
- The agent must run the appropriate channel readiness check and can only acknowledge a channel that is data-ready.
- An acknowledgement is invalidated after listing edits, so the next publish requires a fresh review.
- The server-side portal preview and publish checks remain authoritative; this client-side gate improves the workflow without replacing them.

The gate has no portal credentials and performs no portal writes itself.
