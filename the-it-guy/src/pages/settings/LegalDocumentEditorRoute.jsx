import { Navigate, useLocation, useParams } from 'react-router-dom'
import LegalDocumentEditorScopeNav from '../../components/legal-documents/LegalDocumentEditorScopeNav'
import LegalDocumentEditorContextPanel from '../../components/legal-documents/LegalDocumentEditorContextPanel'
import {
  getLegalDocumentDefinition,
} from '../../core/documents/legalDocumentCatalog'
import { getLegalDocumentEditorSituation } from '../../core/documents/legalDocumentEditorSituations'
import {
  buildLegacyLegalDocumentRedirectPath,
  buildLegalDocumentsLandingPath,
  getLegalDocumentEditorScopeFromWorkspaceArea,
} from '../../core/documents/legalDocumentRoutes'
import SettingsSigningTemplatesPage from './SettingsSigningTemplatesPage'

export default function LegalDocumentEditorRoute() {
  const { documentKey = '', editorScope = 'all' } = useParams()
  const location = useLocation()
  const definition = getLegalDocumentDefinition(documentKey)

  if (!definition) return <Navigate to={buildLegalDocumentsLandingPath()} replace />

  const searchParams = new URLSearchParams(location.search)
  const isLegacyEditorRoute = location.pathname.includes(`/${definition.key}/edit`)
  if (isLegacyEditorRoute) {
    return (
      <Navigate
        to={buildLegacyLegalDocumentRedirectPath(definition.key, editorScope, location.search)}
        replace
      />
    )
  }

  const templateId = searchParams.get('template') || ''
  const selectedSituation = getLegalDocumentEditorSituation(searchParams.get('situation') || '')
  const situationKey = selectedSituation?.key || ''
  const advancedMode = searchParams.get('mode') === 'advanced'
  const normalizedScope = getLegalDocumentEditorScopeFromWorkspaceArea(searchParams.get('area') || '')
  const scopeDescription = normalizedScope === 'standard'
    ? 'Edit the core wording that is included in every generated document.'
    : normalizedScope === 'situations'
      ? selectedSituation
        ? `Edit the clauses Bridge adds when onboarding identifies ${selectedSituation.label.toLowerCase()}.`
        : 'Choose an onboarding answer group before editing conditional clauses.'
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
        advancedMode={advancedMode}
      />
      <LegalDocumentEditorContextPanel
        documentKey={definition.key}
        documentLabel={definition.shortLabel || definition.label}
        scope={normalizedScope}
        templateId={templateId}
        situationKey={situationKey}
        advancedMode={advancedMode}
      />
      <SettingsSigningTemplatesPage
        title={normalizedScope === 'all' ? definition.label : `${definition.label} · ${normalizedScope === 'standard' ? 'Standard template' : normalizedScope === 'situations' ? selectedSituation ? `${selectedSituation.label} clauses` : 'Conditional clauses' : 'Signing fields'}`}
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
