# Rentals CRM phase 20 — controlled external ingestion

Phase 20 strengthens the existing preview-before-create CSV ingestion flow as the controlled external-lead boundary.

Supported sources are manual, manual import, Website, Property24, Private Property, WhatsApp, referral, and API. Imports normalise the source, carry the three consent fields, retain the existing duplicate and validation preview, and stamp each created lead with an import method, batch ID, source, timestamp, and importing user. The import audit context is recorded in the lead metadata and creation activity.

No live portal credential, polling job, or external API endpoint is enabled by this phase. The normalized source and audit envelope are the adapter contract for a future authenticated integration.
