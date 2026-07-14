import { Navigate, useLocation, useParams } from 'react-router-dom'
import LegalDocumentEditorScopeNav from '../../components/legal-documents/LegalDocumentEditorScopeNav'
import LegalDocumentEditorContextPanel from '../../components/legal-documents/LegalDocumentEditorContextPanel'
import {
  getLegalDocumentDefinition,
  normalizeLegalDocumentEditorScope,
} from '../../core/documents/legalDocumentCatalog'
import { getLegalDocumentEditorSituation } from '../../core/documents/legalDocumentEditorSituations'
import { buildLegalDocumentsLandingPath } from '../../core/documents/legalDocumentRoutes'
import SettingsSigningTemplatesPage from './SettingsSigningTemplatesPage'

export default function LegalDocumentEditorRoute() {
  const { documentKey = '', editorScope = 'all' } = useParams()
  const location = useLocation()
  const definition = getLegalDocumentDefinition(documentKey)

  if (!definition) return <Navigate to={buildLegalDocumentsLandingPath()} replace />

  const templateId = new URLSearchParams(location.search).get('template') || ''
  const selectedSituation = getLegalDocumentEditorSituation(new URLSearchParams(location.search).get('situation') || '')
  const situationKey = selectedSituation?.key || ''
  const normalizedScope = normalizeLegalDocumentEditorScope(editorScope)
  const scopeDescription = normalizedScope === 'standard'
    ? 'Edit the wording included in every version of this document.'
    : normalizedScope === 'situations'
      ? selectedSituation
        ? `Edit only the wording Bridge includes for ${selectedSituation.label.toLowerCase()} situations.`
        : 'Choose a person, property or finance situation before editing conditional wording.'
      : normalizedScope === 'signing'
        ? 'Set up who signs and where signatures, initials and dates are placed.'
        : `Manage all wording and document pieces used to build your ${definition.shortLabel}.`
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5 pb-10">
      <LegalDocumentEditorScopeNav
        documentKey={definition.key}
        documentLabel={definition.label}
        scope={normalizedScope}
        templateId={templateId}
        situationKey={situationKey}
      />
      <LegalDocumentEditorContextPanel
        documentKey={definition.key}
        documentLabel={definition.shortLabel || definition.label}
        scope={normalizedScope}
        templateId={templateId}
        situationKey={situationKey}
      />
      <SettingsSigningTemplatesPage
        title={normalizedScope === 'all' ? definition.label : `${definition.label} · ${normalizedScope === 'standard' ? 'Standard wording' : normalizedScope === 'situations' ? selectedSituation ? `${selectedSituation.label} wording` : 'Situation wording' : 'Signing setup'}`}
        description={scopeDescription}
        allowedPacketTypes={[definition.packetType]}
        initialPacketType={definition.packetType}
        initialTemplateId={templateId}
        editorScope={normalizedScope}
        focusedLegalDocumentKey={definition.key}
        editorSituationKey={situationKey}
      />
    </div>
  )
}
