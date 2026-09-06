export type RecordValue = Record<string, unknown>;

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
