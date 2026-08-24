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
| Create flow | Quick Add Listing | Create Rental Listing |
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

## Phase 2 Entry Criteria

Phase 2 can start when the contract in `src/services/rentals/rentalListingArchitecture.js` remains green.

Build next:

- Replace the simple rental capture page with a sales-style rental listing index.
- Keep reading current `private_listings` rental drafts.
- Add status cards, filters, search, and a Create Rental Listing action.
- Do not build accounting or rent collection.
