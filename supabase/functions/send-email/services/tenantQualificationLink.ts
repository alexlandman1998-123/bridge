import type { SupabaseClient } from "supabase";

type Input = { organisationId: string; leadId: string; to: string; recipientName: string; organisationName: string; agentName: string; agentEmail: string };

export async function createTenantQualificationLink(client: SupabaseClient | undefined, input: Input) {
  if (!client) throw new Error("Tenant qualification service is unavailable.");
  const lead = await client.from("leads")
    .select("lead_id,contact_id,lead_domain,status,enquired_listing_id,listing_id,raw_enquiry_payload")
    .eq("organisation_id", input.organisationId).eq("lead_id", input.leadId).maybeSingle();
  if (lead.error || !lead.data || lead.data.lead_domain !== "agency") throw new Error("Tenant lead is unavailable.");
  const raw = lead.data.raw_enquiry_payload || {};
  const rental = raw.rentalCrm || raw.rental_crm || raw;
  if (["lost", "closed", "archived", "deleted", "converted", "cancelled", "canceled"].includes(String(lead.data.status || "").toLowerCase()) ||
    (rental.outcome?.status && rental.outcome.status !== "open")) throw new Error("Tenant lead is closed.");
  const contact = await client.from("contacts").select("email")
    .eq("organisation_id", input.organisationId).eq("contact_id", lead.data.contact_id).maybeSingle();
  if (contact.error || String(contact.data?.email || "").trim().toLowerCase() !== input.to.toLowerCase()) {
    throw new Error("The qualification recipient must match the tenant lead.");
  }
  const listingId = lead.data.enquired_listing_id || lead.data.listing_id || rental.relationships?.listingId;
  let properties: { id: string; title: string }[] = [];
  if (listingId && /^[0-9a-f-]{36}$/i.test(listingId)) {
    const listing = await client.from("private_listings").select("id,title")
      .eq("organisation_id", input.organisationId).eq("id", listingId).maybeSingle();
    if (listing.error) throw new Error("The rental property could not be loaded.");
    if (listing.data) properties = [{ id: listing.data.id, title: listing.data.title || "Your rental enquiry" }];
  }
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  const tokenHash = btoa(String.fromCharCode(...digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  const result = await client.from("buyer_viewing_preference_links").insert({
    organisation_id: input.organisationId, lead_id: input.leadId,
    contact_email: input.to, buyer_name: input.recipientName,
    organisation_name: input.organisationName, agent_name: input.agentName, agent_email: input.agentEmail || null,
    token_hash: tokenHash, selected_property_ids: properties.map((property) => property.id), properties,
    response: { enquiryKind: "rental" }, expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
  });
  if (result.error) throw new Error("The tenant qualification link could not be created.");
  const configuredOrigin = Deno.env.get("PUBLIC_APP_URL") || Deno.env.get("CLIENT_APP_URL") || Deno.env.get("SITE_URL") || "https://app.arch9.co.za";
  const parsedOrigin = new URL(configuredOrigin);
  if (parsedOrigin.protocol !== "https:" && parsedOrigin.hostname !== "localhost" && parsedOrigin.hostname !== "127.0.0.1") throw new Error("Invalid application origin.");
  const origin = parsedOrigin.origin;
  return `${origin}/viewing-preferences/${encodeURIComponent(token)}`;
}
