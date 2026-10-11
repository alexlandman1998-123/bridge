import { handleRequirementDelivery } from "./documentRequirementDelivery.ts";
const request = (key = "service") => new Request("https://local.test", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: "{}" });
const target = { to: "real.person@business.org", portalPath: "/client/opaque/selling/documents", label: "Divorce papers" };
const envelope = { from: "Arch9 <mail@arch9.co.za>", to: target.to, portalPath: target.portalPath, subject: "Request", html: "frozen", text: "frozen" };
function fixture({ cancelled = false, waiting = false, frozen = false, uncertain = false } = {}) {
  const calls: any[] = [], sends: any[] = [];
  const client = { rpc(name: string, args: any) {
    calls.push([name,args]);
    if (name === "bridge_claim_requirement_deliveries") return Promise.resolve({data:[{id:"job",claim_token:"claim",envelope:frozen ? envelope : null}],error:null});
    if (name === "bridge_requirement_delivery_target") return Promise.resolve({data:waiting ? null : target,error:null});
    if (name === "bridge_prepare_requirement_delivery") return Promise.resolve({data:cancelled ? null : envelope,error:null});
    return Promise.resolve({data:true,error:null});
  }};
  const options = { client, serviceRoleKey:"service",apiKey:"fake",appUrl:"https://app.arch9.co.za",enabled:true,
    render:async()=>envelope, send:async(args:any)=>{sends.push(args);if(uncertain)throw new Error("lost response");return {ok:true as const,status:200,data:{id:"provider"}}} };
  return {calls,sends,options};
}
function assert(value: unknown) {if(!value)throw new Error("Assertion failed")}
Deno.test("dispatcher refuses unauthenticated calls and honours disabled delivery without claiming",async()=>{
 const f=fixture();assert((await handleRequirementDelivery(request("wrong"),f.options)).status===403);
 await handleRequirementDelivery(request(),{...f.options,enabled:false});assert(f.calls.length===0);
});
Deno.test("dispatcher freezes provider content, uses stable idempotency and records provider acceptance",async()=>{
 const f=fixture({frozen:true});await handleRequirementDelivery(request(),f.options);
 assert(f.sends[0].idempotencyKey==="requirement-request/job");assert(f.sends[0].html==="frozen");
 assert(f.calls.at(-1)[1].p_outcome==="sent");assert(f.calls.at(-1)[1].p_provider_id==="provider");
});
Deno.test("removed requests and missing portals do not send",async()=>{
 for(const setup of [{cancelled:true},{waiting:true}]){const f=fixture(setup);await handleRequirementDelivery(request(),f.options);assert(f.sends.length===0)}
});
Deno.test("uncertain provider outcomes schedule recovery without pretending delivery succeeded",async()=>{
 const f=fixture({uncertain:true});await handleRequirementDelivery(request(),f.options);
 assert(f.calls.at(-1)[1].p_outcome==="retry");assert(!f.calls.at(-1)[1].p_error.includes(target.to));
});
