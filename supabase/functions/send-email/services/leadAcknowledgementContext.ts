import type { SupabaseClient } from "supabase";

export type LeadEnquiryKind = "sale" | "rental" | "landlord" | "general";

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
function key(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function leadEnquiryKind(
  metadata: unknown,
  listingType: unknown = "",
): LeadEnquiryKind {
  const raw = object(metadata);
  const rental = object(raw.rentalCrm || raw.rental_crm || raw);
  const intent = key(raw.leadIntent || object(raw.attribution).leadIntent);
  const classifiedRental = rental.arch9RentalLead === true ||
    key(rental.classification) === "rental" ||
    key(rental.leadType || rental.lead_type) === "rental";
  if (
    intent === "let" || (classifiedRental && key(rental.role) === "landlord")
  ) return "landlord";
  if (classifiedRental || intent === "rent" || key(listingType) === "rental") {
    return "rental";
  }
  if (intent === "buy" || key(listingType) === "sale") return "sale";
  return "general";
}

// Read the saved record: intake callers do not all supply rental intent, and
// lead_category=buyer also represents tenants in the shared CRM schema.
export async function resolveLeadEnquiryKind(
  client: SupabaseClient | undefined,
  organisationId: string,
  leadId: string,
): Promise<LeadEnquiryKind> {
  if (!client || !organisationId || !leadId) return "general";
  try {
    const lead = await client.from("leads")
      .select("raw_enquiry_payload,listing_id,enquired_listing_id")
      .eq("organisation_id", organisationId).eq("lead_id", leadId)
      .maybeSingle();
    if (lead.error || !lead.data) return "general";
    const kind = leadEnquiryKind(lead.data.raw_enquiry_payload);
    if (kind === "rental" || kind === "landlord") return kind;
    const listingId = lead.data.enquired_listing_id || lead.data.listing_id;
    if (!listingId) return kind;
    const listing = await client.from("private_listings").select(
      "id,listing_category",
    )
      .eq("organisation_id", organisationId).eq("id", listingId).maybeSingle();
    if (listing.error || !listing.data) return "general";
    if (key(listing.data.listing_category) === "rental") return "rental";
    const publication = await client.from("listing_publication_data").select(
      "listing_type",
    )
      .eq("listing_id", listingId).maybeSingle();
    if (publication.error) return "general";
    return leadEnquiryKind(
      lead.data.raw_enquiry_payload,
      publication.data?.listing_type,
    );
  } catch {
    // A failed read must never turn an unclassified tenant into a buyer.
    return "general";
  }
}
