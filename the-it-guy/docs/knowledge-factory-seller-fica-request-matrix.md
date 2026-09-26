# Seller FICA: Knowledge Factory request matrix

Status: discovery specification, **not** an executable supplier query or a compliance approval. Owner: the primary Arch9 transaction workspace. No paid lookup or personal-data request was made to prepare this matrix.

## What is confirmed

- The existing server-side GraphQL transport authenticates to Knowledge Factory and supports `GraphQL-Cost: validate` (cost without execution) and `GraphQL-Cost: report` (execution). Its only implemented supplier selections are map/property fields; the `fica_kyc` operation name is reserved locally but has no implemented GraphQL query. See `supabase/functions/knowledge-factory-graphql/index.ts`.
- The supplier's email identifies `Owners` and `Sellers` surcharges, **not** the selections or result fields needed to verify a person or legal entity. The publicly available Usage Guide and Cost Specification explain GraphQL transport and credit calculations but do not publish a FICA field catalogue or verification-report contract.
- UAT credential secrets are saved in Arch9 SaaS Supabase, but Supabase exposes only their names/digests to this local session. The local shell has no values, the Vercel copies resolve empty, and the supplier portal is not signed in. Unauthenticated introspection is denied. The approved, service-role-gated `knowledge-factory-fica-discovery` function is deployed on Arch9 SaaS and hard-locks its supplier URL to UAT. On 2026-09-26 its no-credential cost-validation probe received HTTP 403, `text/html`, `server: awselb/2.0`, and an HTML `403 Forbidden` title. A no-credential GET to the public supplier portal from the same function received the same HTTP 403 and HTML content type. From the local machine, the identical UAT probe returned HTTP 200 with GraphQL JSON, and the portal returned HTTP 200 with HTML. Because neither blocked request used supplier credentials, a wrong password does not explain this 403. The differing host paths point to an outbound-network/access-control issue; whether the supplier's load balancer/WAF or an intervening control generated it needs log confirmation. No FICA supplier field name, result semantics, or quote is confirmed below.
- `sellerFicaScopeModel.js` identifies local seller types and role-players to assess. It is a collection model, not proof that every named role must receive every paid check. Final scope follows the agency's RMCP and compliance review.

## Request manifest to resolve against the supplier schema

“Requested fact” is a business requirement, **not** a proposed GraphQL field name. Discovery must record the exact root field, input argument, output path, source, freshness, matching confidence, errors and whether it is independently verifiable.

| Subject / route | Local input for matching | Requested supplier fact or result | Current mapping |
| --- | --- | --- | --- |
| Each natural-person legal owner or co-owner | Full legal name; SA ID or passport; nationality/jurisdiction; residential address where applicable | Identity attributes from an authoritative source, identity match outcome and provenance; address corroboration if offered | No supplier selection confirmed |
| Each natural person included by the approved company/trust scope | Same identifying inputs; role in seller entity | Individual identity/match outcome; sanctions and PEP screening results *if the schema and licence provide these* | No supplier selection confirmed |
| Company / close corporation seller | Registered legal name; registration number; jurisdiction; registered address | Registration/existence/status, registered address, ownership/control data and source/date | No supplier selection confirmed; `Owners`/`Sellers` product labels alone are insufficient |
| Trust seller | Trust name; Master’s reference; jurisdiction; address where applicable | Trust existence/status, trustees/authority and beneficial-ownership data if offered, with source/date | No supplier selection confirmed |
| Representative signing for an entity or trust | Natural-person identity plus claimed role | Identity result and, separately, evidence that the person may bind the seller | No supplier selection confirmed; authority may require documentary review |
| Property context | Property identifier or address, used only when relevant | Link between property and recorded owner/seller, with source/date | `propertyById` property details are implemented locally, but no ownership-verification selection is confirmed |

For companies, identify the ultimate natural-person beneficial owners and control structure. For trusts, establish the relevant founder, trustee, beneficiary/beneficial-owner and acting-representative structure. Do not infer identity or authority solely from a property-owner name. Do not automatically charge every director, trustee or beneficiary for every check: the compliance officer must resolve the in-scope natural persons, including duplicates, under the RMCP.

