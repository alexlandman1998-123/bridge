import { isSupabaseConfigured, supabase } from "../../lib/supabaseClient.js";
import {
  createRentalPropertyLandlordPayload,
  createRentalPropertyMandatePayload,
  mapRentalPropertyLandlord,
  mapRentalPropertyMandate,
  mapRentalPropertyMarketingReadiness,
} from "./rentalLandlordMandateModel.js";
const text = (value) => String(value ?? "").trim();
const LANDLORD_FIELDS =
  "id, organisation_id, property_id, branch_id, party_id, ownership_share, is_primary_contact, relationship_status, effective_from, effective_to, metadata_json, created_at, updated_at";
const MANDATE_FIELDS =
  "id, organisation_id, property_id, branch_id, mandate_status, authority_status, starts_on, ends_on, management_fee_type, management_fee_amount, metadata_json, created_at, updated_at";
function requireClient(client = supabase) {
  if (!isSupabaseConfigured || !client)
    throw new Error("Landlord mandates require Supabase configuration.");
  return client;
}
function unavailable(error = {}) {
  const missing = ["42P01", "PGRST204", "PGRST205"].includes(
    String(error.code || "").toUpperCase(),
  );
  return new Error(
    missing
      ? "Rental landlord and mandate foundation is not yet applied to this environment."
      : error.message || "Rental landlord request failed.",
  );
}
export async function listRentalPropertyLandlords(
  propertyId = "",
  { client = supabase } = {},
) {
  if (!text(propertyId)) return [];
  const result = await requireClient(client)
    .from("rental_property_landlords")
    .select(LANDLORD_FIELDS)
    .eq("property_id", text(propertyId))
    .order("is_primary_contact", { ascending: false })
    .order("created_at");
  if (result.error) throw unavailable(result.error);
  return (result.data || []).map(mapRentalPropertyLandlord);
}
export async function listRentalPropertyOwners(
  organisationId = "",
  { client = supabase } = {},
) {
  const db = requireClient(client);
  if (!text(organisationId)) return [];
  const relationships = await db
    .from("rental_property_landlords")
    .select(LANDLORD_FIELDS)
    .eq("organisation_id", text(organisationId))
    .eq("relationship_status", "active")
    .order("is_primary_contact", { ascending: false })
    .order("created_at");
  if (relationships.error) throw unavailable(relationships.error);
  const mapped = (relationships.data || []).map(mapRentalPropertyLandlord);
  const partyIds = [
    ...new Set(mapped.map((item) => item.partyId).filter(Boolean)),
  ];
  const contacts = partyIds.length
    ? await db
        .from("contacts")
        .select("contact_id, first_name, last_name, email, phone")
        .eq("organisation_id", text(organisationId))
        .in("contact_id", partyIds)
    : { data: [], error: null };
  const contactsById = new Map(
    (contacts.error ? [] : contacts.data || []).map((contact) => [
      text(contact.contact_id),
      contact,
    ]),
  );
  return [
    ...mapped
      .reduce((owners, relationship) => {
        const current = owners.get(relationship.partyId) || {
          partyId: relationship.partyId,
          relationships: [],
        };
        current.relationships.push(relationship);
        owners.set(relationship.partyId, current);
        return owners;
      }, new Map())
      .values(),
  ]
    .map((owner) => {
      const contact = contactsById.get(owner.partyId) || {};
      const metadata = owner.relationships[0]?.raw?.metadata_json || {};
      const contactName = text(
        `${contact.first_name || ""} ${contact.last_name || ""}`,
      );
      return {
        ...owner,
        name:
          contactName ||
          text(metadata.name || metadata.full_name) ||
          `Owner ${owner.partyId.slice(0, 8)}`,
        email: text(contact.email || metadata.email),
        phone: text(contact.phone || metadata.phone),
        primaryPropertyCount: owner.relationships.filter(
          (relationship) => relationship.primaryContact,
        ).length,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
export async function createRentalPropertyLandlord(
  values = {},
  { client = supabase } = {},
) {
  const result = await requireClient(client)
    .from("rental_property_landlords")
    .insert(createRentalPropertyLandlordPayload(values))
    .select(LANDLORD_FIELDS)
    .single();
  if (result.error) throw unavailable(result.error);
  return mapRentalPropertyLandlord(result.data);
}
export async function listRentalPropertyMandates(
  propertyId = "",
  { client = supabase } = {},
) {
  if (!text(propertyId)) return [];
  const result = await requireClient(client)
    .from("rental_property_mandates")
    .select(MANDATE_FIELDS)
    .eq("property_id", text(propertyId))
    .order("created_at", { ascending: false });
  if (result.error) throw unavailable(result.error);
  return (result.data || []).map(mapRentalPropertyMandate);
}
export async function createRentalPropertyMandate(
  values = {},
  { client = supabase } = {},
) {
  const result = await requireClient(client)
    .from("rental_property_mandates")
    .insert(createRentalPropertyMandatePayload(values))
    .select(MANDATE_FIELDS)
    .single();
  if (result.error) throw unavailable(result.error);
  return mapRentalPropertyMandate(result.data);
}
export async function getRentalPropertyMarketingReadiness(
  propertyId = "",
  { client = supabase } = {},
) {
  if (!text(propertyId)) return null;
  const result = await requireClient(client)
    .from("rental_property_marketing_readiness")
    .select("*")
    .eq("property_id", text(propertyId))
    .maybeSingle();
  if (result.error) throw unavailable(result.error);
  return result.data ? mapRentalPropertyMarketingReadiness(result.data) : null;
}
