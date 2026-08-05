# Admin Portal Phase 2 Data Contract

Date: 2026-08-05

## Purpose

The rebuilt admin portal should not calculate operating truth in React. The frontend should call a small set of Supabase RPCs that return dashboard-ready JSON.

Read this together with `docs/admin-portal-phase1-operating-metrics.md`, which defines the business meaning of each metric.

This phase introduces the first contract:

- `public.arch9_admin_dashboard_snapshot(p_range_start timestamptz, p_range_end timestamptz)`
- `public.arch9_admin_support_snapshot(p_range_start timestamptz, p_range_end timestamptz)`

Both functions return `jsonb` and are granted to `authenticated`.

## Access Boundary

The RPCs are intended for Arch9 internal/admin users only. Access is checked from Supabase JWT metadata tokens:

- `executive`
- `executive_level`
- `founder`
- `super_admin`
- `platform_admin`
- `internal_admin`
- `developer`
- `hq_staff`
- `admin`
- `customer_support`
- `customer_support_level`
- `support_agent`

The functions run as `security invoker`, so table RLS still applies.

## Dashboard Snapshot

`arch9_admin_dashboard_snapshot` returns:

```json
{
  "generatedAt": "2026-08-05T00:00:00Z",
  "range": {
    "start": "2026-08-01T00:00:00Z",
    "end": "2026-08-05T00:00:00Z"
  },
  "kpis": {
    "activeOrganisations": 0,
    "activeAgents": 0,
    "activeListings": 0,
    "pipelineRevenue": 0,
    "registeredRevenueThisMonth": 0,
    "sellerSignedBuyerSigned": 0,
    "registeredThisMonth": 0,
    "stalledTransactions": 0
  },
  "revenue": {
    "pipeline": {
      "label": "Seller and buyer signed, not registered",
      "count": 0,
      "amount": 0
    },
    "registeredThisMonth": {
      "count": 0,
      "amount": 0
    }
  },
  "drilldowns": {
    "activeOrganisations": [
      {
        "id": "organisation-id",
        "name": "Agency Name",
        "tradingName": "Agency Trading Name",
        "status": "active",
        "ownerId": "user-id",
        "createdAt": "2026-08-05T00:00:00Z",
        "updatedAt": "2026-08-05T00:00:00Z"
      }
    ],
    "activeAgents": [
      {
        "id": "user-id",
        "name": "Agent Name",
        "email": "agent@example.com",
        "phone": "",
        "role": "agent",
        "status": "active",
        "organisationId": "organisation-id",
        "createdAt": "2026-08-05T00:00:00Z",
        "updatedAt": "2026-08-05T00:00:00Z"
      }
    ],
    "activeListings": [
      {
        "id": "listing-id",
        "reference": "LST-001",
        "title": "Listing Title",
        "location": "Cape Town",
        "address": "",
        "status": "active",
        "organisationId": "organisation-id",
        "agentId": "user-id",
        "price": 0,
        "createdAt": "2026-08-05T00:00:00Z",
        "updatedAt": "2026-08-05T00:00:00Z"
      }
    ]
  },
  "pipeline": [
    {
      "id": "transaction-id",
      "reference": "TX-001",
      "organisationId": "organisation-id",
      "agentId": "agent-id",
      "buyer": "Buyer Name",
      "seller": "Seller Name",
      "stage": "otp_signed",
      "revenue": 0,
      "revenueMissing": true,
      "lastActivityAt": "2026-08-05T00:00:00Z"
    }
  ],
  "registered": [
    {
      "id": "transaction-id",
      "reference": "TX-001",
      "organisationId": "organisation-id",
      "agentId": "agent-id",
      "buyer": "Buyer Name",
      "seller": "Seller Name",
      "registeredAt": "2026-08-05T00:00:00Z",
      "revenue": 0,
      "revenueMissing": true
    }
  ],
  "attention": [],
  "warnings": [
    {
      "type": "missing_revenue",
      "context": "pipeline",
      "id": "transaction-id",
      "reference": "TX-001",
      "message": "Signed pipeline transaction has no Arch9 operating revenue field."
    }
  ]
}
```

## Support Snapshot

`arch9_admin_support_snapshot` returns:

```json
{
  "generatedAt": "2026-08-05T00:00:00Z",
  "range": {
    "start": "2026-08-01T00:00:00Z",
    "end": "2026-08-05T00:00:00Z"
  },
  "summary": {
    "openTickets": 0,
    "urgentTickets": 0,
    "missingRevenueItems": 0,
    "stalledTransactions": 0,
    "totalItems": 0
  },
  "queue": [
    {
      "type": "missing_revenue",
      "priority": "high",
      "id": "transaction-id",
      "title": "TX-001",
      "organisationId": "organisation-id",
      "ownerId": "user-id",
      "status": "signed_pipeline_missing_revenue",
      "lastActivityAt": "2026-08-05T00:00:00Z",
      "suggestedAction": "Add the Arch9 operating revenue amount before this item is used in reporting."
    }
  ],
  "warnings": []
}
```

## Current Assumptions

- Active organisations are organisation rows whose status does not read as inactive, archived, deleted, suspended, or disabled.
- Active agents are profile/user rows with an agent-like role and an active-ish status.
- Active listings come from `private_listings` rows not marked sold, archived, withdrawn, deleted, inactive, or unpublished.
- Pipeline revenue means transactions where seller and buyer appear signed but registration has not occurred.
- Registered revenue this month means transaction-linked revenue on transactions registered inside the requested range.
- Phase 1 defines V1 revenue as Arch9 operating revenue.
- Revenue totals only read `arch9_revenue_amount`, `platform_fee_amount`, `platform_fee`, `transaction_fee`, `fee_amount`, or `revenue_amount`.
- Transactions without one of those fields return `revenueMissing: true` and a `missing_revenue` warning instead of silently using gross commission or generic amount fields.
- Support queue includes `missing_revenue` work items for seller/buyer signed pipeline transactions or registered transactions that have no Arch9 operating revenue field.
- Dashboard drilldowns return sampled active organisation, active agent, and active listing rows so KPI cards can be audited from the frontend.

## Open Decisions

- Confirm the canonical Arch9 revenue field for transactions.
- Confirm whether subscription revenue belongs on the main dashboard or a later finance drilldown.
- Confirm whether active agents should use login/activity signals, assigned-work signals, or both.
- Confirm whether active listings should include private, public, marketed, reserved, or only live portal listings.
- Confirm the correct seller-signed and buyer-signed canonical fields once the OTP/signing contract is final.
