import { assert, assertEquals } from "jsr:@std/assert@1";

let handler: (req: Request) => Promise<Response>;
const serve = Deno.serve;
Deno.serve = ((callback: unknown) => { handler = callback as typeof handler; return {}; }) as typeof Deno.serve;
await import("./index.ts");
Deno.serve = serve;

const org = "11111111-1111-4111-8111-111111111111";
const leadId = "22222222-2222-4222-8222-222222222222";
const propertyId = "44444444-4444-4444-8444-444444444444";
const slots = [1, 2, 3].map((day) => ({ date: `2026-11-0${day}`, startTime: "10:00", endTime: "11:00" }));

async function submit({ linked = false, selectProperty = true, failSave = false, suppliedSlots = slots } = {}) {
  const originalFetch = globalThis.fetch;
  const envKeys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"];
  const originalEnv = envKeys.map((key) => Deno.env.get(key));
  const writes: { path: string; payload: any }[] = [];
  Deno.env.set("SUPABASE_URL", "http://buyer-intro-fixture.invalid");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "fixture-service");
  Deno.env.set("SUPABASE_ANON_KEY", "fixture-anon");
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    assertEquals(url.hostname, "buyer-intro-fixture.invalid", "Never call a live endpoint");
    const path = url.pathname;
    if (init?.method === "PATCH" || init?.method === "POST") {
      const payload = JSON.parse(String(init.body));
      writes.push({ path, payload });
      if (path.endsWith("/leads")) {
        assertEquals(url.searchParams.get("organisation_id"), `eq.${org}`);
        assertEquals(url.searchParams.get("lead_id"), `eq.${leadId}`);
        return Response.json(failSave ? { message: "fixture failure" } : { lead_id: leadId }, { status: failSave ? 400 : 200 });
      }
      if (path.endsWith("/buyer_viewing_preference_links")) return Response.json({ id: "link" });
      if (path.endsWith("/lead_activities")) return Response.json([]);
      throw new Error(`Unexpected write: ${path}`);
    }
    if (path.endsWith("/buyer_viewing_preference_links")) return Response.json({
      id: "33333333-3333-4333-8333-333333333333", organisation_id: org, lead_id: leadId,
      status: "pending", expires_at: "2099-01-01T00:00:00Z", response: { enquiryKind: "sale" },
      properties: linked ? [{ id: propertyId, title: "Buyer property" }] : [],
      selected_property_ids: linked ? [propertyId] : [], contact_email: "", agent_email: "",
    });
    if (path.endsWith("/leads")) return Response.json({
      lead_id: leadId, organisation_id: org, raw_enquiry_payload: { leadIntent: "buy" }, notes: "Existing agent note", stage: "New Lead", status: "New Lead",
    });
    return Response.json(null);
  }) as typeof fetch;
  try {
    const result = await handler(new Request("http://buyer-intro-fixture.invalid", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "submit", token: "a".repeat(64),
        qualificationAnswers: { budget: "2500000", areaInterest: "Newlands" },
        availabilitySlots: suppliedSlots, timezone: "Africa/Johannesburg",
        propertyResponses: linked && selectProperty ? [{ propertyId, wantsToView: true }] : [],
      }),
    }));
    return { status: result.status, data: await result.json(), writes };
  } finally {
    globalThis.fetch = originalFetch;
    envKeys.forEach((key, index) => originalEnv[index] === undefined ? Deno.env.delete(key) : Deno.env.set(key, originalEnv[index]!));
  }
}

Deno.test("automatic buyer form saves qualification and all three requested times to the lead with or without a property", async () => {
  for (const linked of [true, false]) {
    const result = await submit({ linked });
    assertEquals(result.status, 200);
    const saved = result.writes.find((write) => write.path.endsWith("/leads"))!.payload;
    assert(saved.notes.includes("Existing agent note"));
    assert(saved.notes.includes("Newlands"));
    for (const slot of slots) assert(saved.notes.includes(slot.date));
    assertEquals(result.data.session.response.buyerIntake.viewing.availabilitySlots.length, 3);
    assertEquals(result.data.session.status, "submitted");
    assertEquals(result.writes.find((write) => write.path.endsWith("/buyer_viewing_preference_links"))!.payload.status, "submitted");
  }
});

Deno.test("buyer forms keep property selection and three time options required", async () => {
  for (const options of [{ linked: true, selectProperty: false }, { suppliedSlots: slots.slice(0, 1) }]) {
    const result = await submit(options);
    assertEquals(result.status, 400);
    assertEquals(result.writes.length, 0);
  }
});

Deno.test("a failed lead save never reports success or closes the buyer form", async () => {
  const result = await submit({ failSave: true });
  assertEquals(result.status, 500);
  assertEquals(result.data.code, "lead_save_failed");
  assert(!result.writes.some((write) => write.path.endsWith("/buyer_viewing_preference_links")));
});
