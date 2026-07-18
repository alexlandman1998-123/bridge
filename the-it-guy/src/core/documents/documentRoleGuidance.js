function text(value) {
  return String(value || '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export function resolveDocumentAudience(value) {
  const role = key(value)
  if (['principal', 'owner', 'admin', 'super_admin', 'branch_manager', 'agency_admin'].includes(role)) return 'principal'
  if (role.includes('attorney') || role.includes('conveyancer')) return 'attorney'
  if (role.includes('buyer') || role.includes('purchaser') || role === 'client') return 'buyer'
  if (role.includes('seller')) return 'seller'
  if (role.includes('agent')) return 'agent'
  return 'viewer'
}

function documentLabel(packetType) {
  const type = key(packetType)
  if (type === 'otp') return 'Offer to Purchase'
  if (type === 'mandate') return 'mandate'
  return 'document'
}

function workspaceGuidance({ audience, state, label }) {
  const roleLabels = {
    principal: 'Principal oversight',
    attorney: 'Attorney workspace',
    agent: 'Agent workspace',
    buyer: 'Buyer view',
    seller: 'Seller view',
    viewer: 'Document view',
  }
  const base = { audience, audienceLabel: roleLabels[audience], surface: 'workspace' }

  if (state === 'attention_required') return { ...base, tone: 'danger', title: 'A signer response needs attention', summary: 'Review what happened before sending anything again.', nextAction: 'Open the signing activity and resolve the declined or invalid response.', steps: ['Check which party needs attention.', 'Confirm whether the document must change.', 'Send a fresh link only when the document is ready.'] }
  if (state === 'completed') return { ...base, tone: 'success', title: `${label} complete`, summary: 'The signed PDF is saved, shared and available as the transaction record.', nextAction: 'Download the signed PDF or its completion certificate.', steps: ['Keep the final PDF with the transaction.', 'Use the certificate when completion evidence is needed.'] }
  if (['publishing', 'finalising'].includes(state)) return { ...base, tone: 'info', title: 'Everyone has finished signing', summary: 'Arch9 is preparing and distributing the final signed PDF.', nextAction: audience === 'agent' || audience === 'principal' ? 'Retry completion only if this does not finish automatically.' : 'No action is required while the final copy is prepared.', steps: ['Do not resend signing links.', 'Wait for the final signed copy to become available.'] }
  if (['awaiting_signers', 'partially_signed'].includes(state)) return { ...base, tone: 'info', title: 'Waiting for signatures', summary: 'The document is with the signing parties now.', nextAction: audience === 'attorney' || audience === 'viewer' ? 'Monitor progress; the transaction owner handles reminders.' : 'Use the signer timeline to wait, remind, or replace an expired link.', steps: ['Check who has opened or signed.', 'Wait for the reminder window before following up.', 'Do not resend to parties who already signed.'] }
  if (state === 'ready_to_send') return { ...base, tone: 'info', title: `${label} ready to send`, summary: 'The PDF and its signature fields are prepared.', nextAction: audience === 'attorney' || audience === 'viewer' ? 'Review the final PDF before the transaction owner sends it.' : 'Confirm the signer details, then send for signature.', steps: ['Check names and email addresses.', 'Check signature and initial positions.', 'Send the secure signing invitation.'] }
  if (state === 'pdf_ready') return { ...base, tone: 'neutral', title: 'PDF ready for signing setup', summary: `The ${label} can still be edited and regenerated.`, nextAction: 'Review the PDF and place the required signature or initial blocks.', steps: ['Check the generated wording and party details.', 'Place each field for the correct signer.', 'Mark the document ready to send.'] }

  if (audience === 'attorney') return { ...base, tone: 'neutral', title: `Review and tailor the ${label}`, summary: 'You can edit the wording and transaction-specific details before generation.', nextAction: 'Review the clauses and party information, then generate the PDF.', steps: ['Check the transaction facts.', 'Adjust wording where the firm requires it.', 'Generate and review the resulting PDF.'] }
  if (audience === 'principal') return { ...base, tone: 'neutral', title: `Prepare the ${label}`, summary: 'The document remains editable and under your organisation’s control.', nextAction: 'Confirm the content and signer details before generating.', steps: ['Review company wording and clauses.', 'Confirm all signing parties.', 'Generate the PDF when the draft is ready.'] }
  return { ...base, tone: 'neutral', title: `Prepare the ${label}`, summary: 'Complete the document details before starting signature setup.', nextAction: 'Review the draft, then generate the PDF.', steps: ['Confirm the parties and property details.', 'Review the document wording.', 'Generate the PDF for signing setup.'] }
}

function signerGuidance({ audience, label, signerStatus, remainingFields, completedFields }) {
  const roleLabels = { agent: 'Signing as agency representative', seller: 'Signing as seller', buyer: 'Signing as purchaser', attorney: 'Signing as attorney', viewer: 'Secure signer' }
  const base = { audience, audienceLabel: roleLabels[audience] || 'Secure signer', surface: 'signer_portal' }
  if (signerStatus === 'signed' || (remainingFields === 0 && completedFields > 0)) return { ...base, tone: 'success', title: 'Your signing is complete', summary: `Your completed fields have been saved against this ${label}.`, nextAction: 'You can safely close this page while other parties finish.', steps: ['No fields remain for you.', 'A completed copy will be available after every required party signs.'] }
  const roleSummary = audience === 'agent'
    ? 'Your agency signature is required before the seller-side invitation can continue.'
    : `Review the full ${label} before adding your signature or initials.`
  return {
    ...base,
    tone: 'info',
    title: audience === 'agent' ? `Review and sign the ${label} first` : `Review and sign the ${label}`,
    summary: roleSummary,
    nextAction: remainingFields > 0 ? `Complete the next highlighted field. ${completedFields} already completed.` : 'No signing fields are available yet. Ask the sender to check the document setup.',
    steps: ['Read the entire document.', 'Tap each highlighted signature or initial field.', 'Choose Complete Signing only after every required field is finished.'],
  }
}

export function buildDocumentRoleGuidance({ surface = 'workspace', role = '', packetType = 'document', state = 'draft', signerStatus = '', remainingFields = 0, completedFields = 0 } = {}) {
  const audience = resolveDocumentAudience(role)
  const label = documentLabel(packetType)
  const guidance = key(surface) === 'signer_portal'
    ? signerGuidance({ audience, label, signerStatus: key(signerStatus), remainingFields: Math.max(0, Number(remainingFields) || 0), completedFields: Math.max(0, Number(completedFields) || 0) })
    : workspaceGuidance({ audience, state: key(state), label })
  return { contract: 'arch9-document-role-guidance-v1', ...guidance, packetType: key(packetType) || 'document' }
}
