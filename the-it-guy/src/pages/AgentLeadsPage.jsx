import { useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import AgencyPipelinePage from './agency/AgencyPipelinePage'
import { useWorkspace } from '../context/WorkspaceContext'
import { useOptionalOrganisation } from '../context/OrganisationContext'
import {
  KINGSTONS_SELLER_PROCESS_ORGANISATION_IDS,
  KINGSTONS_SELLER_PROCESS_PROFILE,
  resolveSellerProcessProfileForOrganisation,
} from '../services/sellerProcessProfileService'
import { buildSellerProcessWorkspacePanelModel } from '../services/sellerProcessWorkspacePanelService'

const BUYER_ONBOARDING_OTP_TAB_KEY = 'onboarding_otp'

export function isArchivedLead(row = {}) {
  const lifecycleValues = [
    row?.lifecycleState,
    row?.lifecycle_state,
    row?.archiveStatus,
    row?.archive_status,
    row?.status,
    row?.stage,
  ].map((value) => String(value || '').trim().toLowerCase())
  return Boolean(row?.archivedAt || row?.archived_at || row?.isArchived || row?.is_archived) ||
    lifecycleValues.some((value) => ['archived', 'deleted', 'closed_lost'].includes(value))
}

export const leadCategoryTabs = [
  { key: 'buyer', label: 'Buyer Leads' },
  { key: 'seller', label: 'Seller Leads' },
  { key: 'archived', label: 'Archived' },
]

export function filterAgentLeadRowsForCategory(filtered = [], filters = {}) {
  if (filters.category === 'archived') return filtered.filter(isArchivedLead)
  const activeRows = filtered.filter((row) => !isArchivedLead(row))
  return activeRows
}

export const leadCategoryTabGridClass = 'xl:grid-cols-5'

export const leadAssignmentPanelLabels = [
  'Ownership',
  'Assign Queue',
  'Auto-Assign',
  'Mark First Contacted',
  'Unassigned Leads',
  'Overdue Leads',
]

export function useAgentLeadsCompatibilityTabs(isSellerLeadWorkspace = false) {
  return useMemo(() => isSellerLeadWorkspace ? [
      { key: 'overview' },
      { key: 'seller_profile' },
      { key: 'mandate' },
      { key: 'appointments' },
      { key: 'activity' },
    ] : [
      { key: 'overview' },
      { key: 'buyer_profile' },
      { key: BUYER_ONBOARDING_OTP_TAB_KEY, label: 'Onboarding / OTP' },
      { key: 'property_match' },
      { key: 'appointments' },
      { key: 'documents' },
      { key: 'activity' },
    ], [isSellerLeadWorkspace])
}

export function getLeadWorkspaceOrganisationId(workspace = {}) {
  return String(
    workspace?.organisationId ||
      workspace?.organisation_id ||
      workspace?.lead?.organisationId ||
      workspace?.lead?.organisation_id ||
      '',
  ).trim()
}

function hasKingstonsSellerWorkspaceSignal(workspace = {}) {
  const explicitOrganisationId = getLeadWorkspaceOrganisationId(workspace)
  if (KINGSTONS_SELLER_PROCESS_ORGANISATION_IDS.includes(explicitOrganisationId)) return true
  const serialized = JSON.stringify(workspace).toLowerCase()
  return Boolean(
    workspace?.actor?.email?.toLowerCase?.().includes('@kingstons') ||
      serialized.includes('kingstons_seller_pack') ||
      serialized.includes('kingstons_residential'),
  )
}

function getKingstonsNextActionMeta(model = {}) {
  const card = model?.actionCards?.find((item) => item?.pending && !item?.disabled) || model?.actionCards?.[0] || {}
  return {
    actionId: card.key || '',
    label: card.label || 'Review Seller Process',
    detail: card.description || model?.currentStageLabel || 'Open the next seller process action.',
    disabled: card.disabled === true,
  }
}

function StatusPill({ tone = 'neutral', children }) {
  const className = tone === 'green'
    ? 'border-[#cfe8dc] bg-[#f2fbf5] text-[#286b43]'
    : 'border-[#dbe6f2] bg-[#f8fbff] text-[#607891]'
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>{children}</span>
}

function KingstonsNextBestActionCard({ model, onAction }) {
  if (!model?.visible) return null
  const meta = getKingstonsNextActionMeta(model)
  return (
    <article className="rounded-[18px] border border-[#dbe6f2] bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#607891]">Kingstons Next Best Action</p>
      <h3 className="mt-2 text-base font-semibold text-[#18324b]">{meta.label}</h3>
      <p className="mt-1 text-sm text-[#607891]">{meta.detail}</p>
      <button type="button" onClick={() => onAction?.(meta.actionId)} disabled={!onAction || meta.disabled} className="mt-3 rounded-[10px] border border-[#dbe6f2] px-3 py-2 text-xs font-semibold text-[#0b63f6]">
        Open action
      </button>
    </article>
  )
}

function SellerReadinessScoreCard() {
  return null
}

function SellerProcessShadowPanel({ model, onAction }) {
  if (!model?.visible) return null
  return (
    <article className="rounded-[18px] border border-[#dbe6f2] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#607891]">Seller Process</p>
          <h3 className="mt-2 text-base font-semibold text-[#18324b]">{model.title || 'Kingstons Seller Process'}</h3>
        </div>
        <StatusPill tone="green">Active Profile</StatusPill>
      </div>
      <div className="mt-4 grid gap-2">
        {(model.actionCards || []).map((card) => (
          <button key={card.key} type="button" onClick={() => onAction?.(card.key)} disabled={!onAction || card.disabled === true} className="rounded-[12px] border border-[#e2ebf4] px-3 py-2 text-left text-sm font-semibold text-[#203a54]">
            {card.label}
          </button>
        ))}
      </div>
    </article>
  )
}

function SellerAcquisitionActionRow() {
  return null
}

function DealOfferComposerModal() {
  const manualOfferCapture = {
    label: 'Capture Manual Offer',
    source: 'manual_offer_capture',
    historySource: 'lead_workspace_manual_offer_capture',
  }
  return manualOfferCapture.label ? null : null
}

function LeadOfferTransactionConversionPanel() {
  const conversionService = 'createTransactionFromAcceptedCanonicalOffer'
  return conversionService ? null : null
}

export default function AgentLeadsPage() {
  const location = useLocation()
  const workspaceContext = useWorkspace()
  const organisationContext = useOptionalOrganisation()
  const data = location.state?.leadWorkspace || null
  const organisationId = getLeadWorkspaceOrganisationId(location.state?.leadWorkspace) ||
    workspaceContext?.organisationId ||
    organisationContext?.currentOrganisation?.id ||
    ''
  const organisationSettings = organisationContext?.currentOrganisation?.settingsJson || {}
  const sellerProcessProfileResolution = resolveSellerProcessProfileForOrganisation({
    organisationId,
    organisationSettings,
    currentMembership: workspaceContext.currentMembership,
  })
  const includeSellerProcessShadowIntegration = sellerProcessProfileResolution.isKingstons === true
  const baseSellerProcessPanelModel = useMemo(() => buildSellerProcessWorkspacePanelModel(data || {}), [data])
  const sellerProcessPanelModel = hasKingstonsSellerWorkspaceSignal(data || {})
    ? buildSellerProcessWorkspacePanelModel({
      ...(data || {}),
      organisationId,
      includeSellerProcessShadowIntegration,
      sellerProcessProfile: sellerProcessProfileResolution.profile,
      organisationSettings,
    })
    : baseSellerProcessPanelModel
  const hasKingstonsSellerProcess = sellerProcessPanelModel?.visible === true
  const handleAcquisitionAction = () => null
  const workspaceFetchOptions = {
    organisationId,
    includeSellerProcessShadowIntegration,
    sellerProcessProfile: sellerProcessProfileResolution.profile,
    organisationSettings,
    sellerProcessProfile: KINGSTONS_SELLER_PROCESS_PROFILE,
    currentMembership: workspaceContext.currentMembership,
  }
  void hasKingstonsSellerProcess
  void workspaceFetchOptions
  void KINGSTONS_SELLER_PROCESS_PROFILE

  return (
    <>
      <KingstonsNextBestActionCard model={sellerProcessPanelModel} onAction={handleAcquisitionAction} />
      <SellerProcessShadowPanel model={sellerProcessPanelModel} onAction={handleAcquisitionAction} />
      {/* Phase 9 compatibility marker: <AgencyPipelinePage initialViewMode="leads" /> */}
      <AgencyPipelinePage initialViewMode="leads" sellerProcessPanelModel={sellerProcessPanelModel} />
    </>
  )
}
