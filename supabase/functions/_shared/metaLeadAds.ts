export type RecordValue = Record<string, unknown>;

export function metaLeadType(value: unknown): string {
  const kind = text(value) || "buyer";
  if (!["buyer", "seller", "recruitment"].includes(kind)) throw new Error("Choose Buyer, Seller or Recruitment.");
  return kind;
}

export function metaLeadDestination(value: unknown) {
  const result = (value || {}) as RecordValue;
  if (!text(result.lead_type)) throw new Error("Meta ingestion did not return a lead type.");
  const kind = metaLeadType(result.lead_type);
  const crmId = text(result.crm_lead_id) || null;
  const recruitmentId = text(result.recruitment_lead_id) || null;
  if (kind === "recruitment" ? !recruitmentId || crmId : !crmId || recruitmentId) {
    throw new Error("Meta ingestion did not return a valid lead destination.");
  }
  return { lead_type: kind, crm_lead_id: crmId, recruitment_lead_id: recruitmentId };
}

export function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
export function leadFields(fieldData: unknown) {
  const result: Record<string, string> = {};
  for (const item of Array.isArray(fieldData) ? fieldData : []) {
    const row = item && typeof item === "object" ? item as RecordValue : {};
    const key = text(row.name).toLowerCase();
    const values = Array.isArray(row.values) ? row.values : [];
    if (key) result[key] = values.map(text).filter(Boolean).join(", ");
  }
  return result;
}
export function contactFromFields(fields: Record<string, string>) {
  const first = fields.first_name || ""; const last = fields.last_name || "";
  return {
    fullName: fields.full_name || fields.name || [first, last].filter(Boolean).join(" ") || "Meta Lead",
    email: fields.email || fields.email_address || "",
    phone: fields.phone_number || fields.phone || fields.mobile_number || "",
  };
}
export function leadgenChanges(payload: RecordValue) {
  const output: Array<{leadgenId:string;pageId:string;formId:string;raw:RecordValue}> = [];
  for (const entry of Array.isArray(payload.entry) ? payload.entry as RecordValue[] : []) {
    for (const change of Array.isArray(entry.changes) ? entry.changes as RecordValue[] : []) {
      if (text(change.field) !== "leadgen") continue;
      const value = change.value && typeof change.value === "object" ? change.value as RecordValue : {};
      const leadgenId=text(value.leadgen_id), pageId=text(value.page_id)||text(entry.id), formId=text(value.form_id);
      if (leadgenId && pageId && formId) output.push({leadgenId,pageId,formId,raw:value});
    }
  }
  return output;
}
export async function hmacValid(raw:string, signature:string, secret:string) {
  if (!/^sha256=[a-f0-9]{64}$/i.test(signature) || !secret) return false;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const digest=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(raw)));
  const expected=`sha256=${[...digest].map(v=>v.toString(16).padStart(2,"0")).join("")}`;
  if (expected.length!==signature.length) return false;
  let diff=0; for(let i=0;i<expected.length;i++) diff|=expected.charCodeAt(i)^signature.toLowerCase().charCodeAt(i);
  return diff===0;
}

export function assertMetaLeadContext(detail: RecordValue, leadgenId: string, formId: string) {
  if (text(detail.id) !== leadgenId || (text(detail.form_id) && text(detail.form_id) !== formId)) throw new Error("Meta returned a lead for a different form or lead ID.");
  if (text(detail.campaign_id) && !/^[0-9]{1,30}$/.test(text(detail.campaign_id))) throw new Error("Meta returned an invalid campaign ID.");
}

export async function loadMetaPageForms(pageId:string,token:string,request:(path:string,token:string)=>Promise<RecordValue>){
  const rows:RecordValue[]=[];let after="";
  for(let page=0;page<5;page++){
    const response=await request(`${pageId}/leadgen_forms?fields=id,name,status&limit=200${after?`&after=${encodeURIComponent(after)}`:""}`,token);
    rows.push(...(Array.isArray(response.data)?response.data as RecordValue[]:[]));const paging=response.paging as RecordValue|undefined;after=text((paging?.cursors as RecordValue)?.after);
    if(!paging?.next)return rows;if(!after||after.length>1000)throw new Error("The full Page form list could not be verified.");
  }
  throw new Error("The full Page form list could not be verified. Reduce the active form library before saving routes.");
}
