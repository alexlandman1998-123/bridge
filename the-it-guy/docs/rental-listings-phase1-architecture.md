# Rental Listings Phase 1 Architecture

## Objective

Build rental listings as a first-class residential listing mode that shares the sales listing architecture, UI patterns, lifecycle surfaces, and syndication readiness model. Rentals must not remain a small capture form or a sales checkbox.

## Current State

- Sales listings use the mature `AgentListings` and `AgentListingDetail` surfaces.
- Rental listings currently route to `/agent/rentals/listings`.
- The current rental page is a compact draft capture form in `src/pages/rentals/RentalListingsPage.jsx`.
- Rental drafts already persist through the private listing foundation using `listingCategory: rental`, `listingType: Rental`, and canonical `rentalInfo` facts.
- Rental applications and lease workflow models already exist as draft/activity-based foundations.
- Property24 sales publishing already has preview, blocker, publish, status, and sync services.

## Architecture Decision

Phase 1 keeps `private_listings` as the source of record so rental listings can reuse sales listing services, activity, media, publication data, and Property24 sync infrastructure.

Rental-specific data remains in structured canonical facts for now:

- `private_listings.listing_category = rental`
- `seller_canonical_facts.listingType = Rental`
- `seller_canonical_facts.rentalInfo = { monthlyRent, depositAmount, availableFrom, leasePeriodMonths, furnishedStatus, petsPolicy, utilitiesPolicy, inspectionStatus, mandateStatus, marketingApprovalStatus }`
- `listing_distribution_data.publication_data.listingType = Rental`

The next persistence step is a structured extension table:

- `rental_listing_details`
- linked to `private_listings.id`
- stores rental terms, landlord reference, inspection state, marketing approval, and Property24 rental readiness payload state.

Full rent collection, arrears, landlord payouts, and rental accounting stay out of scope.

## Shared Sales/Rentals Surfaces

| Surface | Sales | Rentals |
| --- | --- | --- |
| Index | `/listings` | `/agent/rentals/listings` |
| Create flow | Quick Add Listing | `/agent/rentals/listings/new` |
| Detail | `/agent/listings/:listingId` | `/agent/rentals/listings/:listingId` |
| Media | Listing media | Listing media |
| Mandate | Sale mandate | Rental mandate |
| Marketing | Marketing publication | Landlord-approved marketing publication |
| Syndication | Property24 sale | Property24 rental |
| Activity | Listing activity | Listing activity |

## Rental Listing Detail Tabs

The rental listing detail page should use the same visual shell and operating rhythm as sales listing detail:

- Overview
- Property
- Landlord
- Rental Terms
- Mandate
- Inspection
- Marketing
- Syndication
- Applications
- Activity

Route map:

- `/agent/rentals/listings`
- `/agent/rentals/listings/new`
- `/agent/rentals/listings/:listingId`
- `/agent/rentals/listings/:listingId/property`
- `/agent/rentals/listings/:listingId/landlord`
- `/agent/rentals/listings/:listingId/terms`
- `/agent/rentals/listings/:listingId/mandate`
- `/agent/rentals/listings/:listingId/inspection`
- `/agent/rentals/listings/:listingId/marketing`
- `/agent/rentals/listings/:listingId/syndication`
- `/agent/rentals/listings/:listingId/applications`
- `/agent/rentals/listings/:listingId/activity`

## Rental Index Fields

The index should visually match the sales listing list, with rental-specific facts:

- image
- title
- address
- monthly rent
- available from
- landlord
- assigned agent
- mandate status
- marketing approval status
- Property24 status
- application count
- next action

## Rental Field Groups

### Listing Identity

- title
- listing category
- listing type
- listing status
- listing visibility
- assigned agent
- branch

### Property

- address
- suburb
- city
- province
- property type
- bedrooms
- bathrooms
- parking bays
- description

### Landlord

- landlord name
- landlord email
- landlord phone
- landlord type
- future landlord client record

### Rental Terms

- monthly rent
- deposit amount
- available from
- lease period months
- furnished status
- pets policy
- utilities policy

### Rental Mandate

- mandate type
- mandate status
- mandate start date
- mandate end date
- management or placement fee terms

### Inspection

