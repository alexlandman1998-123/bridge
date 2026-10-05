export const signingChecks = [['sameVersion','The signed copy matches the delivered contract version'],['allPages','All contract pages and annexures are included'],['agentSignature','The agent’s signature is complete'],['organisationSignature','The organisation representative’s signature is complete']]
export const deliveryChannels = [['email','Email'],['whatsapp','WhatsApp'],['in_person','In person'],['other','Other']]
export const signingMethods = [['wet_ink','Signed on paper'],['external_electronic','Signed using an external electronic service']]
export const recruitmentLocalDate = (value = new Date()) => new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value))
export const emptyDeliveryDraft = (lead) => ({contractVersion:lead.contracts_json?.at(-1)?.version,recipientName:lead.name || '',recipientContact:lead.email || lead.phone || '',channel:lead.email ? 'email' : 'in_person',sentOn:'',notes:'',confirmed:false})
export const emptySignatureDraft = (lead) => ({contractVersion:lead.contract_delivery_json?.contractVersion,agentSigner:lead.contract_delivery_json?.recipientName || lead.name || '',organisationSigner:'',signedOn:'',method:'wet_ink',reference:'',notes:'',checks:Object.fromEntries(signingChecks.map(([key])=>[key,false])),file:null})
const validDate = (value) => typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(`${value}T12:00:00Z`).getTime()) && new Date(`${value}T12:00:00Z`).toISOString().slice(0,10)===value
const length = (value,min,max) => typeof value==='string' && value.trim().length>=min && value.length<=max
export function recruitmentDeliveryErrors(lead,draft,today=recruitmentLocalDate()) {
  const errors=[]
  if (!lead.id || lead.status!=='application_approved' || !lead.approved_at || !lead.contracts_json?.length || lead.contract_delivery_json?.recordedAt || draft.contractVersion!==lead.contracts_json.at(-1).version) errors.push('Prepare the current contract for the approved application before recording prior delivery.')
  if (!length(draft.recipientName,2,120) || !length(draft.recipientContact,3,254)) errors.push('Record the recipient’s name and contact details.')
  if (!deliveryChannels.some(([key])=>key===draft.channel)) errors.push('Choose how the contract was provided to the agent.')
  if (!validDate(draft.sentOn) || draft.sentOn>today || (lead.approved_at && draft.sentOn<recruitmentLocalDate(lead.approved_at))) errors.push('Choose a delivery date between approval and today.')
  if (!length(draft.notes,5,3000)) errors.push('Record delivery evidence or a reference (5–3,000 characters).')
  if (draft.confirmed!==true) errors.push('Confirm that this version was already provided to the agent.')
  return errors
}
export function recruitmentSignatureErrors(lead,draft,today=recruitmentLocalDate()) {
  const errors=[]
  if (!lead.id || lead.status!=='contract_sent' || !lead.contract_delivery_json?.recordedAt || lead.contract_signature_json?.recordedAt || draft.contractVersion!==lead.contract_delivery_json.contractVersion) errors.push('Record delivery of this contract version before capturing signatures.')
  if (!length(draft.agentSigner,2,120) || !length(draft.organisationSigner,2,120)) errors.push('Record both signer names (2–120 characters).')
  if (!validDate(draft.signedOn) || draft.signedOn>today || draft.signedOn<lead.contract_delivery_json?.sentOn) errors.push('Choose a signature date between delivery and today.')
  if (!signingMethods.some(([key])=>key===draft.method) || typeof draft.reference!=='string' || draft.reference.length>254 || (draft.method==='external_electronic' && !length(draft.reference,3,254))) errors.push('Choose the signing method and include the external signing reference when applicable.')
  if (!length(draft.notes,5,3000)) errors.push('Record verification findings (5–3,000 characters).')
  if (signingChecks.some(([key])=>draft.checks?.[key]!==true)) errors.push('Verify the version, all pages and both signatures.')
  if (!draft.file || draft.file.type!=='application/pdf' || draft.file.size<5 || draft.file.size>10485760 || !length(draft.file.name,1,254)) errors.push('Choose the complete signed contract PDF, up to 10 MB.')
  return errors
}
