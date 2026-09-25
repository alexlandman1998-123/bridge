# Listing feature parity matrix — sales direct listing

## Additional local mapping checkpoint — 24 September 2026

The agent catalogue now captures the remaining directly named v55 kitchen equipment flags (dishwasher, cleaning service, sink and coffee machine), outbuildings area in m², single/double/triple parking choices, and the number of outside areas. The Property24 mapper emits those in `propertyFeatures.kitchens`, `outBuildingsSize`, `parking`, and `outsideArea` respectively. It also emits the selected Tile, Slate or Thatch roof tag and feature-type entries for Family/TV Room, Kitchen and Entrance Hall. The Review channels display names these structured payload targets; `roof_type=Other` remains description-only. Local mapper/preflight contracts exercise every declared native fact path, but **native payload output is not portal acceptance or visible feature parity**.

The supplied disposable listing `de953aba-9901-48c6-aa31-c24671e50c4e` has not been created or updated on either portal. The connected browser reached Arch9 sign-in, and the user noted that Property24 ExDev and Private Property sandbox may no longer be active. No production channel may be substituted for a test channel without a separate, explicit decision. Current Private Property feed-spec currency and portal display remain unverified.

## Phase 3 implementation checkpoint — 24 September 2026

The direct-listing catalogue and Property24 v55 mapper now cover additional typed facts that were missing from the Phase 1 reverse audit: kitchen, reception, domestic-room/bathroom and outside-toilet counts; second house and standalone building; secure/on-street/shade-net/underground/visitor/tandem parking; gas geyser; ADSL, dial-up, fixed WiMAX, ISDN, satellite and VDSL internet; courtyard and roof area; and nearby bus, minibus-taxi and train services. These are distinct agent choices, not inferred from broader “Kitchen”, “Solar”, “Satellite TV” or “Parking” answers. Where v55 marks a tag as usable only with a feature description, the mapper now sends a typed `featureTags` entry for confirmed Built-in Cupboards, Walk-in Closet, Guest Toilet, Irrigation System, Clubhouse, Lapa and Squash Court. Air Conditioning and Mountain View are mapped as listing tags. Existing Private Property Rev 4.7 attribute mappings remain category-gated; the new P24-specific facts stay description-only there because that contract has no matching attributes.

The saved-listing **Review channels** modal now lists each positively selected fact per portal as **Native** (with its feed field) or **Description only**. A partial conversion such as a carport count to a Property24 carport presence flag is deliberately *not* labelled full native parity. This display is advisory and does not bypass portal readiness checks. The new native fields and tag containers are covered by local payload tests, but no controlled Property24 or Private Property create/update, accepted response or public-page presentation has been observed. Remaining gaps include additional v55 optional fields and feature-specific descriptions, ambiguous tags/synonyms, count semantics for tags, and Private Property capabilities beyond the unconfirmed Rev 4.7 feed. **Full parity is not yet proved.**

## Phase 2 implementation checkpoint — 24 September 2026

The Phase 1 tables below are the **before-implementation audit**; their “P24 now” cells have not been rewritten as portal proof. The local mapper now sends valid v55 `parking.parkingSpaces` (instead of the unsupported `parking.open`), and a confirmed carport count becomes the native `parking.carport` presence flag. It sends explicitly answered solar panels/geyser, inverter or battery, water tank, borehole, fibre, generator, backup water, balcony and wheelchair access through their named `PropertyFeatures` fields. Storeys now map to `numberOfFloors`. A new separate **Number of studies** count maps to `studies`; the existing Study Yes/No remains for Private Property and is never converted into an invented count. Explicit No is preserved for native booleans.

For residential listings, a small set of v55 tags that the specification marks as usable *on a listing* now maps from confirmed Yes facts: New Development, Security Estate, Pantry, Scullery, Laundry, Patio, Built-in Braai, Jacuzzi, Tennis Court, Alarm, Intercom and Electric Fencing. Tags marked for a feature description only (such as Built-in Cupboards, Guest Toilet, Lapa and Clubhouse) are **not** incorrectly placed in `Listing.tags`; they still need a `FeatureType`-qualified `featureTags` mapping. Ambiguous synonyms and currently uncaptured v55 choices remain open gaps. Private Property Rev 4.7 attributes remain as before, except that a Study count now yields its Yes/No `Study` attribute when the separate Study answer is unknown. These are locally checked outbound mappings, **not** evidence of acceptance or public display; full parity is still not achieved.

Audit date: 2026-09-24. Owner: the primary Arch9 transaction workspace (`the-it-guy/`). This is an **implementation gap register**, not a claim that either portal has accepted these fields in production. It covers the direct-listing feature choices and the current sales listing mappers; rental and specialist-category capture need a separate pass before a universal parity claim.

## Strict parity reset — 24 September 2026

**No full-parity claim is justified.** A feature is complete for a channel only when Arch9 captures the same typed fact, the *current inbound partner feed contract* names an applicable native field/value, our outbound payload sends it, and a controlled portal listing proves that the portal accepts and presents it as the intended structured feature. Description text is **not** a checklist, badge or search-filter mapping; in this audit it is a **native-feature gap**. A portal's own listing editor or public page is evidence of portal capability, but not proof that the partner feed can supply that capability.