- inspection status
- inspection notes
- access notes
- repair notes
- keys status

### Marketing

- marketing approval status
- publication title
- publication description
- photos/media
- features
- external links

### Syndication

- Property24 status
- Property24 reference
- Property24 listing URL
- Property24 rental payload preview
- Property24 blockers

### Applications

- application count
- latest application status
- latest credit check status
- latest landlord approval status

### Activity

- internal notes
- activity timeline
- follow-up tasks

## Property24 Rental Readiness

Property24 rental publishing must be readiness-first. A rental listing should not publish until these are present:

- `listingType: Rental`
- `rentalInfo`
- agency ID
- contact agent IDs
- agent source reference
- suburb ID
- property type ID
- monthly rent
- availability date
- description
- photos
- pets allowed
- furnished status
- garages
- garden
- pool
- flatlet
- marketing approval status
- mandate status

Actual publishing remains gated until the rental payload is previewed and verified against Property24 Listing Service v53.

## Property24 Field Comparison Contract

Phase 1 adds a formal comparison between Arch9 rental fields and the Property24 Listing Service v53 payload.

The contract lives in:

- `src/services/rentals/rentalListingProperty24FieldComparisonModel.js`
- `scripts/rental-property24-field-comparison.test.mjs`

It answers, for each rental syndication field:

- where the value comes from in Arch9
- where it must land in Property24
- whether it is required, optional, or an internal Arch9 publish gate
- whether the value is mapped, defaulted, missing, or still needs a Property24 ID mapping
- whether the issue blocks backend publish wiring

Important outcomes:

- fake string IDs such as `p24-agent-1` are rejected because Property24 expects integer IDs
- monthly rent maps to `price`
- rental availability maps to `occupationDate`
- listing expiry still needs a real expiry or mandate end date
- pets map to `propertyFeatures.petsAllowed` using `Yes`, `No`, or `DontKnow`
- furnished status maps to `propertyFeatures.furnishedStatus` using `Yes`, `No`, or `Optional`
- deposit and lease period map into `rentalInfo`
- marketing approval and mandate status stay as Arch9 internal gates, not Property24 payload fields

## Property24 Rental Backend Adapter

Phase 2 adds a server-side rental adapter that converts a rental listing into the Property24 Listing Service v53 payload shape without calling Property24.

The adapter lives in:

- `server/services/property24RentalListingAdapter.js`
- `scripts/rental-property24-backend-adapter.test.mjs`

It keeps rental publishing separate from sale publishing while reusing the existing Property24 listing plan builder. The rental adapter adds the rental-only payload fields:

- `listingType: Rental`
- monthly rent into `price`
- availability into `occupationDate`
- deposit and lease period into `rentalInfo`
- `rentalInfo.rentalRate`, defaulting to `Month`
- rental pets and furnished values into the Property24 enum values

Safety rules:

- the adapter does not call the Property24 API
- the adapter does not write to the database
- the adapter does not mark a listing as published
- fake Property24 IDs are never copied into the payload
- missing real Property24 agent IDs remain a submit blocker in sandbox mode, but a safe preview can still be generated when the rest of the data is valid

## Property24 Rental Preview API

Phase 3 exposes the rental adapter through an internal Property24 API route:

- `POST /api/property24/rentals/:listingId/preview`

The route:

- uses the same Property24 API auth and signed-in browser auth pattern as sale listing preview
- loads the rental listing, publication data, media, and existing sync state
- resolves the agency and mapped agent where available
- runs the rental backend adapter
- returns a redacted preview payload and blocker summary
- does not call Property24
- does not write to the database
- does not publish the listing

Rental preview intentionally lets the adapter report missing `suburbId` and `propertyTypeId` as payload blockers instead of blocking the route before the listing is loaded. This lets the UI show a useful readiness checklist on the rental marketing/syndication tab.

## Phase 2 Entry Criteria

Phase 2 can start when the contract in `src/services/rentals/rentalListingArchitecture.js` remains green.

Build next:

- Replace the simple rental capture page with a sales-style rental listing index.
- Keep reading current `private_listings` rental drafts.
- Add status cards, filters, search, and a Create Rental Listing action.
- Do not build accounting or rent collection.
