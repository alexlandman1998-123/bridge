import { resolveDocumentAudience } from './documentRoleGuidance.js'

function text(value) {
  return String(value || '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function roleLabel(value) {
  const role = key(value)
  const labels = {
    agent: 'Agency representative',
    seller: 'Seller',
    seller_spouse: 'Co-seller or spouse',
    purchaser_1: 'First purchaser',
    purchaser_2: 'Second purchaser',
    purchaser_spouse: 'Purchaser spouse',
    witness_1: 'First witness',
    witness_2: 'Second witness',
    attorney: 'Attorney',
  }
  return labels[role] || role.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase()) || 'Signing party'
}

function normalizeQueue(signers) {
  return (Array.isArray(signers) ? signers : [])
    .map((signer, index) => {
      const role = key(signer?.signer_role || signer?.role) || 'signer'
      return {
        id: text(signer?.id || signer?.signerId) || `${role}-${index}`,
        role,
        roleLabel: text(signer?.roleLabel) || roleLabel(role),
        name: text(signer?.signer_name || signer?.signerName || signer?.name) || null,
        order: Number(signer?.signing_order || signer?.order) || index + 1,
        status: key(signer?.status) || 'pending',
      }
    })
    .sort((left, right) => left.order - right.order)
}

function viewerMatchesRole(viewerRole, signerRole) {
  const viewer = key(viewerRole)
  const signer = key(signerRole)
  if (viewer === signer) return true
  const audience = resolveDocumentAudience(viewer)
  if (audience === 'agent' && signer === 'agent') return true
  if (audience === 'attorney' && signer === 'attorney') return true
  if (audience === 'buyer' && signer.startsWith('purchaser')) return true
  if (audience === 'seller' && signer.startsWith('seller')) return true
  return false
}

export function buildDocumentResponsibility({ surface = 'workspace', role = '', state = 'draft', signers = [], currentSigner = null } = {}) {
  const normalizedState = key(state)
  const audience = resolveDocumentAudience(role)
  let queue = normalizeQueue(signers)
  if (!queue.length && currentSigner) queue = normalizeQueue([currentSigner])
  queue = queue.map((signer) => ({ ...signer, isViewer: viewerMatchesRole(role, signer.role) }))
  const outstanding = queue.filter((signer) => signer.status !== 'signed')
  const currentSignerOwner = outstanding[0] || null
  const nextSignerOwner = outstanding[1] || null
  const base = { contract: 'arch9-document-responsibility-v1', surface: key(surface), audience, state: normalizedState, queue }

  if (normalizedState === 'completed') return { ...base, phase: 'complete', title: 'No action outstanding', summary: 'Every required signing and final-document step is complete.', currentOwner: null, nextHandoff: null }
  if (['finalising', 'publishing'].includes(normalizedState)) return { ...base, phase: 'system', title: 'Arch9 is completing the final record', summary: 'The parties have finished. Final PDF generation, publication or delivery is now processing.', currentOwner: { type: 'system', label: 'Arch9 processing', isViewer: false }, nextHandoff: 'Final signed document available to all authorised parties' }
  if (['awaiting_signers', 'partially_signed', 'attention_required'].includes(normalizedState) || key(surface) === 'signer_portal') {
    if (!currentSignerOwner) return { ...base, phase: 'signing_complete', title: 'All signing parties have finished', summary: 'The final signed document can now be prepared.', currentOwner: { type: 'system', label: 'Final document processing', isViewer: false }, nextHandoff: 'Final signed PDF' }
    const needsViewer = currentSignerOwner.isViewer
    const attention = ['declined', 'expired'].includes(currentSignerOwner.status)
    return {
      ...base,
      phase: attention ? 'attention' : 'signing',
      title: needsViewer ? 'Your action is required now' : `Waiting on ${currentSignerOwner.name || currentSignerOwner.roleLabel}`,
      summary: attention
        ? `${currentSignerOwner.name || currentSignerOwner.roleLabel} cannot continue until the signing issue is resolved.`
        : `${currentSignerOwner.name || currentSignerOwner.roleLabel} is the next required signing party.`,
      currentOwner: { type: 'signer', ...currentSignerOwner },
      nextHandoff: nextSignerOwner ? `${nextSignerOwner.name || nextSignerOwner.roleLabel} signs next` : 'Final document processing begins next',
    }
  }

  const externalViewer = ['buyer', 'seller', 'viewer'].includes(audience)
  const ownerLabel = externalViewer ? 'Document team' : audience === 'attorney' ? 'Attorney / document team' : audience === 'principal' ? 'Principal / document team' : 'Agent / document team'
  return {
    ...base,
    phase: 'preparation',
    title: externalViewer ? `Waiting on ${ownerLabel}` : 'Your team is responsible now',
    summary: normalizedState === 'ready_to_send' ? 'The document is prepared and needs to be sent to the signing parties.' : 'The document is still being prepared or checked before signature.',
    currentOwner: { type: 'team', label: ownerLabel, isViewer: !externalViewer },
    nextHandoff: normalizedState === 'ready_to_send' ? 'Signing parties receive secure invitations next' : 'Signature setup follows document preparation',
  }
}
