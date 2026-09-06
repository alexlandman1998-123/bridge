import { assertEquals } from "jsr:@std/assert@1";
import { contactFromFields, hmacValid, leadFields, leadgenChanges } from "./metaLeadAds.ts";

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
