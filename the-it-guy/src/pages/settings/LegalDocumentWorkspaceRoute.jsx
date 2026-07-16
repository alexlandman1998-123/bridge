import { FilePlus2, LockKeyhole, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { BlockInspector } from '../../components/legal-document-workspace/BlockInspector'
import { DocumentCanvas } from '../../components/legal-document-workspace/DocumentCanvas'
import { DocumentOutline } from '../../components/legal-document-workspace/DocumentOutline'
import { DocumentWorkspaceHeader } from '../../components/legal-document-workspace/DocumentWorkspaceHeader'
import { OtpGovernanceJourney } from '../../components/legal-document-workspace/OtpGovernanceJourney'
import { PublicationStatusCard } from '../../components/legal-document-workspace/PublicationStatusCard'
import { RecoveryStatusCard } from '../../components/legal-document-workspace/RecoveryStatusCard'
import { ScenarioTestPanel } from '../../components/legal-document-workspace/ScenarioTestPanel'
import { getLegalDocumentDefinition } from '../../core/documents/legalDocumentCatalog'
import { updateLegalDocumentBlock } from '../../core/documents/legalDocumentBlockAdapter'
import {
  buildLegalDocumentPreviewPath,
  buildLegalDocumentWorkspacePath,
  buildLegalDocumentsLandingPath,
} from '../../core/documents/legalDocumentRoutes'
import { resolveLegalDocumentOrganisationId } from '../../core/documents/legalDocumentWorkspace'
import {
  buildLegalDocumentReviewModel,
  buildLegalDocumentScenarioTestResults,
  buildLegalDocumentOutlineGroups,
  getLegalDocumentOutlineGroupKey,
  resolveLegalDocumentWorkspaceSelectedBlockId,
} from '../../core/documents/legalDocumentWorkspacePresentation'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useAuthSession } from '../../context/AuthSessionContext'
import { useLegalDocumentWorkspace } from '../../hooks/useLegalDocumentWorkspace'
import LegalDocumentEditorRoute from './LegalDocumentEditorRoute'

