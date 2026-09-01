# Public Websites — Phase 0 Foundation Contract

**Status:** ready for implementation review

**Scope:** neutral, property-first PropData website product
**Explicitly not a Kingdom or Bounce build:** this phase defines the reusable product those clients will later configure or extend.

## 1. Outcome and boundary

Phase 0 freezes the smallest safe product boundary for a multi-tenant public websites platform. It produces an implementation contract only. It does **not** add database objects, grant public database access, deploy a public site, move a domain, or change email/DNS configuration.

The first public website product will let an agency:

- show only its approved public property stock;
- present a branded, mobile-first property website;
- edit controlled marketing content and publish it through iSite;
- collect enquiries directly into the existing PropData CRM;
- review a site on a PropData preview domain before connecting a client-owned domain.

The product is intentionally an opinionated website system, not a general-purpose page builder.

### In scope for the first release

- One neutral property template (`property-standard-v1`).
- Hostname-to-site resolution for preview and later client domains.
- Agency branding, navigation, homepage and standard-page content.
- Property search, results, property details, agents and area pages.
- Controlled campaign landing pages.
- Property/general/valuation/campaign enquiry forms and WhatsApp click attribution.
- CRM lead creation, routing metadata and fallback notification handling.
- Draft, preview, publish and rollback-to-last-published content lifecycle.
- Responsive/mobile-first interface, SEO metadata, canonical URLs and sitemap.
- Domain connection instructions and verification status only; automated provisioning follows later.

### Not in scope for the first release

- A free-form drag-and-drop editor or arbitrary custom HTML/CSS/JavaScript.
- More than one standard property template.
- Vehicle inventory, finance or trade-in flows (Bounce is a later vertical module).
- Direct public reads of internal tables or browser-side privileged credentials.
- Domain registrar transfer, DNS nameserver transfer or DNS-zone management.
- Changing, deleting or otherwise managing MX, SPF, DKIM or DMARC email records.
- Billing, plan limits, internationalisation and region-specific legal packs.
- Third-party campaign/analytics integrations beyond preserving UTM/referrer attribution.

## 2. Product map

```text
Marketing
├── Listings
│   └── Existing listing editor; controls whether a listing is public
└── Website
    ├── Overview and preview URL
    ├── Brand
    ├── Home
    ├── Pages
    ├── Campaign pages
    ├── Featured listings and agents
    ├── Domains
    └── Publish history

Public website
├── Home
├── Buy / Rent search and results
├── Property detail
├── Agents
├── Areas
├── Standard pages (About, Contact, Valuation)
└── Campaign landing pages
```

The public site is a separate server-rendered application. It is a consumer of approved public projections from PropData; it does not become a second CRM or listing editor.

## 3. Existing-platform inventory

The first implementation must reuse the following established platform boundaries.

| Need | Existing source / capability | Phase 0 decision |
| --- | --- | --- |
| Tenant identity | `public.organisations` and membership model | A website belongs to exactly one organisation. Domain resolution must produce one active website before any public data is loaded. |
| Brand seed data | `public.organisation_branding` plus organisation website/contact fields | Reuse as defaults only. Website-specific presentation settings remain separate from email branding. |
| Listing source | `public.private_listings` | Remains the internal source of truth. It is never public-facing. |
| Publishable property data | `public.listing_publication_data` | Candidate source for the public property projection; only `Published` records may be eligible. |
| Property media | `public.listing_media` | Only approved media URLs and supported public media types are included in the projection. |
| CRM enquiry context | `public.leads` fields added by `202607010003_lead_enquiry_property_fields.sql` | Website leads must populate organisation, listing/property context and source reference. |
| Existing lead ingestion | lead-capture aliases, inbound lead processing and notification paths | Website form submission is a first-class CRM write, with email as a notification/fallback—not the system of record. |
| Marketing shell | `the-it-guy/src/pages/MarketingComingSoonPage.jsx` | The later Website workspace is mounted under Marketing without disturbing existing email, WhatsApp, Show Day or launch routes. |

### Data readiness constraints

Before Phase 1, the implementer must validate, with a non-production report, that a selected test organisation has:

- a stable organisation identifier and active members;
- at least one listing joined to `listing_publication_data` in `Published` status;
- title, property type, listing type, price and location suitable for display;
- at least one ordered display image; and
- an agent/assignment and permitted contact route for enquiry routing.