| Evidence layer | Property24 | Private Property |
| --- | --- | --- |
| Current inbound create/update specification | **Found in earlier Arch9 task history:** user-pasted Listing Service v53 OpenAPI and the official [Listing Service v55 OpenAPI](https://api.property24.com/swagger/v55-listing/docs), also available on [ExDev](https://api.exdev.property24-test.com/swagger/v55-listing/docs). The v55 feature schemas on those two hosts match in the 24 September 2026 read-only check. | User-attached confidential Agency Feed Service Rev 4.7 PDF, dated 20 July 2026, with Appendix A field/type/category list, plus companion webhook/event/video documents. Currency has not been reconfirmed with the feed team. |
| Publicly discoverable official API | The Property24 v55 link above is the **inbound create/update** authority. [PropCtrl Listing Service v1](https://api.propctrl.com/index.html) is a different listing/changes **read** API and must not be substituted for it. | [Feed-provider instructions](https://helpdesk.privateproperty.co.za/portal/en/kb/articles/getting-started-with-a-feed-integration) say the API document is supplied by the feed team on request. |
| Native feature coverage proved locally | Current mapper emits only a small subset of the v55 `PropertyFeatures` schema. Confirmed **implementation gaps** include native `sustainabilityInfo` (solar panels/geyser, inverter/battery, water tank, borehole), `internetAccess.fibre`, `hasGenerator`, `hasBackupWater`, `isWheelchairAccessible`, `studies`, `numberOfFloors`, `outsideArea.balcony`, and relevant `FeatureTag`/`Tag` choices. | Appendix A fields emitted by `privatePropertyListingMapper.js` are contract-mapped for allowed categories. `LeviesAndRates` is not emitted as a combined field; solar/backup equipment and fibre are absent from the local Rev 4.7 attribute list. |
| Portal acceptance and structured public display | Not proved for this parity pass. | Not proved for this parity pass. |

**Specification follow-up:** The Property24 v55 schema is available; enumerate its complete `PropertyFeatures` and 374-value `Tag` enum against the Arch9 catalogue, then test category applicability and portal presentation. Ask Property24 only about ambiguities that the schema does not settle (including reduced-price promotion and how tags render). Private Property must confirm whether Rev 4.7 is current and provide any later Appendix A, feature, promotion or status revisions—particularly solar/backup equipment, fibre and reduced-price treatment. No vendor request was sent during this audit.

The prior “Property24 specification missing” conclusion was incorrect; the user had supplied v53 and the v55 URL in earlier tasks. This matrix is **not yet a complete v55 field-by-field reconciliation** and the Private Property Rev 4.7 currency still needs confirmation. The existing description fallback must not be counted as success in parity tests or readiness messaging.

## Phase 1: current Arch9 catalogue versus native portal fields

Source of truth for this audit: `src/services/listings/listingFeatureCatalog.js` (72 facts: 70 available to sale listings and 2 rental-only), [Property24 Listing Service v55 OpenAPI](https://api.property24.com/swagger/v55-listing/docs) (`Listing.propertyFeatures`, `Listing.tags`, `Listing.featureTags` and their referenced schemas), the user-attached *Private Property Agency Feed Service Rev 4.7* Appendix A, and the two current server listing mappers. The Property24 production and ExDev v55 `Listing`, `PropertyFeatures` and `Tag` schema subset had identical SHA-1 digests on 24 September 2026. This is a **contract and code audit**, not portal acceptance proof.

In the tables, `B` = boolean with Unknown, `C` = numeric count, `E` = enum choice. P24 `N` = native structured output currently emitted; `T` = currently description-only (a **gap**, even when a native contract target exists). PP `N` = native Rev 4.7 XML attribute currently emitted for allowed categories; `T` = description-only; `—` = no native equivalent in the cited contract. `Tag.X` is a **candidate** enum value, not a completed mapping: we still need to choose `Listing.tags` versus a correctly typed `Listing.featureTags` entry and test accepted/displayed output. Never substitute a broader or adjacent concept silently. Unless noted, the PP feature attribute applies to Residential and Farms/Smallholdings; `Borehole` is Farms only, and `Garden`, `RoofType`, `Finishes` are Residential only.

Property24 v55 lists field types and tag values but does not explicitly settle every category restriction or every public-page rendering rule. Those cells remain **contract target identified, category/display unverified** until controlled portal proof; this audit does not extend the existing non-residential publication boundary.

### Rooms, building and parking

| Arch9 fact/type | P24 v55 exact field or candidate tag | P24 now | PP Rev 4.7 attribute | PP now | Phase 2 gap |
| --- | --- | --- | --- | --- | --- |
| `study` B | `propertyFeatures.studies` integer | T | `Study` | N | Add study count; do not turn a Yes into an invented count. |
| `staff_quarters` B | `Tag.StaffQuartersDomesticRooms`; `domesticRooms` integer | T | `StaffQuarters` | N | Tag context/count decision. |
| `built_in_cupboards` B | `Tag.Built_inCupboards` | T | `BuiltInCupboards` | N | Typed tag mapping. |
| `walk_in_closet` B | `Tag.Walk_in_closet` | T | `WalkInCloset` | N | Typed tag mapping. |
| `family_tv_room` B | `FeatureType.FamilyTVRoom` | T | `Family/TV Room` | N | Determine valid feature-tag representation. |
| `kitchen` B | `propertyFeatures.kitchens.kitchens` integer | T | `Kitchen` | N | Capture count or confirm a presence tag; do not invent 1. |
| `scullery` B | `Tag.Scullery` | T | `Scullery` | N | Typed tag mapping. |
| `pantry` B | `Tag.Pantry` | T | `Pantry` | N | Typed tag mapping. |
| `guest_toilet` B | `Tag.GuestToilet` | T | `Guest Toilet` | N | Typed tag mapping. |
| `entrance_hall` B | `FeatureType.EntranceHall` | T | `Entrance hall` | N | Determine valid feature-tag representation. |
| `laundry` B | `Tag.Laundry` | T | `Laundry` | N | Typed tag mapping. |
| `fireplace` B | `Tag.FireplaceTemperatureControl`, `FireplaceRoomOptions`, `FireplaceEntranceHall` | T | `Fireplace` | N | Require room/context before choosing a tag. |
| `air_conditioning` B | `Tag.AirConditioningUnit` or `AirConditioner` | T | `Aircon` | N | Confirm correct tag context. |
| `open_plan_living` B | `Tag.OpenPlanRoomOptions` / `OpenPlanSpecialFeature` candidate | T | — | T | Determine exact meaning; not equivalent to `OpenPlanKitchen`. |
| `en_suite` C | `Tag.EnSuite` / `MainenSuite` only; no count field found | T | `EnSuite` | N | P24 count cannot be claimed from a boolean tag. |
| `lounges` C | `FeatureType.Lounge`; no count field found | T | `Lounges` | N | Check repeated feature-tag semantics before mapping count. |
| `dining_areas` C | `FeatureType.DiningRoom`; no count field found | T | `DiningAreas` | N | Check repeated feature-tag semantics before mapping count. |
| `flatlet` B | `propertyFeatures.flatlet` boolean | N | `Flatlet` | N | Controlled portal display proof. |
| `garden_cottage` B | `Tag.Cottage` / `GardenFlat` are not exact synonyms | T | `Garden Cottage` | N | Ask which P24 tag, if any, represents a separate garden cottage. |
| `storage` B | `Tag.Storeroom` is narrower than generic storage | T | `Storage` | N | Separate storeroom from generic storage if needed. |
| `new_development` B, sale | `Tag.NewDevelopment` | T | — | T | Typed tag and development-listing workflow decision. |
| `carports` C | `propertyFeatures.parking.carport` boolean; `Tag.Carport` | T | `Carports` | N | P24 native count is not established; capture/emit presence separately. |
| `storeys` C | `propertyFeatures.numberOfFloors` integer | T | `Storeys` | N | Direct P24 mapping, verify non-negative/valid count. |
| `roof_type` E | `Tag.Tile`, `Slate`, `Thatch` candidates; `Other` lacks exact tag | T | `RoofType` (Residential) | N | Category/roof tag semantics; do not collapse `Other`. |
| `finishes` E | No v55 Very High/High/Medium/Budget native value found | T | `Finishes` (Residential) | N | P24 native gap; do not substitute style tags. |

### Outdoor, leisure and security

| Arch9 fact/type | P24 v55 exact field or candidate tag | P24 now | PP Rev 4.7 attribute | PP now | Phase 2 gap |
| --- | --- | --- | --- | --- | --- |
| `pool` B | `propertyFeatures.pool` boolean | N | `Pool` | N | Controlled portal display proof. |
| `garden` B | `propertyFeatures.garden` boolean | N | `Garden` (Residential) | N | PP farm support is not established. |
| `balcony` B | `propertyFeatures.outsideArea.balcony` boolean | T | `Balcony` | N | Direct P24 mapping. |
| `deck` B | No exact v55 field/tag found | T | `Deck` | N | P24 native gap. |
| `patio` B | `Tag.Patio` | T | `Patio` | N | Typed tag mapping. |
| `lapa` B | `Tag.Lapa` | T | `Lapa` | N | Typed tag mapping. |
| `built_in_braai` B | `Tag.Built_inBraai` | T | `Built-in-Braai` | N | Typed tag mapping. |
| `entertainment_area` B | No exact tag; `RecreationRoom` is narrower | T | — | T | Define exact concept or leave native gap. |
| `clubhouse` B | `Tag.Clubhouse` | T | `Clubhouse` | N | Typed tag mapping. |
| `gym` B | No exact v55 field/tag found | T | `Gym` | N | P24 native gap. |
| `golf` B | `GolfEstate` is location type, not a golf facility | T | `Golf` | N | P24 native gap; do not map to estate tag. |
| `tennis_court` B | `Tag.TennisCourt` | T | `TennisCourt` | N | Typed tag mapping. |
| `squash_court` B | `Tag.SquashCourt` | T | `SquashCourt` | N | Typed tag mapping. |
| `jacuzzi` B | `Tag.Jacuzzi` | T | `Jacuzzi` | N | Typed tag mapping. |
| `jetty_berth` B | `Tag.Jetty` candidate | T | `Jetty Berth` | N | Confirm berth versus jetty meaning. |
| `irrigation_system` B | `Tag.Irrigationsystem` | T | `Irrigation System` | N | Typed tag mapping. |
| `paving` B | `Tag.Paveway` is potentially narrower | T | `Paving` | N | Confirm paving extent before mapping. |
| `kids_play_area` B | No exact v55 field/tag; `Creche` differs | T | — | T | Native gap. |
| `walking_trails` B | No exact v55 field/tag found | T | — | T | Native gap. |
| `security` B, generic | `FeatureType.Security` is generic; no exact detail | T | — | T | Keep distinct from specific alarm/gate/fence facts. |
| `security_estate` B | `Tag.SecurityEstate` | T | — | T | Typed tag; do not infer from generic security. |
| `electric_fence` B | `Tag.Electricfencing` | T | `Electric Fencing` | N | Typed tag mapping. |
| `fence` B, generic | `TotallyFenced` / `PartiallyFenced` need subtype | T | `Fence` | N | Capture extent before P24 tag. |
| `access_gate` B | `SecurityGate` / `ElectricGate` need subtype | T | `AccessGate` | N | Capture gate type before P24 tag. |
| `security_post` B | `GuardHouse` / `Guard` are not exact synonyms | T | `SecurityPost` | N | Confirm physical post versus staffed guard. |
| `alarm` B | `Tag.AlarmSystem` | T | `Alarm` | N | Typed tag mapping. |
| `intercom` B | `Tag.Intercom` | T | `Intercom` | N | Typed tag mapping. |

### Energy, water, connectivity and access

| Arch9 fact/type | P24 v55 exact field or candidate tag | P24 now | PP Rev 4.7 attribute | PP now | Phase 2 gap |
| --- | --- | --- | --- | --- | --- |
| `solar` B, generic | No generic v55 solar field; specific fields differ | T | — | T | Migrate only with agent-confirmed equipment type. |
| `solar_system` B, generic | No generic v55 solar-system field | T | — | T | Migrate only with agent-confirmed equipment type. |
| `solar_panels` B | `propertyFeatures.sustainabilityInfo.solarPanels` boolean | T | — | T | Direct P24 mapping; PP native gap in Rev 4.7. |
| `solar_geyser` B | `propertyFeatures.sustainabilityInfo.solarGeyser` boolean | T | — | T | Direct P24 mapping; PP native gap in Rev 4.7. |
| `backup_power` B, generic | No generic v55 backup-power field | T | — | T | Do not infer inverter or generator. |
| `inverter_battery` B | `propertyFeatures.sustainabilityInfo.backupBatteryOrInverter` boolean | T | — | T | Direct P24 mapping; PP native gap in Rev 4.7. |
| `generator` B | `propertyFeatures.hasGenerator` boolean | T | — | T | Direct P24 mapping; PP native gap in Rev 4.7. |
| `backup_water` B | `propertyFeatures.hasBackupWater` boolean | T | — | T | Direct P24 mapping; do not infer a tank. |
| `water_tank` B | `propertyFeatures.sustainabilityInfo.waterTank` boolean | T | — | T | Direct P24 mapping; PP native gap in Rev 4.7. |
| `borehole` B | `propertyFeatures.sustainabilityInfo.borehole` boolean | T | `Borehole` (Farms only) | N for Farms; T for Residential | Direct P24 mapping; do not claim PP Residential native support. |
| `fibre` B | `propertyFeatures.internetAccess.fibre` boolean | T | — | T | Direct P24 mapping; PP native gap in Rev 4.7. |
| `water_included` B, rental | No exact v55 inclusion field found | T | `WaterIncluded` | N | P24 native gap; keep rental semantics distinct from water supply. |
| `electricity_included` B, rental | No exact v55 inclusion field found | T | `ElectrictyIncluded` (contract spelling) | N | P24 native gap; do not infer from power infrastructure. |
| `satellite` B | `Tag.SatelliteDish` is equipment, not necessarily satellite service | T | `Satelite` (contract spelling) | N | Confirm exact meaning before P24 tag. |
| `tv` B | `TVAntenna` / `TVPort` are not a TV device | T | `TV` | N | P24 native gap for a TV device. |
| `sea_view` B | `Tag.Sea` may describe aspect, not view | T | `SeaView` | N | Confirm P24 meaning; do not map automatically. |
| `mountain_view` B | `Tag.MountainView` | T | — | T | Typed P24 tag; do not collapse into PP ScenicView. |
| `scenic_view` B | No generic v55 scenic-view field/tag found | T | `ScenicView` | N | P24 native gap; do not infer MountainView. |
| `wheelchair_accessible` B | `propertyFeatures.isWheelchairAccessible` boolean | T | `HandicapAvailable` | N | Direct P24 mapping; verify public wording. |
| `pet_friendly` B | `propertyFeatures.petsAllowed` enum | N | `PetsAllowed` | N | Verify enum values, explicit No/Unknown and public display. |

The tables cover all 72 current catalogue keys once. They do **not** imply that 374 Property24 `Tag` values require 374 identical Arch9 checkboxes: many are mutually exclusive property subtypes, architectural choices, room-specific details, category-specific facts, or unsafe synonyms. Phase 2 must inventory the v55 fields/tags that are relevant but **not yet captured** and approve their agent-facing type/category before adding controls. Obvious examples are `sustainabilityInfo.gasGeyser`, non-fibre `internetAccess` options, `parking` subtypes, `outsideArea.courtyard`/`roofArea`, `secondHouse`, and specific security tags such as `ClosedCircuitTV` and `BurglarBars`. The exact tag container and portal display still require controlled proof.

### Reverse check: all 34 top-level v55 `PropertyFeatures` fields

This is the opposite direction of the 72-row Arch9 audit: a portal field cannot be silently omitted just because it is absent from our current checklist. Every v55 `PropertyFeatures` top-level key appears in exactly one row below. Nested objects need the additional review shown afterwards.

| Contract fields | Current Arch9 position | Decision |
| --- | --- | --- |
| `bathrooms`, `bedrooms`, `flatlet`, `furnishedStatus`, `garages`, `garden`, `petsAllowed`, `pool` | Structured outbound fields exist | Verify enum/count/Unknown semantics and portal rendering. |
| `parking` | Outbound object uses invalid `open` key | Fix to v55 `ParkingInfo` shape and test. |
| `hasBackupWater`, `hasGenerator`, `internetAccess`, `isWheelchairAccessible`, `numberOfFloors`, `outsideArea`, `studies`, `sustainabilityInfo` | Relevant Arch9 facts exist but are currently description-only or incompletely typed | Native mapping; study needs a count rather than invented `1`. |
| `domesticBathrooms`, `domesticRooms`, `hasStandaloneBuilding`, `heightRestrictions`, `kitchens`, `outBuildingsSize`, `outsideToilets`, `publicTransport`, `receptionRooms`, `secondHouse` | No equivalent typed field, or only a broader boolean/label | Add only the meaningful agent-facing facts with correct count/boolean/category semantics. |
| `bedroomsDescription`, `domesticRoomsDescription`, `flatDescription`, `garagesDescription`, `poolDescription`, `receptionRoomsDescription`, `studiesDescription` | No distinct per-feature text controls | Decide whether agents need these optional per-feature descriptions; they are not substitutes for native feature values. |

Nested v55 inventory: `sustainabilityInfo` has `solarPanels`, `solarGeyser`, `gasGeyser`, `waterTank`, `borehole`, `backupBatteryOrInverter` (only gas geyser lacks a distinct Arch9 catalogue fact); `internetAccess` has `adsl`, `dialUp`, `fibre`, `fixedWiMax`, `isdn`, `satellite`, `vdsl` (only fibre is a confirmed equivalent, because Arch9 `satellite` may mean TV); `outsideArea` has `outsideAreas`, `description`, `balcony`, `courtyard`, `roofArea` (only balcony is a confirmed equivalent); `parking` has `parkingSpaces`, `parkingSpacesDescription`, `parkingBayNumber`, `carport`, `doubleParking`, `onStreetParking`, `secureParking`, `shadeNetCoveredParking`, `singleParking`, `tandemParking`, `tripleParking`, `undergroundParking`, `visitorsParking` (Arch9's open bays and carport count cannot be assumed to answer all these). `Listing.tags` and `featureTags` reference the 374-value `Tag` enum and `FeatureType` enum; the current mapper emits neither. A follow-on tag taxonomy must separate residential checklist facts, room/detail options, specialist categories and non-equivalent synonyms before UI expansion.

### Core listing field mismatch found during this audit

The existing Property24 mapper builds `propertyFeatures.parking.open` from Arch9 open parking bays. Listing Service v55 `ParkingInfo` has **no `open` property** and declares `additionalProperties: false`; it defines `parkingSpaces` and named parking booleans instead. The archived preview sample still contains `parking.open`. This is an **outbound schema mismatch**, not a missing agent feature choice. Phase 2 must map the correct count/parking type and add schema-shape assertions before another portal update. The sample preview also contains `sourceUrl` and `bytesLoaded` on photo rows, but these are preview-only metadata: the mapper builds a separate submission `payload` with portal photo objects. Do not mistake preview metadata for submitted fields.

## Phase 1 contract-evidence register

| Evidence needed | Current source | Confidence / status | What closes the gap |
| --- | --- | --- | --- |
| Private Property full attribute names, values, and category applicability | Local Agency Feed Service API Rev 4.7, Appendix A, pages 95–98; 69 attributes transcribed in section A | **Contract available, currency unconfirmed.** Revision history dates Rev 4.7 to 20 July 2026. | Private Property confirms Rev 4.7 is the current feed specification, or supplies a newer revision for a line-by-line diff. |
| Private Property integration route | [Private Property's feed-provider helpdesk](https://helpdesk.privateproperty.co.za/portal/en/kb/articles/getting-started-with-a-feed-integration) | **Official public process confirmed.** The API document is supplied through the feed team, not published on that page. | Request the current document through the existing Arch9/agency contact. Do not send a request on the user's behalf without approval. |
| Property24 full listing-feature names, types, values, category applicability, and any badge controls | User-pasted v53 OpenAPI in earlier task; official [v55 OpenAPI](https://api.property24.com/swagger/v55-listing/docs) on production and ExDev | **Contract found; mapping incomplete.** The schema includes structured sustainability, internet, accessibility and generator fields plus `FeatureTag`/`Tag`. | Enumerate all v55 native fields and tags against current capture and outbound mapper; confirm ambiguous category and display rules through controlled tests. |
| Property24 public feature presentation | Property24's own linked listing pages in section B | **Visible examples only.** They do not prove feed fields or acceptance. | Match each field in the partner schema, submit a controlled ExDev listing, then check the resulting public page where available. |
| Existing Property24 category and version assumptions | `docs/property24-listing-category-contract.md` describes v53 residential-only evidence; `server/property24/propertyTypeCatalogue.js` contains a production v55 property-type catalogue dated 21 September 2026 | **Needs reconciliation.** A type catalogue is not proof that a category's feature payload is accepted. | Check active environment/version and category guards before changing the parity matrix or claiming specialist-category support. |

The Property24 v55 schema answers many feature-field questions previously listed as unknown. Remaining vendor questions include category restrictions not explicit in the schema, tag presentation, reduced-price promotion, and any feed changes after v55. The Private Property request should ask whether Rev 4.7 is current and whether any attribute or promotion/badge capability has been added since July 2026. No vendor request has been sent.

## Evidence and reading key

- **Arch9 capture**: `AgentListings.jsx` quick-add selling points and `AgentListingDetail.jsx` feature/amenity selectors. `Yes` below means an agent has an explicit choice; it does not imply a typed yes/no/unknown fact or a portal mapping.
- **PP contract**: local *Private Property Agency Feed Service API Rev 4.7*, Appendix A, pages 95–98 (`tmp/private-property-docs/Agency Feed Service - Rev 4.7-4.txt`). `Native` means the current `privatePropertyListingMapper.js` emits the named XML attribute; `Text` means the selected label is appended to the description; `Absent` means there is no dedicated selection or mapping. The specification is dated July 2026; confirm with Private Property that Rev 4.7 is still current before release. The source is confidential and should not be copied into public documentation.
- **P24 feed**: the official [Listing Service v55 OpenAPI](https://api.property24.com/swagger/v55-listing/docs) is the field/enum contract; `property24ListingMapper.js` is the separate Arch9 implementation. `Native` means the current payload has a structured field; `Text` means description-only. A schema field is **not yet a tested Arch9 mapping or proof of public rendering**. Public Property24 pages establish visible capability only, not feed acceptance.
- For a selected label not consumed as a structured field, the normalizer usually appends it to the portal description. This is a **native-feature gap**, not parity with a portal filter, icon, or structured feature. An unselected label is not reliably sent as an explicit `No`.

## A. Every Private Property Rev 4.7 Appendix A attribute

`Pre-Phase-2 capture` records the **direct sales listing** baseline before the shared catalogue was added; it is retained as a gap-history snapshot. See the Phase 2 and 3 updates below for current behavior. `PP now` is the emitted structured XML attribute when the captured fact is present and the category permits it, not merely the presence of text. `P24 now` shows the current structured equivalent where one exists; `?` means no equivalent is verified in the current mapper. The last column records remaining decisions, not necessarily unimplemented capture or mapping.

| PP Appendix A attribute | Pre-Phase-2 capture | PP now | P24 now | Gap / next decision |
| --- | --- | --- | --- | --- |
| Bedrooms | Yes, count | Native | Native | Verify counts in portal previews. |
| Bathrooms | Yes, count | Native | Native | Verify fractional bathrooms where applicable. |
| HomeType | Yes, property type | Native | Native property-type ID | Maintain subtype catalogue. |
| FarmType | Specialist facts | Native | ? | Category-specific acceptance required. |
| LandType | Specialist facts | Native | ? | Category-specific acceptance required. |
| FloorArea | Yes, size | Native | Native | Verify units and blanks. |
| LandArea | Yes, size | Native | Native | Verify units and blanks. |
| EnSuite | No dedicated count | Native | Text | Verify portal count. |
| Lounges | No dedicated count | Native | Text | Verify portal count. |
| DiningAreas | No dedicated count | Native | Text | Verify portal count. |
| Garages | Yes, count | Native | Native | Verify count. |
| StaffQuarters | Yes, label | Native | Text | P24 structured equivalent unverified. |
| Study | Yes, label | Native | Text | v55 `propertyFeatures.studies` count exists; current Arch9 capture is boolean. |
| Pool | Yes, label | Native | Native | Capture explicit No/Unknown, not only a selected chip. |
| Flatlet | Yes, label | Native | Native | Capture explicit No/Unknown. |
| Carports | No dedicated sales count | Native | Text | Verify count distinct from open parking. |
| Storeys | No dedicated count | Native | Text | Verify count. |
| FarmName | Specialist facts | Native | ? | Category-specific acceptance required. |
| BusinessType | Specialist facts | Native | ? | Category-specific acceptance required. |
| Parking | Yes, bays | Native | Native open bays | Clarify covered/open/other counts. |
| LeviesAndRates | Separate amounts | Absent | ? | Decide whether combined value is ever needed. |
| Rates | Yes, amount | Native | Native | Verify currency/frequency. |
| Levies | Yes, amount | Native | Native | Verify currency/frequency. |
| PetsAllowed | Yes, label/field | Native | Native | Capture explicit Yes/No/Unknown. |
| WaterIncluded | No dedicated sales choice | Native | Text | Rental applicability; verify. |
| ElectrictyIncluded (contract spelling) | No dedicated sales choice | Native | Text | Rental applicability; verify. |
| Satelite (contract spelling) | No dedicated sales choice | Native | Text | Verify portal display. |
| TV | No dedicated choice | Native | Text | Verify portal display. |
| Aircon | Yes, Air Conditioning | Native | Text | v55 `Tag.AirConditioner` exists; exact tag placement/display needs testing. |
| Alarm | No direct sales choice | Native | Text | Verify portal display. |
| ScenicView | No exact choice | Native | Text | Distinct from Mountain View. |
| SeaView | Yes, label | Native | Text | v55 `Tag.Sea` exists; confirm it represents sea view before mapping. |
| WalkInCloset | No choice | Native | Text | Verify portal display. |
| BuiltInCupboards | No choice | Native | Text | Verify portal display. |
| Furnished | Yes, property field | Native | Native | Verify Yes/No/partial semantics. |
| HandicapAvailable | No choice | Native | Text | Verify wording with portal. |
| Balcony | Yes, label | Native | Text | v55 `propertyFeatures.outsideArea.balcony` and balcony tags exist. |
| Deck | No choice | Native | Text | Verify portal display. |
| AccessGate | No exact choice | Native | Text | Verify portal display. |
| SecurityPost | No exact choice | Native | Text | Verify portal display. |
| TennisCourt | No choice | Native | Text | Verify portal display. |
| SquashCourt | No choice | Native | Text | Verify portal display. |
| Clubhouse | Yes, amenity | Native | Text | v55 `Tag.Clubhouse` exists; exact tag placement/display needs testing. |
| Gym | No choice | Native | Text | Verify portal display. |
| Golf | No choice | Native | Text | Verify portal display. |
| Jacuzzi | No choice | Native | Text | Verify portal display. |
| Patio | No choice | Native | Text | Verify portal display. |
| Storage | No choice | Native | Text | Verify portal display. |
| Fence | No exact choice | Native | Text | Distinct from Electric Fence. |
| Laundry | No choice | Native | Text | Verify portal display. |
| Kitchen | No dedicated feature choice | Native | Text | PP expects Yes/No. |
| Lapa | No choice | Native | Text | Verify portal display. |
| Electric Fencing | Yes, Electric Fence | Native | Text | v55 `Tag.Electricfencing` exists; exact tag placement/display needs testing. |
| Built-in-Braai | Yes, label | Native | Text | v55 `Tag.Built_inBraai` exists; exact tag placement/display needs testing. |
| Fireplace | Yes, label | Native | Text | v55 has fireplace tags; select the correct room/feature context. |
| Garden Cottage | No exact choice | Native | Text | Distinct from Flatlet/property subtype. |
| Jetty Berth | No choice | Native | Text | Verify portal display. |
| Scullery | No choice | Native | Text | Verify portal display. |
| Pantry | No choice | Native | Text | Verify portal display. |
| Guest Toilet | No choice | Native | Text | Verify portal display. |
| Entrance hall | No choice | Native | Text | Verify portal display. |
| Borehole | Yes, label | Farms only | Text | Residential is description-only. |
| Irrigation System | No choice | Native | Text | Verify portal display. |
| Paving | No choice | Native | Text | Verify portal display. |
| RoofType | No choice | Residential only | Text | Verify accepted enum. |
| Finishes | No choice | Residential only | Text | Verify accepted enum. |
| Garden | Yes, label | Native | Native | Capture explicit No/Unknown. |
| Intercom | No choice | Native | Text | Verify portal display. |
| Family/TV Room | No choice | Native | Text | Distinct from TV device attribute. |

The PP Appendix A list is category-scoped; a field's presence in the contract does not mean it is valid on every listing type. The mapper enforces category applicability for captured facts; live portal acceptance still needs sandbox confirmation.

### Phase 2 capture update

The direct-listing wizard and listing-detail workspace now use one grouped catalogue (`src/services/listings/listingFeatureCatalog.js`). It adds explicit Yes/No/Unknown capture for the catalogue's boolean features, including previously absent Alarm, Access Gate, Laundry, Patio, Scullery, Pantry, Wheelchair Accessible and the distinct solar/backup types. It adds typed counts for En-suite, Lounges, Dining areas, Carports and Storeys, plus the Roof type and Finishes choices. Existing bedrooms, bathrooms, garages, areas, pricing, property type and Furnished remain in their established fields; rental-only included-utility choices are shown on rental listings. Existing positive chips are migrated in memory to `Yes`; missing catalogue choices remain `Unknown`. Explicit `No`, counts and choices are stored in the existing seller-onboarding JSON, while positive selections continue through the legacy feature arrays for compatibility. The existing Furnished field still has binary rather than three-way capture.

### Phase 3 feed mapping update

The two listing preview paths now hydrate `featureFacts` from seller-onboarding JSON. Private Property sends captured Rev 4.7 Appendix A facts as native attributes using the contract's exact identifiers and only in their allowed categories; explicit `No`, valid counts, and roof/finish choices are retained. For example, `study` becomes `Study=Yes`, `air_conditioning=false` becomes `Aircon=No`, and `en_suite=2` becomes `EnSuite=2`. Borehole is native only for Farms/Smallholdings; on a Residential listing it is description-only. Solar panels, inverter/battery, water tank, fibre and other facts without a Rev 4.7 attribute are description-only. Property24 currently sends only a small subset of the fields in its v55 feed schema (including pool, garden, flatlet and pet permission); Study, Solar panels and many other captured facts are description-only **despite native v55 fields now identified**. This is an implementation gap, not a partner-schema uncertainty. “Description-only” does **not** guarantee a portal feature badge or search filter. Positive subtypes remain distinct in text (for example, Solar panels is not collapsed into generic Solar power). Explicit `No` suppresses stale positive feature chips. No live portal submission or rendering has been verified in this phase.

### Phase 4 listing actions update

On direct sale listings, Overview and Marketing offer Under offer, Sold and Reduce price; the Marketing controls sit below Selling Points. Each action saves Arch9 first, then updates confirmed live portal listings and reports each channel separately, with a retry for failed portal calls. Reduce price requires a lower positive amount and records both prices in activity. Property24 receives `Pending` or `Sold` for those status actions; Private Property receives `PendingOffer` or `Sold`. For a reduction on an **active** listing, Property24 now receives the contract-defined `ReducedPrice` status together with the new price in a listing update, with unchanged photos omitted. A listing already under offer retains Property24 `Pending` on a price change so it is not accidentally reactivated. The v53 and v55 `ListingStatus` enum both document `ReducedPrice`; `ignoreForPriceReducedAlerts` is a separate opt-out field defaulting to false, **not** a banner control. Private Property Rev 4.7 has no equivalent reduced-price status; it receives the changed price through ListingImport. The client now treats only the expected portal `SUBMITTED` / `UPDATED` responses as accepted. A portal's accepted response is not proof its public page has changed. Neither verified feed contract establishes a reduced-price **banner** control, so that checkbox remains unavailable and the quick action does not set the old `reduced_banner` flag. The direct-listing wizard no longer invites new agents to select that unsupported flag; existing saved values are preserved for compatibility. Controlled portal acceptance and public-page verification remain Phase 5 work.

### Phase 5 journey evidence — local checks only

The focused mapper contracts now exercise **all 70 catalogue facts applicable to a direct sale** one at a time for each portal. Every fact must appear either as the expected native attribute/field or in the description; a missing fact fails the check. **This assertion is insufficient for parity** because description text must fail the native-feature requirement when v55 has a matching field/tag. Private Property also checks explicit `No`, room counts, roof choice, Residential-versus-Farms applicability, rental water/electricity inclusion, and Sold plus a changed price. Property24 checks only its four currently mapped structured feature fields (Flatlet, Pool, Garden and PetsAllowed), description fallbacks for the other sale facts, explicit `No`, and Sold plus a changed price. The listing quick-action contract checks reduction validation, save-before-portal sequencing, individual channel results, retry, and the disabled unverified banner option. Preview hydration tests check that saved seller-onboarding `featureFacts` reach the portal plan. These are **fixture and code-path proofs**, not portal acceptance or public-page proofs.

| Evidence step | Property24 | Private Property |
| --- | --- | --- |
| Arch9 captured value and saved onboarding fact | Local fixture verified; real listing pending | Local fixture verified; real listing pending |
| Outbound payload/XML | Local mapper verified; controlled submission pending | Local mapper verified; controlled submission pending |
| Portal accepted create/update response | Pending approved test listing | Pending approved test listing |
| Portal status after update | Pending approved test listing | Pending approved test listing |
| Public page feature, price and status appearance | Pending approved public test page | Pending approved public test page |
| Reduced-price banner | Unsupported/unverified feed control; do not claim | Unsupported/unverified feed control; do not claim |

To close Phase 5, select a disposable listing and specify the Property24 ExDev and Private Property sandbox/production account and permitted actions. Record the before-state, exact Arch9 facts, outbound request, accepted response, portal status and public URL for each feature/category tested. Run create and edit checks separately, then Under offer, price reduction and Sold only if expressly approved; Sold can be terminal. Never treat a successful API response or text-only description as proof of a portal badge. No live listing submission, remote write or public-page comparison was performed in this local phase.

### Phase 6 rollout and monitoring gate

Listing Channels now derives each portal's latest quick-action delivery state from the existing listing activity history. A failed call shows **Needs attention** with a channel-specific retry; an accepted call shows **Awaiting verification** until an agent opens the validated public URL and explicitly confirms the change is visible. Confirmation is itself recorded in activity. A retry writes a pending activity event before contacting a portal, so a missing completion record cannot look successful. If activity history cannot be read, connected channels show **Needs attention** rather than “Current.” This monitors the quick-action update path; other manual portal controls retain their existing status/readiness UI.

Rollout remains **HOLD**, not released: Phase 5 has no approved controlled portal listing or public-page comparison, and the now-found Property24 v55 schema has not yet been fully mapped. Start with one residential sale per channel only after those dependencies are cleared. Do not expand to rental or specialist categories, or claim full feature parity, based solely on local mapper tests. No deployment, migration application, portal submission or remote data change was performed by this phase.

### Private Property value and applicability notes from Appendix A

| Contract value type | Attributes | Allowed values / constraint |
| --- | --- | --- |
| Numeric room/building counts | `Bedrooms`, `Bathrooms`, `EnSuite`, `Lounges`, `DiningAreas`, `Garages`, `Carports`, `Storeys` | Numeric; the contract lists double numeric, so do not coerce all to whole numbers. |
| Numeric dimensions and charges | `FloorArea`, `LandArea`, `LeviesAndRates`, `Rates`, `Levies` | Area values are numeric strings; combined amount is double numeric; separate rates and levies are integers in the contract. Confirm units and monetary precision in feed acceptance. |
| Other free-text values | `Parking`, `FarmName` | Alphanumeric. Do not assume `Parking` is restricted to a numeric count. |
| Property subtype choices | `HomeType`, `FarmType`, `LandType`, `BusinessType` | Contract-controlled strings; use the exact Appendix A value list in the server mapper, not an agent-entered portal enum. |
| Building-quality choices | `RoofType`, `Finishes` | Roof: Tiles, Slate, Thatch, Other. Finishes: Very High, High, Medium, Budget. |
| Feature flags | All remaining Yes/No attributes in section A | Explicit `Yes` or `No` for the categories that accept the attribute. An omitted Arch9 chip is currently unknown, **not** proof of `No`. |

The contract lists `Borehole` for farms/smallholdings only and `Garden` for residential only; many other feature flags apply to residential and farms/smallholdings but not commercial or land. The exact per-row category is retained in Appendix A and must be encoded in the Phase 3 mapper tests. The `HomeType` values are Duplex, Apartment, House, Cluster, Simplex, Garden Cottage, Duet, Townhouse, Flat, Bachelor Apartment, Loft, Penthouse and Studio Apartment; `FarmType` and `BusinessType` likewise use enumerated values rather than arbitrary text.

## B. Property24 visible features and Arch9 feed outcome

This is a **minimum observed set**, not a complete Property24 feed schema. The [Property24 Faerie Glen listing](https://www.property24.com/for-sale/faerie-glen/pretoria/gauteng/165/117302751) visibly distinguishes Study, Pool, Flatlet, Garden, Fibre Internet, Borehole, Solar Panels and Backup Battery / Inverter. Its detailed page also distinguishes office/study count, braai room, backup water and internet access. The [Property24 Harrismith listing](https://www.property24.com/for-sale/harrismith/harrismith/free-state/10004/117238741) distinguishes Solar Panels from Solar Geyser and a Water Tank from other backup water. The [Property24 Poortview listing](https://www.property24.com/for-sale/poortview/roodepoort/gauteng/749/116137166) visibly includes Generator and Wheelchair Accessible values and a detailed security list. None of these pages proves that the same field can be supplied through the Arch9 feed.

| Property24 visible concept | Arch9 direct-listing choice | P24 feed now | Gap |
| --- | --- | --- | --- |
| Study / office count | Study Yes/No/Unknown; no office count | Text — gap | v55 `propertyFeatures.studies` requires a count; capture and map it. |
| Pool | Pool | Native | Verify portal result. |
| Flatlet | Flatlet | Native | Verify portal result. |
| Garden | Garden | Native | Verify portal result. |
| Fibre Internet | Fibre Yes/No/Unknown | Text — gap | Map v55 `propertyFeatures.internetAccess.fibre`; verify display. |
| Borehole | Borehole Yes/No/Unknown | Text — gap | Map v55 `propertyFeatures.sustainabilityInfo.borehole`; verify display. |
| Solar Panels | Solar panels Yes/No/Unknown | Text — gap | Map v55 `propertyFeatures.sustainabilityInfo.solarPanels`; verify display. |
| Solar Geyser | Solar geyser Yes/No/Unknown | Text — gap | Map v55 `propertyFeatures.sustainabilityInfo.solarGeyser`; verify display. |
| Backup Battery / Inverter | Inverter/battery Yes/No/Unknown | Text — gap | Map v55 `propertyFeatures.sustainabilityInfo.backupBatteryOrInverter`; verify display. |
| Backup Water / Water Tank | Backup water and water tank are separate choices | Text — gap | Map v55 `propertyFeatures.hasBackupWater` and `sustainabilityInfo.waterTank` separately; verify display. |
| Generator | Generator Yes/No/Unknown | Text — gap | Map v55 `propertyFeatures.hasGenerator`; verify display. |
| Wheelchair Accessible | Wheelchair accessible Yes/No/Unknown | Text — gap | Map v55 `propertyFeatures.isWheelchairAccessible`; verify display. |
| Security subfeatures | Gate, alarm, post and fencing captured separately; CCTV/bars not in catalogue | Text — gap | v55 `Tag` includes `SecurityGate`, `AlarmSystem`, `Electricfencing`, `ClosedCircuitTV`, `BurglarBars` and others; map only exact facts. |
| Built-in braai / braai room | Built-in Braai | Text — gap | v55 `Tag.Built_inBraai` exists; determine correct listing `tags`/`featureTags` representation and verify display. |
| Pet friendly | Pet Friendly | Native `petsAllowed` | Confirm portal display. |
| Parking/garage counts | Numeric fields | Native open bays/garages | v55 `parking.carport` is boolean; a count needs a distinct rule. More parking tags exist. |

**Property24 completeness is blocked by implementation, not by a missing schema:** the official v55 OpenAPI now identified from earlier task history defines `PropertyFeatures` and a 374-value `Tag` enum. Extend this table to every relevant native field/tag, map the supported Arch9 facts, and validate against ExDev and controlled live listings. Do not advertise “full Property24 parity” before that.

## C. Current Arch9 choices outside those PP native rows

| Arch9 choice | PP Rev 4.7 structured equivalent | Current two-portal result | Decision needed |
| --- | --- | --- | --- |
| Security | No single generic attribute | Description-only — gap | Use native alarm, access gate, security post and fencing where those specific facts are selected. |
| Solar / Solar System | None listed in PP Rev 4.7 Appendix A | Description-only — gap | Request current PP feed revision and native alternative; do not count text as parity. |
| Backup Power | None listed | Description-only — gap | Equipment types are now captured separately; native mapping remains unverified. |
| Backup Water | None listed | Description-only — gap | Tank/borehole are now captured separately; native mapping remains unverified. |
| Fibre | None listed | Description-only — gap | Request current PP feed revision and native alternative. |
| Entertainment Area | None exact | Description-only | Avoid silently equating to Lapa/Patio. |
| Open-plan Living | None exact | Description-only | Verify portal support. |
| Mountain View | None exact; `ScenicView` is broader | Description-only | Do not auto-map without agent confirmation. |
| New Development | None exact | Description-only | Separate listing/development workflow. |
| Security Estate, Kids Play Area, Walking Trails | None exact | Description-only | Keep as freeform only unless a feed supports it. |

## D. Lifecycle/price actions (separate from property features)

| Agent outcome | Current Arch9 | P24 current mapping | PP current mapping | Gap |
| --- | --- | --- | --- | --- |
| Under offer | Quick action on Overview and Marketing | `Pending` status action | `PendingOffer` status action | Live acceptance/display still to verify. |
| Sold | Quick action on Overview and Marketing | `Sold` status update | `Sold` status update | Controlled portal acceptance and public display pending. |
| Price reduced | Quick action records old/new; banner control remains unavailable | Sends price update; no native badge field mapped | Sends price update; no native badge field mapped | Do not claim a reduced-price badge until both contracts and portal pages confirm it. |

## Completion criteria for parity work

1. Use the now-located Property24 v55 OpenAPI and the attached Private Property Rev 4.7 feed contract; confirm PP Rev 4.7 is still current. Add every relevant feature with portal name, type, allowed values, applicable categories, and evidence source.
2. Approve a canonical Arch9 feature catalogue with stable keys, boolean/count/enum values, applicability, and a deliberate `Unknown` state. Group the long UI list by Rooms, Parking, Outdoor, Security, Energy/Water, Connectivity, Accessibility, and Specialist features.
3. Make direct listing and Listing Content edit use the same catalogue. Preserve existing selections and seller/rental data; do not silently reinterpret generic labels.
4. Map supported fields to structured P24/PP payloads. Where a portal lacks a verified inbound field, show a **native-feature gap** (description-only if applicable), not a successful channel mapping. Reject unsupported values that would misrepresent the property.
5. Add fixture tests for **every** canonical key and both portal outputs, plus category boundaries and yes/no/unknown semantics. Then verify representative controlled listings through portal previews, accepted feed responses, and the actual public pages.

Focused audit checks (2026-09-24): `node scripts/property24-phase2-mapper.test.mjs`, `node scripts/private-property-listing-preview.test.mjs`, and `node scripts/listing-quick-actions-phase4.test.mjs` all pass. They validate the present mapping, **not** parity.
