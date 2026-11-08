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

Deno.test('lost domain creation responses recover the matching provider domain across pages', async () => {
  const { findSendingDomain } = await import('./emailSendingDomain.ts');
  const calls: string[] = [];
  const found = await findSendingDomain({ name: domain.domain_name, resendKey: 'fixture', fetcher: (async (url: any) => {
    calls.push(String(url));
    return Response.json(calls.length === 1 ? {data:[{id:'first',name:'other.test'}],has_more:true} : {data:[{id:'recovered',name:domain.domain_name}],has_more:false});
  }) as typeof fetch });
  assertEquals(found.id,'recovered'); assertEquals(new URL(calls[1]).searchParams.get('after'),'first');
});
Deno.test('provider domain lookup fails closed on provider failure or incomplete pagination', async () => {
  const { findSendingDomain } = await import('./emailSendingDomain.ts');
  for (const response of [new Response('{}',{status:503}),Response.json({data:[],has_more:true})]) {
    await assertRejects(() => findSendingDomain({name:domain.domain_name,resendKey:'fixture',fetcher:(()=>Promise.resolve(response)) as typeof fetch}));
  }
});

Deno.test("DNS proof cannot enable a provider domain whose sending capability is disabled", async () => {
  let saved: any;
  const db = { rpc: (_name: string, args: any) => { saved = args; return { error: null }; } };
  const fetcher = (() => Promise.resolve(Response.json({ id: "provider", name: domain.domain_name, status: "verified", capabilities: { sending: "disabled", receiving: "enabled" }, records: [] }))) as typeof fetch;
  assertEquals(await refreshSendingDomain({ db, domain, resendKey: "test", fetcher }), "failed");
  assertEquals(saved.p_status, "failed");
  assertEquals(saved.p_error.includes("Sending is disabled"), true);
});
