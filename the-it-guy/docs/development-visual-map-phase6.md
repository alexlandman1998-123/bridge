# Development visual map — Phase 6 live operations

Phase 6 consolidates public data ownership and keeps availability current without introducing a second visualiser or data store.

## Single public-data owner

`PublicDevelopmentResponsiveRoute` now performs the public-development RPC once. The prepared development, marketing, media, inventory, branding, enquiry, and freshness data are passed into both responsive compositions.

The former independent desktop fetch has been removed. Desktop and mobile therefore cannot race, disagree, or double the public API traffic.

The route also mounts only the composition matching the active viewport. The previous CSS-only approach mounted hidden desktop and mobile explorers simultaneously; that duplicate runtime has been retired.

## Availability refresh

- A filtered Supabase realtime subscription listens to inventory changes for the active development.
- Bursts of changes are debounced into one canonical public RPC refresh.
- Visible pages perform a fallback refresh every 60 seconds.
- Returning to the tab triggers a refresh.
- Browser reconnection triggers an immediate refresh.
- When a background refresh fails, the last successful inventory remains visible instead of replacing the page with an error.
- Realtime channel failure degrades to timed refresh rather than creating a second data path.

## Buyer continuity

- Filters, hierarchy position, shortlist, comparison, and selected residence remain inside the mounted shared explorer while inventory refreshes.
- Removed inventory is reconciled out of shortlist, comparison, selection, and the shareable URL.
- Unit status and prices update in the map, list, drawer, shortlist, and comparison from the same refreshed inventory objects.
- A compact live, refreshing, delayed, or offline indicator explains data freshness without blocking interaction.

## Runtime ownership

Realtime events do not patch inventory independently. They only request a refresh from the existing public RPC, ensuring the server remains the single authority for public visibility and inventory projection.