Incomplete listings are not silently published. They remain hidden and are reported to the organisation in the existing listing workflow.

## 4. Public-data contract

The public application receives a deliberately minimal read model. It must not receive contact records, seller details, internal notes, documents, workflow states, task history, internal pricing, raw payloads or any internal-only listing fields.

### `PublicSite`

```ts
type PublicSite = {
  id: string
  organisationId: string
  status: 'draft' | 'published' | 'suspended'
  templateKey: 'property-standard-v1'
  locale: string
  currency: string
  brand: {
    name: string
    logoUrl?: string
    primaryColor: string
    secondaryColor?: string
    phone?: string
    email?: string
    whatsappNumber?: string
    socialLinks?: Record<string, string>
  }
  seo: { siteTitle: string; defaultDescription?: string }
}
```

### `PublicProperty`

```ts
type PublicProperty = {
  id: string
  reference: string
  slug: string
  transactionType: 'sale' | 'rental'
  status: 'available' | 'under_offer' | 'sold' | 'let'
  title: string
  propertyType: string
  address: { suburb: string; city?: string; province?: string; displayAddress?: string }
  price?: number
  bedrooms?: number
  bathrooms?: number
  garages?: number
  parkingBays?: number
  floorSize?: number
  erfSize?: number
  description?: string
  features: string[]
  amenities: string[]
  media: Array<{ type: 'image' | 'floor_plan' | 'video' | 'virtual_tour'; url: string; caption?: string; order: number }>
  agent?: { id: string; name: string; photoUrl?: string; role?: string }
  updatedAt: string
}
```

Rules:

1. The property must belong to the resolved organisation.
2. The property must be explicitly eligible for website publication.
3. Public fields are allow-listed by the server-side projection; a new internal field never becomes public by default.
4. The public application retrieves data server-to-server. It does not expose a privileged Supabase key, and it does not query `private_listings` from a browser.
5. Caching is keyed by site and content version. A publication change invalidates only the affected site/property paths.

## 5. Website content model

The first editor exposes only structured blocks. A page has an ordered list of blocks; it does not execute arbitrary markup.

| Block | Use | Required editable fields |
| --- | --- | --- |
| Hero | Primary page message | heading, supporting text, image, CTA label/link |
| Rich text | About or editorial copy | heading, body, optional CTA |
| Property collection | Featured/recent/reduced stock | source rule, heading, max items |
| Agent collection | Team promotion | selected agents or organisation rule, heading |
| Area collection | Suburb/area discovery | selected areas, heading, image/copy |
| Image gallery | Brand/storytelling | image set, captions, heading |
| Testimonial | Social proof | quote, author, optional role/image |
| Benefits | Service proposition | heading and 3–6 icon/text items |
| FAQ | Repeated buyer/seller questions | question/answer pairs |
| Lead form | Website conversion | form purpose, routing target, confirmation copy |
| CTA | Directional action | heading, copy, label, destination |

The standard home page sequence is Hero → property search → featured properties → areas → agents → valuation CTA → testimonials. Each section can be hidden or reordered within safe layout rules.

### Standard and campaign pages

- Standard pages: Home, About, Contact and Valuation are enabled initially.
- Campaign page: an agency selects an approved campaign layout and supplies its editable block content.
- Every page has a slug, SEO title, description, social image, draft state, published revision and prior published revision.
- Publishing is all-or-nothing per site revision. A rollback restores the previous public revision without mutating listings or CRM records.

## 6. CRM enquiry contract

Every lead action is a secure server-side command. Form submission persists first; agent email/SMS/WhatsApp notification is secondary.

```ts
type WebsiteLeadSubmission = {
  siteId: string
  organisationId: string // resolved by server, never trusted from client input
  type: 'property_enquiry' | 'general_enquiry' | 'valuation_request' | 'campaign_enquiry'
  propertyId?: string
  campaignPageId?: string
  name: string
  email?: string
  phone?: string
  message?: string
  consent: { marketing?: boolean; privacyAccepted: boolean; capturedAt: string }
  attribution: {
    pageUrl: string
    referrer?: string
    utmSource?: string
    utmMedium?: string
    utmCampaign?: string
    utmContent?: string
    utmTerm?: string
  }
  idempotencyKey: string
}
```