export function LegalDocumentWorkspaceRoute() {
  const { documentKey = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const definition = getLegalDocumentDefinition(documentKey)
  const advancedMode = searchParams.get('mode') === 'advanced'
  const { currentMembership, currentWorkspace, role } = useWorkspace()
  const { authState } = useAuthSession()
  const organisationId = resolveLegalDocumentOrganisationId(currentWorkspace, currentMembership)
  const workspace = useLegalDocumentWorkspace({
    documentKey,
    organisationId: organisationId || null,
    appRole: role,
    membershipRole: currentMembership?.workspaceRole || currentMembership?.workspace_role || currentMembership?.organisationRole || currentMembership?.organisation_role || currentMembership?.role || currentMembership?.membershipRole || '',
    actorUserId: authState.user?.id || '',
    templateId: searchParams.get('template') || '',
    selectedBlockId: searchParams.get('block') || '',
    enabled: Boolean(definition) && !advancedMode,
  })
  const [draftState, setDraftState] = useState(null)
  const [saving, setSaving] = useState(false)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [selectedScenarioKey, setSelectedScenarioKey] = useState('company')

  const baseRevision = useMemo(() => JSON.stringify(workspace.blocks), [workspace.blocks])
  const draftBlocks = draftState?.templateId === (workspace.workingDraft.templateId || '') && draftState.baseRevision === baseRevision
    ? draftState.blocks
    : workspace.blocks
  const dirty = useMemo(
    () => JSON.stringify(draftBlocks) !== JSON.stringify(workspace.blocks),
    [draftBlocks, workspace.blocks],
  )
  const reviewModel = useMemo(() => buildLegalDocumentReviewModel({
    template: workspace.template,
    blocks: draftBlocks,
    dirty,
    editPermission: workspace.editPermission,
    publication: workspace.publication,
  }), [dirty, draftBlocks, workspace.editPermission, workspace.publication, workspace.template])
  const scenarioResults = useMemo(() => buildLegalDocumentScenarioTestResults({
    blocks: draftBlocks,
    scenarios: workspace.scenarios,
    packetType: workspace.document.packetType,
    organisationId: organisationId || null,
  }), [draftBlocks, organisationId, workspace.document.packetType, workspace.scenarios])

  useEffect(() => {
    if (!dirty) return undefined
    const warnBeforeUnload = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [dirty])

  if (!definition) return <Navigate to={buildLegalDocumentsLandingPath()} replace />
  if (advancedMode) return <LegalDocumentEditorRoute />

  const selectedBlockId = resolveLegalDocumentWorkspaceSelectedBlockId(draftBlocks, {
    blockId: searchParams.get('block') || '',
    area: searchParams.get('area') || '',
  })
  const selectedBlock = draftBlocks.find((block) => block.id === selectedBlockId) || null
  const outlineGroups = buildLegalDocumentOutlineGroups(draftBlocks)
  const activeGroupKey = selectedBlock ? getLegalDocumentOutlineGroupKey(selectedBlock) : outlineGroups.find((group) => group.blocks.length)?.key || ''
  const activeGroup = outlineGroups.find((group) => group.key === activeGroupKey) || outlineGroups[0]
  const previewPath = buildLegalDocumentPreviewPath(definition.key)
  const advancedEditorPath = buildLegalDocumentWorkspacePath(definition.key, {
    area: searchParams.get('area') || '',
    templateId: workspace.workingDraft.templateId || searchParams.get('template') || '',
    situationKey: searchParams.get('situation') || '',
    blockId: selectedBlockId || '',
    advanced: true,
  })

  const selectBlock = (blockId) => {
    if (!blockId) return
    const next = new URLSearchParams(searchParams)
    next.set('block', blockId)
    next.delete('area')
    next.delete('situation')
    setSearchParams(next, { replace: true })
  }

  const selectGroup = (group) => {
    selectBlock(group.blocks[0]?.id)
  }

  const changeBlock = (blockId, patch) => {
    setSaveError('')
    setSaveMessage('')
    setDraftState((previous) => ({
      templateId: workspace.workingDraft.templateId || '',
      baseRevision,
      blocks: (previous?.templateId === (workspace.workingDraft.templateId || '') && previous.baseRevision === baseRevision
        ? previous.blocks
        : workspace.blocks).map((block) => (
        block.id === blockId ? updateLegalDocumentBlock(block, patch) : block
      )),
    }))
  }

  const discardChanges = () => {
    setDraftState(null)
    setSaveError('')
    setSaveMessage('Changes discarded.')
  }

  const saveChanges = async () => {
    if (!dirty || saving || !workspace.editPermission.editable) return
    try {
      setSaving(true)
      setSaveError('')
      setSaveMessage('')
      await workspace.saveBlocks(draftBlocks)
      setDraftState(null)
      setSaveMessage('Draft saved.')
    } catch (error) {
      setSaveError(error?.message || 'Unable to save this legal document draft.')
    } finally {
      setSaving(false)
    }
  }

  const runReviewAction = async () => {
    if (!reviewModel.actionEnabled || reviewBusy) return
    try {
      setReviewBusy(true)
      setSaveError('')
      setSaveMessage('')
      if (reviewModel.action === 'submit_review') {
        await workspace.submitForReview()
        setSaveMessage('Legal review requested.')
      } else if (reviewModel.action === 'return_to_draft') {
        await workspace.returnToDraft()
        setSaveMessage('Document returned to draft.')
      }
    } catch (error) {
      setSaveError(error?.message || 'Unable to update the legal review status.')
    } finally {
      setReviewBusy(false)
    }
  }

  if (workspace.loading) {
    return (
      <div className="mx-auto w-full max-w-[1540px] animate-pulse space-y-5 pb-10" aria-label={`Loading ${definition.label} workspace`}>
        <div className="h-28 rounded-[18px] border border-[#e1e8ee] bg-white" />
        <div className="grid gap-4 xl:grid-cols-[230px_minmax(0,1fr)_300px]">
          <div className="h-[620px] rounded-[18px] border border-[#e1e8ee] bg-white" />
          <div className="h-[620px] rounded-[18px] border border-[#e1e8ee] bg-white" />
          <div className="h-[440px] rounded-[18px] border border-[#e1e8ee] bg-white" />
        </div>
      </div>
    )
  }

  if (workspace.error) {
    return (
      <section className="mx-auto w-full max-w-3xl rounded-[18px] border border-[#edc9b8] bg-[#fff7f3] p-6" role="alert">
        <h1 className="text-xl font-semibold text-[#8d3e2c]">We could not open {definition.label}</h1>
        <p className="mt-2 text-sm leading-6 text-[#8f5a4d]">{workspace.error}</p>
        <button type="button" className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-[10px] border border-[#d89e88] bg-white px-4 text-sm font-semibold text-[#8d3e2c]" onClick={() => void workspace.refresh()}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </button>
      </section>
    )
  }

  if (!workspace.template) {
    return (
      <section className="mx-auto flex min-h-[520px] w-full max-w-3xl flex-col items-center justify-center rounded-[22px] border border-dashed border-[#cfdbe5] bg-white px-6 text-center">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-[16px] border border-[#d5e7dc] bg-[#f1faf5] text-[#16804d]">
          <FilePlus2 className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold text-[#102033]">Set up {definition.label}</h1>
        <p className="mt-2 max-w-lg text-sm leading-7 text-[#697c91]">Create the first agency draft, then this workspace will organise its wording, conditions and signatures in one place.</p>
        <Link to={advancedEditorPath} className="mt-6 inline-flex min-h-11 items-center justify-center rounded-[11px] bg-[#0f7f4f] px-5 text-sm font-semibold text-white shadow-[0_9px_20px_rgba(15,127,79,0.18)]">
          Set up document
        </Link>
      </section>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1540px] space-y-5 pb-10">
      <DocumentWorkspaceHeader
        document={workspace.document}
        workingDraft={workspace.workingDraft}
        previewPath={previewPath}
        advancedEditorPath={advancedEditorPath}
        editable={workspace.editPermission.editable}
        dirty={dirty}
        saving={saving}
        saveMessage={saveMessage}
        onSave={() => void saveChanges()}
        onDiscard={discardChanges}
      />

      {saveError ? (
        <section className="rounded-[14px] border border-[#edc9b8] bg-[#fff7f3] px-4 py-3 text-sm text-[#8d3e2c]" role="alert">
          {saveError}
        </section>
      ) : null}

      {!workspace.editPermission.editable ? (
        <section className="flex flex-col gap-3 rounded-[14px] border border-[#dbe4eb] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[#60758a]" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-[#30455b]">Protected version</h2>
              <p className="mt-0.5 text-xs leading-5 text-[#718397]">{workspace.editPermission.reason}</p>
            </div>
          </div>
          <Link to={advancedEditorPath} className="inline-flex min-h-10 items-center justify-center rounded-[10px] border border-[#cbd8e2] bg-[#f9fbfc] px-4 text-sm font-semibold text-[#40576d] transition hover:border-[#a9bdca] hover:bg-white">
            Create or select draft
          </Link>
        </section>
      ) : null}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[230px_minmax(0,1fr)_300px] 2xl:grid-cols-[250px_minmax(0,1fr)_320px]">
        <DocumentOutline
          groups={outlineGroups}
          activeGroupKey={activeGroupKey}
          onSelectGroup={selectGroup}
        />
        <DocumentCanvas
          activeGroup={activeGroup}
          selectedBlockId={selectedBlockId}
          editable={workspace.editPermission.editable}
          onSelectBlock={selectBlock}
          onChangeBlock={changeBlock}
        />
        <div className="space-y-4">
          <BlockInspector
            block={selectedBlock}
            editable={workspace.editPermission.editable}
            onChangeBlock={changeBlock}
          />
          <PublicationStatusCard
            publication={workspace.publication}
            review={reviewModel}
            versionCount={workspace.versionHistory.length}
            advancedEditorPath={advancedEditorPath}
            reviewBusy={reviewBusy}
            onReviewAction={() => void runReviewAction()}
          />
          <RecoveryStatusCard
            recovery={workspace.recovery}
            permission={workspace.recoveryPermission}
            dirty={dirty}
            onRestore={workspace.restorePreviousLiveVersion}
          />
        </div>
      </div>

      <ScenarioTestPanel
        results={scenarioResults}
        selectedKey={selectedScenarioKey}
        previewPath={previewPath}
        dirty={dirty}
        onSelect={setSelectedScenarioKey}
      />

      {workspace.document.liveTemplateId ? (
        <OtpGovernanceJourney
          assurance={workspace.liveAssurance}
          followUp={workspace.followUp}
          resolution={workspace.resolution}
          onRun={workspace.runLiveAssurance}
          onPlan={workspace.planReviewFollowUp}
          onApply={workspace.applyReviewFollowUp}
          onCheck={workspace.checkReviewResolution}
        />
      ) : null}
    </div>
  )
}
