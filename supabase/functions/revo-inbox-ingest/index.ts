import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "supabase"

const REVO_ORGANISATION_ID = "322c3853-2d82-4413-97e6-b4cd8bc32a7c"
const text = (value: unknown) => String(value ?? "").trim()
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

function serviceClient() {
  const url = text(Deno.env.get("SUPABASE_URL"))
  const key = text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))
  if (!url || !key) throw new Error("server_unavailable")
  return createClient(url, key, { auth: { persistSession: false } })
}

function validSource(value: unknown) {
  const source = text(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
  if (source === "p24") return "property24"
  if (source === "privateproperty") return "private_property"
  if (["website", "property24", "private_property"].includes(source)) return source
  throw new Error("invalid_source")
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" })
  try {
    const expectedKey = text(Deno.env.get("REVO_INBOX_INGEST_KEY"))
    if (!expectedKey || request.headers.get("x-revo-inbox-ingest-key") !== expectedKey) return json(401, { error: "unauthorised" })
    const body = await request.json()
    const organisationId = text(body.organisationId || body.organisation_id)
    if (organisationId !== REVO_ORGANISATION_ID) return json(403, { error: "revo_only" })
    const source = validSource(body.source || body.sourceChannel)
    const externalReference = text(body.externalReference || body.external_reference || body.enquiryId || body.id)
    if (!externalReference) return json(422, { error: "external_reference_required" })
    const routing = body.routing && typeof body.routing === "object" ? body.routing : {}
    const db = serviceClient()
    const result = await db.rpc("revo_ingest_external_enquiry", {
      p_organisation_id: organisationId,
      p_source_channel: source,
      p_external_reference: externalReference,
      p_contact_name: text(body.contactName || body.name),
      p_contact_address: text(body.contactAddress || body.email || body.phone),
      p_subject: text(body.subject || body.propertyTitle) || null,
      p_message_body: text(body.message || body.body || body.enquiry),
      p_listing_id: text(body.listingId || body.listing_id) || null,
      p_lead_id: text(body.leadId || body.lead_id) || null,
      p_assigned_user_id: text(routing.assignedUserId || routing.assigned_user_id) || null,
      p_received_at: body.receivedAt || body.received_at || new Date().toISOString(),
      p_metadata: { sourcePayloadVersion: 1, routingReason: text(routing.reason) || "unassigned" },
    })
    if (result.error) throw result.error
    return json(200, { ingestion: result.data?.[0] || null })
  } catch (error) {
    return json(400, { error: error instanceof Error ? error.message : "ingestion_failed" })
  }
})
