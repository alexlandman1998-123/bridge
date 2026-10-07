import { assertEquals, assert } from "jsr:@std/assert@1";

let handler: (req: Request) => Promise<Response>;
const serve = Deno.serve;
Deno.serve = ((callback: unknown) => { handler = callback as typeof handler; return {}; }) as typeof Deno.serve;
await import("./index.ts");
Deno.serve = serve;

const org = "11111111-1111-4111-8111-111111111111";
const leadId = "22222222-2222-4222-8222-222222222222";
const link = { id: "33333333-3333-4333-8333-333333333333", organisation_id: org, lead_id: leadId,
  status: "pending", expires_at: "2099-01-01T00:00:00Z", response: { enquiryKind: "rental" },
  properties: [], selected_property_ids: [], agent_email: "" };
const raw = { arch9RentalLead: true, classification: "rental", role: "tenant", stage: "new", outcome: { status: "open" } };
const answers = { monthlyBudget: "12000", desiredArea: "Newlands", occupationDate: "2026-11-01", employmentStatus: "Employed", depositAvailable: "Yes", screeningConsent: "No", propertyNeed: "Flat", occupants: "2", pets: "No pets", additionalNotes: "" };
const body = { action: "submit", token: "a".repeat(64), qualificationAnswers: answers,
  availabilitySlots: [{ date: "2026-10-15", startTime: "10:00", endTime: "11:00" }] };

async function run(requestBody: Record<string, unknown>, options: { rpcFailure?: boolean; raw?: unknown; status?: string } = {}) {
  const originalFetch = globalThis.fetch;
  const envKeys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"];
  const originalEnv = envKeys.map((key) => Deno.env.get(key));
  const writes: { path: string; payload: any }[] = [];
  Deno.env.set("SUPABASE_URL", "http://tenant-fixture.invalid");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "fixture-service");
  Deno.env.set("SUPABASE_ANON_KEY", "fixture-anon");
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    assertEquals(url.hostname, "tenant-fixture.invalid", "Never call a live endpoint in this test");
    const path = url.pathname;
    if (init?.method === "POST") {
      writes.push({ path, payload: JSON.parse(String(init.body)) });
      if (path.endsWith("/rpc/rental_submit_tenant_qualification")) return Response.json(options.rpcFailure ? { message: "fixture failure", code: "P0001" } : { submittedAt: "2026-10-07T12:00:00Z" }, { status: options.rpcFailure ? 400 : 200 });
      assert(path.endsWith("/lead_activities"), `Unexpected write: ${path}`);
      return Response.json([]);
    }
    if (path.endsWith("/buyer_viewing_preference_links")) return Response.json([{ ...link, status: options.status || link.status }]);
    if (path.endsWith("/leads")) {
      assertEquals(url.searchParams.get("organisation_id"), `eq.${org}`);
      assertEquals(url.searchParams.get("lead_id"), `eq.${leadId}`);
      return Response.json([{ lead_id: leadId, organisation_id: org, raw_enquiry_payload: options.raw || raw, status: "New Lead", stage: "New Lead" }]);
    }
    return Response.json([]);
  }) as typeof fetch;
  try {
    const response = await handler(new Request("http://tenant-fixture.invalid", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(requestBody) }));
    return { status: response.status, data: await response.json(), writes };
  } finally {
    globalThis.fetch = originalFetch;
    envKeys.forEach((key, index) => originalEnv[index] === undefined ? Deno.env.delete(key) : Deno.env.set(key, originalEnv[index]!));
  }
}

Deno.test("resolve returns the tenant form from persisted classification", async () => {
  const result = await run({ ...body, action: "resolve", enquiryKind: "sale" });
  assertEquals(result.status, 200);
  assertEquals(result.data.session.enquiryKind, "rental");
  assertEquals(result.writes.length, 0);
});
Deno.test("one viewing option and no linked property save to Rentals, never buyer notes or sales stages", async () => {
  const result = await run({ ...body, buyerIntake: { qualification: { budget: "999999" } }, confirmedPropertyIds: ["foreign"] });
  assertEquals(result.status, 200);
  assertEquals(result.data.session.status, "submitted");
  const saved = result.writes[0].payload;
  assertEquals(saved.p_budget, 12000);
  assertEquals(saved.p_next_payload.qualification.desiredArea, "Newlands");
  assertEquals(saved.p_next_payload.consents.screening, "declined");
  assertEquals(saved.p_next_payload.viewingRequest.confirmedPropertyIds, []);
  assertEquals(saved.p_next_payload.viewingRequest.status, "requested");
  assertEquals(saved.p_next_payload.stage, "new");
  assertEquals(saved.p_response.buyerIntake, undefined);
});
Deno.test("RPC failure leaves session open and sends no activity or notifications", async () => {
  const result = await run(body, { rpcFailure: true });
  assertEquals(result.status, 409);
  assertEquals(result.writes.length, 1);
});
Deno.test("closed links, incomplete questions, invalid times and changed role make no writes", async () => {
  for (const [request, options] of [
    [body, { status: "submitted" }],
    [{ ...body, qualificationAnswers: { ...answers, employmentStatus: "" } }, {}],
    [{ ...body, availabilitySlots: [{ date: "2026-10-15", startTime: "25:00", endTime: "26:00" }] }, {}],
    [body, { raw: { ...raw, role: "landlord" } }],
  ] as const) {
    const result = await run(request, options);
    assert(result.status >= 400);
    assertEquals(result.writes.length, 0);
  }
});