## Outcome mapping required before showing “verified”

| UI check | Supplier evidence required | If absent or ambiguous |
| --- | --- | --- |
| Identity | Named source, subject match attributes, result status, reference and timestamp | `Not run` or `Review required`, never `Verified` |
| Address | Address match/verification result and source, or independently reviewed evidence | `Not run` / `Review required` |
| Sanctions | Named list coverage, screened subject, match result, list/version date, reference | `Not run` / `Potential match` for human review |
| PEP | Coverage, screened subject, result, match confidence, reference | `Not run` / `Potential match` for human review |
| Risk | Arch9 RMCP assessment with reasons, reviewer and date; supplier signals may inform it | No automatic FICA approval from a supplier score |

A downloadable FICA pack must combine the provider evidence actually available, collection documents and the compliance review. Whether Knowledge Factory supplies a report document or only structured data remains unconfirmed. A successful GraphQL response alone must not mark the entire seller FICA verified.

## Discovery and cost-only validation sequence

1. Obtain authenticated **UAT** schema access or an official supplier field catalogue. Record exact selection/input/output paths for each row above. Verify which fields represent raw property data versus independent identity, sanctions, PEP or entity verification. Record unsupported requirements explicitly; use another approved source or manual evidence for those.
   - Current blocker: ask Knowledge Factory to check its load-balancer/WAF logs for the Supabase-originated 403 and confirm any supported server-side egress/allowlist route. Supabase Edge Functions do not have stable outbound IPs, so an approved fixed-egress proxy may be needed if IP allowlisting is required. An authenticated portal schema export is a parallel read-only route. Do not work around supplier access controls.
2. Construct the smallest query set by seller route (individual, co-owners, company/CC, trust). Parameterise seller identifiers server-side. Never send unnecessary personal data or arbitrary browser-authored GraphQL.
3. With no customer record submitted, validate the query shape in UAT. Then run `GraphQL-Cost: validate` for each approved query and record `fieldCost`, `typeCost`, `priceSurcharge`, `creditsConsumed`, schema version and timestamp. Confirm with the supplier whether validation itself is unbilled and whether any per-subject or per-result surcharge applies.
4. Price a case using the **actual set of unique in-scope subjects and queries**, not one fixed seller price: `case credits = entity-query credits + sum(unique person-query credits) + any other required query credits`. The email's conversion is 4,000 credits/R on subscription or 3,000 credits/R prepaid; the separate complexity allowance may affect the invoice. Quote a range/maximum before execution and require explicit approval for reruns or added subjects.
5. Only after the fields, costs, consent/legal basis and result interpretation are approved, run controlled UAT reports with authorised test subjects. Capture redacted response examples, errors, report availability and audit references. Keep production disabled until reviewed.

## Supplier questions needed to close this matrix

- Which exact GraphQL selections and filters return person identity corroboration, company/trust registration and beneficial ownership, sanctions and PEP outcomes? Which are merely owner/property data?
- What is the matching method, source, freshness, list coverage and status meaning for each result? Are foreign ID/passport and foreign entities supported?
- Is a downloadable verification report or certificate returned? If yes, through which field/URL and with what retention rights?
- What are the exact per-selection costs, surcharges, per-person billing rules, validation cost and complexity treatment in UAT and explicit production version `v0_1`?

References: [Knowledge Factory Usage Guide](https://new.propertyintellect.co.za/graphql/portal/downloads/graphql-usage-guide.pdf), [Cost Specification](https://new.propertyintellect.co.za/graphql/portal/downloads/graphql-cost-specification.pdf), [FIC Guidance Note 7A](https://www.fic.gov.za/wp-content/uploads/2025/09/Revised-Guidance-Note-7A-%E2%80%93-Implementation-of-various-aspects-of-the-FIC-Act.pdf), [FIC PCC 59](https://www.fic.gov.za/wp-content/uploads/2024/08/PCC-59-Beneficial-ownership.pdf).
