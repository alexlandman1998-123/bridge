import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/index.css'
import { buildDocumentAccessibility } from '../src/core/documents/documentAccessibility'
import { buildDocumentCommitConfirmation } from '../src/core/documents/documentCommitConfirmation'
import { buildDocumentHelpRecovery } from '../src/core/documents/documentHelpRecovery'
import { buildDocumentJourneyProgress } from '../src/core/documents/documentJourneyProgress'
import { buildDocumentMobileAction } from '../src/core/documents/documentMobileAction'
import { buildDocumentOutcomeFeedback } from '../src/core/documents/documentOutcomeFeedback'
import { buildDocumentResponsibility } from '../src/core/documents/documentResponsibility'
import { buildDocumentRoleActions } from '../src/core/documents/documentRoleActions'
import { buildDocumentRoleGuidance } from '../src/core/documents/documentRoleGuidance'
import { DocumentAccessibilityNavigation } from '../src/components/documents/DocumentAccessibilityNavigation'
import { DocumentCommitConfirmation } from '../src/components/documents/DocumentCommitConfirmation'
import DocumentHelpRecoveryCard from '../src/components/documents/DocumentHelpRecoveryCard'
import { DocumentJourneyProgress } from '../src/components/documents/DocumentJourneyProgress'
import { DocumentMobileActionDock } from '../src/components/documents/DocumentMobileActionDock'
import { DocumentOutcomeNotice } from '../src/components/documents/DocumentOutcomeNotice'
import DocumentResponsibilityCard from '../src/components/documents/DocumentResponsibilityCard'
import DocumentRoleActionBar from '../src/components/documents/DocumentRoleActionBar'
import DocumentRoleGuidanceCard from '../src/components/documents/DocumentRoleGuidanceCard'

function Fixture() {
  const params = new URLSearchParams(window.location.search)
  const surface = params.get('surface') === 'signer_portal' ? 'signer_portal' : 'workspace'
  const role = params.get('role') || (surface === 'signer_portal' ? 'seller' : 'attorney')
  const packetType = params.get('packet') === 'otp' ? 'otp' : 'mandate'
  const signerSurface = surface === 'signer_portal'
  const requiredFields = signerSurface ? 3 : 0
  const [completedFields, setCompletedFields] = useState(signerSurface ? 1 : 0)
  const [signed, setSigned] = useState(false)
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const [outcomeMessage, setOutcomeMessage] = useState('')
  const remainingFields = Math.max(0, requiredFields - completedFields)
  const state = signerSurface ? (signed ? 'signed' : 'viewed') : 'ready_to_send'
  const signers = signerSurface
    ? [{ id: 'viewer', role, name: role === 'seller' ? 'Test Seller' : 'Test Purchaser', status: state, order: 1 }]
    : [{ id: 'agent', role: 'agent', name: 'Test Agent', status: 'pending', order: 1 }, { id: 'client', role: packetType === 'otp' ? 'purchaser_1' : 'seller', name: 'Test Client', status: 'pending', order: 2 }]
  const guidance = buildDocumentRoleGuidance({ surface, role, packetType, state, signerStatus: state, remainingFields, completedFields })
  const actions = buildDocumentRoleActions({ surface, role, state, canEdit: true, canSend: true, remainingFields, requiredFields, canComplete: signerSurface && remainingFields === 0 })
  const responsibility = buildDocumentResponsibility({ surface, role, state, signers, currentSigner: signerSurface ? signers[0] : null })
  const help = buildDocumentHelpRecovery({ surface, role, state })
  const journey = buildDocumentJourneyProgress({ surface, state, signerStatus: state, requiredFields, completedFields })
  const primaryAction = actions.actions.find((item) => !item.disabled && item.priority === 'primary') || actions.actions.find((item) => !item.disabled)
  const mobile = buildDocumentMobileAction({ surface, primaryAction, remainingFields, requiredFields, canComplete: signerSurface && remainingFields === 0, currentOwnerLabel: responsibility.currentOwner?.name || responsibility.currentOwner?.label })
  const accessibility = buildDocumentAccessibility({ surface, journey, responsibility, helpRecovery: help, mobileAction: mobile, completedFields, requiredFields, contentTargetId: 'n2-document', actionsTargetId: 'n2-actions' })
  const commit = buildDocumentCommitConfirmation({ action: signerSurface ? 'complete_signing' : 'send_signature', packetType, signerCount: 2, remainingFields, signerRole: role })
  const outcome = buildDocumentOutcomeFeedback({ surface, message: outcomeMessage, remainingFields })

  function act(actionId) {
    if (actionId === 'send_document' || actionId === 'complete_signing') setConfirmationOpen(true)
    else if (actionId === 'next_field') {
      setCompletedFields((current) => Math.min(requiredFields, current + 1))
      setOutcomeMessage('Signature applied to the required field.')
    } else if (actionId === 'open_preview' || actionId === 'review_document') setOutcomeMessage('Document preview opened.')
    else setOutcomeMessage('Signature setup saved.')
  }

  function confirm() {
    setConfirmationOpen(false)
    if (signerSurface) {
      setSigned(true)
      setOutcomeMessage('Signing submitted. All required fields were securely recorded.')
    } else setOutcomeMessage('Document sent for signature workflow.')
  }

  return (
    <main className="min-h-screen bg-[#eef3f8] px-4 pb-32 pt-6 text-[#142132] md:pb-10">
      <DocumentAccessibilityNavigation model={accessibility} />
      <div className="mx-auto max-w-6xl space-y-4">
        <header><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#607387]">N2 isolated browser fixture</p><h1 className="mt-1 text-2xl font-black">{packetType === 'otp' ? 'Offer to Purchase' : 'Mandate'} · {role.replace(/_/g, ' ')}</h1></header>
        <section id="n2-document" tabIndex={-1} className="rounded-[22px] border border-[#d7e2ef] bg-white p-4 focus:outline-none"><h2 className="font-bold">Document preview</h2><p className="mt-2 text-sm text-[#607387]">A certified, editable document preview used only for browser acceptance.</p></section>
        <DocumentJourneyProgress model={journey} />
        <DocumentRoleGuidanceCard guidance={guidance} />
        {!signed ? <div id="n2-actions" tabIndex={-1} className="focus:outline-none"><DocumentRoleActionBar model={actions} onAction={act} /></div> : <div id="n2-actions" tabIndex={-1} className="sr-only">Signing actions complete</div>}
        <DocumentResponsibilityCard model={responsibility} />
        <DocumentHelpRecoveryCard model={help} />
        {outcome ? <DocumentOutcomeNotice model={outcome} onDismiss={() => setOutcomeMessage('')} /> : null}
      </div>
      {!signed ? <DocumentMobileActionDock model={mobile} onAction={act} /> : null}
      <DocumentCommitConfirmation model={commit} open={confirmationOpen} onCancel={() => setConfirmationOpen(false)} onConfirm={confirm} />
    </main>
  )
}

createRoot(document.getElementById('root')).render(<Fixture />)
