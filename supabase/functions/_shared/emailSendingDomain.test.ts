import { assertEquals, assertRejects } from "jsr:@std/assert";
import { refreshSendingDomain, sendingDomainRecords } from "./emailSendingDomain.ts";
const domain = { id: "domain", domain_name: "updates.agency.co.za", provider_domain_id: "provider", verification_status: "pending" };
Deno.test("provider verification is saved through the atomic, service-only status function", async () => {
  const calls: any[] = [];
  const db = { rpc: (name: string, args: any) => { calls.push({ name, args }); return { error: null }; } };
  const fetcher = (() => Promise.resolve(Response.json({ id: "provider", name: domain.domain_name, status: "verified", records: [] }))) as typeof fetch;
  assertEquals(await refreshSendingDomain({ db, domain, resendKey: "test", fetcher }), "verified");
  assertEquals(calls, [{ name: "email_apply_domain_status", args: { p_domain_id: "domain", p_status: "verified", p_records: [], p_error: null } }]);
});
Deno.test("stale events cannot verify a different provider domain and storage failures propagate", async () => {
  const db = { rpc: () => ({ error: new Error("storage unavailable") }) };
  for (const payload of [{ id: "wrong", name: domain.domain_name, status: "verified" }, { id: "provider", name: "another-agency.co.za", status: "verified" }]) {
    await assertRejects(() => refreshSendingDomain({ db, domain, resendKey: "test", fetcher: (() => Promise.resolve(Response.json(payload))) as typeof fetch }), Error, "does not match");
  }
  await assertRejects(() => refreshSendingDomain({ db, domain, resendKey: "test", fetcher: (() => Promise.resolve(Response.json({ id: "provider", name: domain.domain_name, status: "verified" }))) as typeof fetch }), Error, "Unable to save");
});
Deno.test("disabled domains are preserved and DNS record priorities stay accurate", async () => {
  assertEquals(await refreshSendingDomain({ db: null, domain: { ...domain, verification_status: "disabled" }, resendKey: "" }), "disabled");
  assertEquals(sendingDomainRecords([{ name: "resend._domainkey", type: "TXT", value: "dns", priority: null }])[0].priority, null);
});

Deno.test("a deleted provider domain invalidates the cached proof", async () => {
  let saved: any;
  const db = { rpc: (_name: string, args: any) => { saved = args; return { error: null }; } };
  assertEquals(await refreshSendingDomain({ db, domain, resendKey: "test", fetcher: (() => Promise.resolve(new Response(null, { status: 404 }))) as typeof fetch }), "failed");
  assertEquals(saved.p_status, "failed");
});
