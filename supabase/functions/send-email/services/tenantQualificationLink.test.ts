import { assertEquals, assert, assertRejects } from "jsr:@std/assert@1";
import type { SupabaseClient } from "supabase";
import { createTenantQualificationLink } from "./tenantQualificationLink.ts";
const input = { organisationId: "org", leadId: "lead", to: "tenant@example.test", recipientName: "Tenant", organisationName: "Rental agency", agentName: "Agent", agentEmail: "agent@example.test" };
function fixture({ email = input.to, status = "New Lead", listingId = "", error = false } = {}) {
  const calls: string[] = [];
  const inserts: any[] = [];
  const client = { from(table: string) {
    calls.push(table);
    return {
      select() { return this; },
      eq(column: string, value: string) { calls.push(`${table}:${column}=${value}`); return this; },
      async maybeSingle() {
        return { data: table === "leads" ? { lead_domain: "agency", status, contact_id: "contact", enquired_listing_id: listingId, raw_enquiry_payload: {} }
          : table === "contacts" ? { email } : { id: listingId, title: "Rental property" }, error: null };
      },
      async insert(value: unknown) { inserts.push(value); return { error: error ? { message: "fixture failure" } : null }; },
    };
  } } as unknown as SupabaseClient;
  return { client, calls, inserts };
}
Deno.test("acknowledgement generates a scoped expiring hashed tenant link even without a local property", async () => {
  const { client, calls, inserts } = fixture();
  const url = await createTenantQualificationLink(client, input);
  const token = url.split("/").at(-1)!;
  assert(/^[a-f0-9]{64}$/.test(token));
  assertEquals(inserts[0].response.enquiryKind, "rental");
  assertEquals(inserts[0].selected_property_ids, []);
  assert(inserts[0].token_hash !== token);
  assert(new Date(inserts[0].expires_at).getTime() > Date.now());
  assert(calls.includes("leads:organisation_id=org"));
  assert(calls.includes("contacts:organisation_id=org"));
  assertEquals(inserts[0].contact_email, input.to);
});
Deno.test("links use only properties in the tenant organisation", async () => {
  const listingId = "11111111-1111-4111-8111-111111111111";
  const { client, calls, inserts } = fixture({ listingId });
  await createTenantQualificationLink(client, input);
  assert(calls.includes("private_listings:organisation_id=org"));
  assertEquals(inserts[0].selected_property_ids, [listingId]);
});
Deno.test("recipient mismatch, closed lead, storage failure and unavailable service cannot create a sendable link", async () => {
  for (const options of [{ email: "other@example.test" }, { status: "Lost" }, { error: true }]) {
    await assertRejects(() => createTenantQualificationLink(fixture(options).client, input));
  }
  await assertRejects(() => createTenantQualificationLink(undefined, input));
});
