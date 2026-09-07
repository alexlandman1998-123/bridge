# Kingdom Real Estate — Phase 0 site brief

## Purpose

Create Kingdom Real Estate's first Arch9-managed public website using the Home Seekers design system as the base. This is a configured agency instance, not a separate bespoke codebase.

This brief deliberately covers the website definition only. It does not publish a site, connect a custom domain, redirect the current site, alter DNS, or change email records.

## Source inventory

The public source reviewed on 6 September 2026 is <https://www.kingdomrealestate.co.za/>.

| Item | Phase 0 decision |
| --- | --- |
| Public brand | Kingdom Real Estate |
| Current visual direction | Black/charcoal framing, white content surfaces and Kingdom red as the primary action colour (`#ed3237`). |
| Current logo | Use the agency-approved logo from the existing site/organisation branding; retain light and dark variants when available. |
| Public contact email | `info@kingdomrealestate.co.za` |
| Public contact phone | `072 696 2004` |
| Existing core navigation | Home, About us, Listings, Get in touch, Property Alerts Signup. |
| Legal content to preserve | Privacy & Cookies, Terms & Conditions, information request/opt-out language, PPRA registration and the existing property-information disclaimer. |
| Existing property content | Current public listings are a reference only. The Arch9 site will source public properties from Kingdom's CRM publication controls. |

## Template mapping

The Home Seekers experience remains recognisable in structure and interaction, but all Home Seekers names, promises, imagery, locations and copy are replaced with Kingdom-approved content.

| Home Seekers pattern | Kingdom implementation |
| --- | --- |
| Editorial hero and property search | Kingdom hero with sales/rental search and two clear paths: browse property or request a valuation. |
| Featured property collection | CRM-published Kingdom listings only. |
| Local-area exploration | Kingdom service areas, populated after the first CRM listing inventory is reviewed. |
| Seller promise / valuation page | Kingdom valuation proposition; no 45-day promise is carried over unless Kingdom expressly approves it. |
| Our people | Kingdom agents and principals sourced from the CRM/agency record. |
| Contact and enquiry page | Kingdom contact details and CRM lead form. |
| Editorial footer | Kingdom contact, legal links, POPIA wording, PPRA status and Arch9 attribution where commercially approved. |

## First-release information architecture

The initial release is limited to the following pages. This is deliberately sufficient for an agency site without committing to development, news or area-guide modules before they have approved content.

1. **Home** — hero, search, featured listings, agency introduction and valuation call to action.
2. **Properties** — sale and rental search/filter results.
3. **Property detail** — CRM-fed property media, facts, agent/contact call to action and enquiry form.
4. **Sell / valuation** — Kingdom seller proposition and valuation request form.
5. **About / Our people** — agency story, local positioning and team.
6. **Contact** — direct contact details and general enquiry form.
7. **Privacy & cookies** and **Terms & conditions** — carried across from the existing approved material and reviewed before launch.

## Content rules

- Existing Kingdom factual and legal copy may be used as the starting point, then edited for the new page layouts.
- New marketing claims, service guarantees, testimonials, team biographies and suburb claims require Kingdom approval before publication.
- Do not copy Home Seekers' 45-day guarantee, Gauteng references, imagery or fictional agent data.
- The website should use licensed Kingdom assets or explicitly approved stock imagery only.
- All public listing data, agent data and lead destinations must remain organisation-scoped to Kingdom Real Estate.

## Success criteria for the next phase

Phase 1 can begin when the Home Seekers components are represented as configurable public-site blocks with no Kingdom-specific hard-coding. Kingdom's first configuration will then provide the brand, copy and page content.

## Release boundary

Until the final production-launch phase, Kingdom uses a private preview hostname only. `kingdomrealestate.co.za` remains on its current website, and no nameserver, MX, SPF, DKIM or DMARC record may be changed as part of this work.
