import { Navigate, useLocation, useParams } from 'react-router-dom'
import LegalDocumentEditorScopeNav from '../../components/legal-documents/LegalDocumentEditorScopeNav'
import {
  getLegalDocumentDefinition,
  normalizeLegalDocumentEditorScope,
} from '../../core/documents/legalDocumentCatalog'
import { buildLegalDocumentsLandingPath } from '../../core/documents/legalDocumentRoutes'
import SettingsSigningTemplatesPage from './SettingsSigningTemplatesPage'

export default function LegalDocumentEditorRoute() {
  const { documentKey = '', editorScope = 'all' } = useParams()
  const location = useLocation()
  const definition = getLegalDocumentDefinition(documentKey)

  if (!definition) return <Navigate to={buildLegalDocumentsLandingPath()} replace />

  const templateId = new URLSearchParams(location.search).get('template') || ''
  const normalizedScope = normalizeLegalDocumentEditorScope(editorScope)
  const scopeDescription = normalizedScope === 'standard'
    ? 'Edit the wording included in every version of this document.'
    : normalizedScope === 'situations'
      ? 'Edit the wording Bridge includes automatically for specific people, property and finance situations.'
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
      />
      <SettingsSigningTemplatesPage
        title={normalizedScope === 'all' ? definition.label : `${definition.label} · ${normalizedScope === 'standard' ? 'Standard wording' : normalizedScope === 'situations' ? 'Situation wording' : 'Signing setup'}`}
        description={scopeDescription}
        allowedPacketTypes={[definition.packetType]}
        initialPacketType={definition.packetType}
        initialTemplateId={templateId}
        editorScope={normalizedScope}
        focusedLegalDocumentKey={definition.key}
      />
    </div>
  )
}
