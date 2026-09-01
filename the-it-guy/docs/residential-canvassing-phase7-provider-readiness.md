# Residential Canvassing Phase 7 — Provider Readiness

Phase 7 keeps the shipped experience in mock mode while making the property-intelligence boundary ready for a server-side provider integration.

## Runtime modes

- `mock` is the default and uses fictional records, indicative prices and simulated orders.
- `api` calls an Arch9-controlled server endpoint. It is only enabled when `VITE_PROPERTY_DATA_PROVIDER_MODE=api` and `VITE_PROPERTY_DATA_API_BASE_URL` is configured.
- Unsupported or incomplete modes fail during startup instead of silently falling back to mock data.

The browser must never receive a vendor API key. Vendor authentication, billing reconciliation, request audit records, rate limits and provider-specific data mapping belong behind the Arch9 server endpoint.

## Server contract

The adapter expects JSON endpoints under the configured base URL:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/properties/search` | Search by address, area, erf and filters |
| `GET` | `/properties/bounds` | Return properties and parcel boundaries for a viewport |
| `GET` | `/properties/:propertyId` | Return a public property preview |
| `POST` | `/reports/price` | Price selected report products |
| `POST` | `/reports/orders` | Create a report order |
| `GET` | `/reports/orders?organisationId=…` | List workspace-scoped orders |
| `GET` | `/reports/orders/:orderId` | Return a completed report pack |

Requests use `credentials: include`, a 15-second timeout and the `X-Arch9-Property-Client: canvassing-v1` marker. The server must resolve the authenticated user and organisation independently; it must not trust client-supplied ownership or pricing data.

## Activation checklist

1. Implement and authenticate the Arch9 server endpoints.
2. Store vendor credentials only in server-side environment variables.
3. Map provider responses to the existing property provider contract.
4. Add rate limiting, immutable order audit entries and billing reconciliation.
5. Verify organisation isolation and report entitlements in staging.
6. Set API mode only after legal, privacy and commercial approval.

Connected mode shows its status in the UI and requires the agent to acknowledge that provider charges may apply before every report order. No live provider or billing capability is activated by this phase.
