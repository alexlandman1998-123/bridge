# Development visual map — Phase 4 buyer decisions

Phase 4 turns exploration into a practical buyer decision and enquiry workflow without adding another visualiser or persistence service.

## Delivered

- Buyers can shortlist residences from cards or the residence drawer.
- Shortlists persist locally for the development and remain visible in a compact decision tray.
- Up to three residences can be compared side by side across price, type, bedrooms, bathrooms, size, parking, floor, phase, and availability.
- Shortlist and comparison selections are encoded in the existing shareable URL.
- Native device sharing is used when available, with clipboard sharing as the desktop fallback.
- Opening a shared link reconstructs only valid inventory selections; missing or retired unit IDs are discarded.
- Enquiry actions retain the selected residence context in the existing session hand-off.
- First-party `arch9:development-visualiser` browser events expose shortlist, comparison, and sharing interactions to the existing analytics layer without adding a tracker SDK.

## Runtime ownership

All buyer tools live in `PublicDevelopmentVisualExplorer`. Local storage is a convenience cache, while the URL is the portable share state. No database table, duplicate public renderer, or separate shortlist application was introduced.
