import { Navigate, useLocation, useParams } from 'react-router-dom'
import LegalDocumentEditorScopeNav from '../../components/legal-documents/LegalDocumentEditorScopeNav'
import LegalDocumentEditorContextPanel from '../../components/legal-documents/LegalDocumentEditorContextPanel'
import {
  getLegalDocumentDefinition,
  normalizeLegalDocumentEditorScope,
} from '../../core/documents/legalDocumentCatalog'
import { getLegalDocumentEditorSituation } from '../../core/documents/legalDocumentEditorSituations'
import {
  buildLegalDocumentEditorPath,
  buildLegalDocumentsLandingPath,
} from '../../core/documents/legalDocumentRoutes'
import SettingsSigningTemplatesPage from './SettingsSigningTemplatesPage'

export default function LegalDocumentEditorRoute() {
  const { documentKey = '', editorScope = 'standard' } = useParams()
  const location = useLocation()
  const definition = getLegalDocumentDefinition(documentKey)

  if (!definition) return <Navigate to={buildLegalDocumentsLandingPath()} replace />

  const templateId = new URLSearchParams(location.search).get('template') || ''
  const selectedSituation = getLegalDocumentEditorSituation(
    new URLSearchParams(location.search).get('situation') || '',
    { packetType: definition.packetType },
  )
  const situationKey = selectedSituation?.key || ''
  const normalizedScope = normalizeLegalDocumentEditorScope(editorScope)
  if (normalizedScope === 'all') {
    return <Navigate to={`${buildLegalDocumentEditorPath(definition.key, 'standard')}${location.search}`} replace />
  }
  const scopeDescription = normalizedScope === 'standard'
    ? 'Edit the wording included in every version of this document.'
    : normalizedScope === 'situations'
      ? selectedSituation
        ? `Edit the ${selectedSituation.label.toLowerCase()} section inside this master document.`
        : 'Choose a conditional section before editing its wording.'
      : normalizedScope === 'signing'
        ? 'Set up who signs and where signatures, initials and dates are placed.'
        : `Manage all wording and document pieces used to build your ${definition.shortLabel}.`
  return (
    <div className="w-full max-w-none space-y-5 pb-10">
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
        packetType={definition.packetType}
      />
      {normalizedScope !== 'situations' || selectedSituation ? (
        <SettingsSigningTemplatesPage
          title={`${definition.label} · ${normalizedScope === 'standard' ? 'Always included' : normalizedScope === 'situations' ? selectedSituation.label : 'Who signs'}`}
          description={scopeDescription}
          allowedPacketTypes={[definition.packetType]}
          initialPacketType={definition.packetType}
          initialTemplateId={templateId}
          editorScope={normalizedScope}
          focusedLegalDocumentKey={definition.key}
          editorSituationKey={situationKey}
        />
      ) : null}
    </div>
  )
}
