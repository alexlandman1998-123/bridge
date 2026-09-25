# Listing Marketing Phase 8 operational monitoring

Phase 8 adds per-listing operational health to the Marketing tab. It detects divergence and stalled work; it never republishes, withdraws, or repairs an external listing automatically.

## Health states

- **Healthy:** tracked channels match their latest Arch9 publication lifecycle and have no outstanding differences.
- **Watch:** the listing can remain operational, but a live reference or public link is missing, saved changes are unpublished, or portal confirmation is overdue by 24 hours.
- **Action required:** publication history is unavailable, a publication or withdrawal failed, a withdrawn listing is still live, a verified listing is inactive externally, or the latest channel update needs attention.
- **Not monitoring yet:** the listing has no channel reference or publication activity.

The panel monitors Property24, Private Property, the agency website, and the Arch9 public catalogue. “Refresh health” requests current status for connected channels and reloads their Arch9 activity. It does not change the desired listing status on an external portal. Existing status endpoints may record the observed portal status in Arch9 so drift remains visible after reload.

## Operator response

Treat **Action required** as a hold on further publication or withdrawal work for the affected listing. Refresh once, inspect the named channel, and use the existing retry or channel-management action. Do not republish blindly: first confirm whether Arch9 or the external portal reflects the intended state.

For withdrawal drift, stop additional listing changes until every previously live channel is confirmed inactive. For publication-history failure, restore monitoring before relying on a “Current” label. For overdue submissions, confirm the public portal status and save the exact public link.

No automated alert delivery, production activation, deployment, or external portal mutation is authorised by this phase.
