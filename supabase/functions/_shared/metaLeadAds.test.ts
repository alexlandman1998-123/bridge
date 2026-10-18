import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import { loadMetaPageForms, assertMetaLeadContext, contactFromFields, hmacValid, leadFields, leadgenChanges, metaLeadDestination, metaLeadType } from "./metaLeadAds.ts";

Deno.test("keeps Buyer, Seller and Recruitment destinations separate and rejects invalid results", () => {
  assertEquals(metaLeadType("recruitment"), "recruitment");
  assertEquals(metaLeadType(undefined), "buyer");
  assertThrows(() => metaLeadType("unknown"));
  for (const kind of ["buyer", "seller"]) assertEquals(metaLeadDestination({lead_type:kind,crm_lead_id:"crm-id"}), {lead_type:kind,crm_lead_id:"crm-id",recruitment_lead_id:null});
  assertEquals(metaLeadDestination({lead_type:"recruitment",recruitment_lead_id:"recruit-id"}), {lead_type:"recruitment",crm_lead_id:null,recruitment_lead_id:"recruit-id"});
  for (const value of [{}, {crm_lead_id:"missing-type"}, {lead_type:"recruitment",crm_lead_id:"wrong"}, {lead_type:"buyer",recruitment_lead_id:"wrong"}, {lead_type:"recruitment",recruitment_lead_id:"a",crm_lead_id:"b"}]) assertThrows(() => metaLeadDestination(value));
});

Deno.test("extracts leadgen notifications and ignores other Page changes", () => {
  assertEquals(leadgenChanges({entry:[{id:"page-1",changes:[{field:"feed",value:{}},{field:"leadgen",value:{leadgen_id:"lead-1",form_id:"form-1",page_id:"page-1"}}]}]}),[
    {leadgenId:"lead-1",formId:"form-1",pageId:"page-1",raw:{leadgen_id:"lead-1",form_id:"form-1",page_id:"page-1"}},
  ]);
});

Deno.test("maps standard and custom fields without dropping raw values", () => {
  const fields=leadFields([{name:"full_name",values:["Ada Lovelace"]},{name:"email",values:["ADA@example.com"]},{name:"phone_number",values:["+27 82 000 0000"]},{name:"preferred_area",values:["Sandton","Rosebank"]}]);
  assertEquals(contactFromFields(fields),{fullName:"Ada Lovelace",email:"ADA@example.com",phone:"+27 82 000 0000"});
  assertEquals(fields.preferred_area,"Sandton, Rosebank");
});

Deno.test("validates Meta sha256 signatures", async () => {
  const raw='{"object":"page"}',secret="test-app-secret";
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const bytes=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(raw)));
  const signature=`sha256=${[...bytes].map(v=>v.toString(16).padStart(2,"0")).join("")}`;
  assertEquals(await hmacValid(raw,signature,secret),true);
  assertEquals(await hmacValid(raw+"x",signature,secret),false);
});

Deno.test("campaign routing accepts only the retrieved lead and form context", () => {
  assertMetaLeadContext({id:"100",form_id:"200",campaign_id:"300"},"100","200");
  assertMetaLeadContext({id:"100"},"100","200");
  assertThrows(()=>assertMetaLeadContext({id:"999",form_id:"200"},"100","200"));
  assertThrows(()=>assertMetaLeadContext({id:"100",form_id:"999"},"100","200"));
  assertThrows(()=>assertMetaLeadContext({id:"100",campaign_id:"seller campaign"},"100","200"));
});

Deno.test("Page form selection loads all pages without following provider URLs", async () => {
  const paths:string[]=[];
  const forms=await loadMetaPageForms("300","test-token",async(path,token)=>{
    paths.push(path);assertEquals(token,"test-token");
    return paths.length===1?{data:[{id:"400",name:"First"}],paging:{next:"https://untrusted.example/ignored",cursors:{after:"next & cursor"}}}:{data:[{id:"401",name:"Second"}]};
  });
  assertEquals(forms.map(form=>form.id),["400","401"]);
  assertEquals(paths[1],"300/leadgen_forms?fields=id,name,status&limit=200&after=next%20%26%20cursor");
});
Deno.test("incomplete or unbounded Page form lists cannot be saved as partial selections", async () => {
  await assertRejects(()=>loadMetaPageForms("300","test",async()=>({data:[],paging:{next:"next",cursors:{}}})));
  let calls=0;
  await assertRejects(()=>loadMetaPageForms("300","test",async()=>{calls++;return {data:[],paging:{next:"next",cursors:{after:String(calls)}}}}));
  assertEquals(calls,5);
});