The server validates hostname, site state, organisation, listing ownership, honeypot/rate-limit rules, consent, input sizes and idempotency before writing to CRM. It then routes to the configured agent/team and records the originating site, page, property and campaign.

WhatsApp and click-to-call are not form submissions. They create a tracked interaction event with the same site/property/campaign context; they must never claim to be a CRM lead unless a form or inbound-message integration creates one.

## 7. Mobile-first acceptance map

The template is designed at small width first. Desktop may enhance layout, not replace the mobile information hierarchy.

| Journey | Mobile acceptance condition |
| --- | --- |
| Search | Search fields and primary filter controls are reachable without horizontal scrolling. |
| Results | Cards render as one-column content with visible price, location, key facts and tap target. |
| Filtering | Filter drawer preserves selections, has a clear apply/reset action and remains usable with the on-screen keyboard. |
| Property | Gallery supports swipe/tap, key facts appear before long copy and enquiry/WhatsApp are always clear. |
| Lead form | Required fields are minimal, labels persist, appropriate mobile keyboard types are used and errors are announced. |
| Campaign | CTA is visible before excessive scrolling and all UTM/page context survives submission. |
| Navigation | Header/menu works with touch and keyboard; touch targets are at least 44 by 44 CSS pixels. |

The release target is to pass these journeys at 320px, 375px and 768px widths, plus a current iOS Safari and Android Chrome manual smoke test.

## 8. Domain and email-safety contract

The client owns and retains its domain and DNS provider. The platform connects a website; it does not take control of email.

Allowed later connection actions:

- Add/replace the A, ALIAS or CNAME records identified by the hosting provider for the website hostname.
- Add a temporary or provider-required TXT ownership-verification record.
- Set an explicit redirect between root and `www` once both website records are verified.

Forbidden actions:

- Nameserver changes.
- Domain transfer or registrar access requirement.
- Changes to MX, SPF, DKIM, DMARC, autodiscover, mail, mailhost or any email-related DNS record.
- Deleting a DNS zone or unreviewed records.

Before a live connection, support must record the existing website record values and provide a rollback procedure. The client first signs off on `agency.propdata.co.za` (or an equivalent preview domain); a `new.agency.example` subdomain may be used for an additional cautious test.

## 9. Phase 1 implementation work packages

1. **Public site host and resolver:** a server-rendered public app, preview hostname handling, site lookup and safe unknown-host response.
2. **Website schema and permissions:** expand-only migrations for site configuration, versions, pages, blocks and domains; RLS for organisation administrators; no public table grants.
3. **Public read model:** server-only allow-list query/RPC/view with property/media validity checks, tenant tests and cache invalidation strategy.
4. **Property template:** neutral visual system and mobile search/results/detail journey using demo data.
5. **Lead command:** server endpoint/Edge Function with anti-spam, idempotency, CRM routing, observability and fallback notification.
6. **iSite Website workspace:** draft editor and preview/publish shell mounted under Marketing, behind a feature flag.

## 10. Mandatory release gates

Phase 1 cannot progress to a real client configuration until all of the following are demonstrated using a non-client demo organisation:

- Host A only resolves and serves organisation A; Host B cannot read organisation A’s property or page data.
- Unpublished, archived, incomplete and cross-organisation listings cannot be retrieved from the public path.
- A property enquiry creates one CRM lead with accurate site, property, page and UTM attribution; repeated submission with the same idempotency key does not duplicate it.
- Agent notification failure does not lose the already-created CRM lead.
- Draft edits never appear publicly until published; rollback restores the prior revision.
- Search, filter, property gallery, form and WhatsApp CTA pass the mobile acceptance map.
- No service-role/secret key reaches a browser bundle, and RLS/advisor checks pass for new objects.
- Preview-domain, canonical-domain and domain rollback runbooks are tested without modifying any email DNS records.

## 11. Decisions deferred intentionally

- Exact page-builder UX and visual design beyond the `property-standard-v1` block catalogue.
- Exact Vercel project/domain automation implementation.
- Which organisation/agent fields are authoritative for public contact display.
- Legal copy, POPIA consent wording, cookie policy and retention policy by target market.
- Custom Kingdom theme requirements and all Bounce vehicle requirements.
- Multi-language, multi-currency and regional-data-residency design.

These decisions are deferred so the first build remains a safe, neutral website product rather than a Kingdom-specific or vehicle-specific fork.
