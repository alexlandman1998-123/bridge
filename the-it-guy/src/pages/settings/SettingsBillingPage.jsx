import { useEffect, useState } from 'react'
import Button from '../../components/ui/Button'
import { useWorkspace } from '../../context/WorkspaceContext'
import { ENTITLEMENT_KEYS, formatEntitlementValue } from '../../constants/workspaceEntitlements'
import { canManageOrganisationSettings, getWorkspaceAdministratorLabel, normalizeOrganisationMembershipRole } from '../../lib/organisationAccess'
import { fetchOrganisationSettings, listBillingInvoices } from '../../lib/settingsApi'
import {
  buildBillingSummary,
  cancelWorkspacePlanChange,
  listWorkspaceBillingActivity,
  listWorkspacePlanCatalog,
  requestWorkspacePlanChange,
  resolveWorkspaceEntitlements,
} from '../../services/workspaceEntitlementsService'
import {
  SettingsBanner,
  SettingsEmptyState,
  SettingsLoadingState,
  SettingsPageHeader,
  SettingsSectionCard,
  settingsPageClass,
  settingsTableClass,
} from './settingsUi'

function formatCurrency(value) {
  const amount = Number(value || 0)
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDateTime(value) {
  if (!value) return 'Not set'
  return new Date(value).toLocaleString()
}

function formatEventType(value = '') {
  return String(value || '').replace(/_/g, ' ')
}

export default function SettingsBillingPage() {
  const { role, currentWorkspace, workspaceType } = useWorkspace()
  const resolvedWorkspaceType = currentWorkspace?.type || workspaceType || ''
  const [membershipRole, setMembershipRole] = useState('viewer')
  const administratorLabel = getWorkspaceAdministratorLabel({ appRole: role, workspaceType: resolvedWorkspaceType })
  const canView = canManageOrganisationSettings({
    appRole: role,
    membershipRole: normalizeOrganisationMembershipRole(membershipRole, { appRole: role, workspaceType: resolvedWorkspaceType }),
    workspaceType: resolvedWorkspaceType,
  })
  const [subscription, setSubscription] = useState(null)
  const [entitlements, setEntitlements] = useState({})
  const [plans, setPlans] = useState([])
  const [workspaceId, setWorkspaceId] = useState('')
  const [billingRequests, setBillingRequests] = useState([])
  const [billingEvents, setBillingEvents] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [planRequestMessage, setPlanRequestMessage] = useState('')
  const [planRequestTone, setPlanRequestTone] = useState('success')
  const [requestingPlanKey, setRequestingPlanKey] = useState('')
  const [cancelingRequestId, setCancelingRequestId] = useState('')
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        setLoading(true)
        const context = await fetchOrganisationSettings()
        if (active) {
          setMembershipRole(normalizeOrganisationMembershipRole(context?.membershipRole || 'viewer', {
            appRole: role,
            workspaceType: context?.organisation?.type || resolvedWorkspaceType,
          }))
        }
        if (!canManageOrganisationSettings({
          appRole: role,
          membershipRole: normalizeOrganisationMembershipRole(context?.membershipRole || 'viewer', {
            appRole: role,
            workspaceType: context?.organisation?.type || resolvedWorkspaceType,
          }),
          workspaceType: context?.organisation?.type || resolvedWorkspaceType,
        })) {
          if (active) {
            setLoading(false)
          }
          return
        }
        const workspaceId = context?.organisation?.id || currentWorkspace?.id || ''
        const workspaceKind = context?.organisation?.workspaceKind || context?.organisation?.workspace_kind || currentWorkspace?.raw?.workspace_kind || ''
        const [entitlementResponse, invoicesResponse, planResponse, activityResponse] = await Promise.all([
          resolveWorkspaceEntitlements({
            workspaceId,
            workspaceType: context?.organisation?.type || workspaceType,
            workspaceKind,
          }),
          listBillingInvoices(),
          listWorkspacePlanCatalog(),
          listWorkspaceBillingActivity({ workspaceId }),
        ])
        if (active) {
          const billingSummary = buildBillingSummary(entitlementResponse)
          setSubscription(billingSummary)
          setEntitlements(billingSummary.entitlements || {})
          setInvoices(invoicesResponse)
          setPlans(planResponse)
          setWorkspaceId(workspaceId)
          setBillingRequests(activityResponse.requests || [])
          setBillingEvents(activityResponse.events || [])
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message)
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [currentWorkspace?.id, currentWorkspace?.raw?.workspace_kind, reloadToken, role, workspaceType, resolvedWorkspaceType])

  if (!canView) {
    return (
      <div className={settingsPageClass}>
        <SettingsPageHeader
          kicker="Billing"
          title="Subscription and invoice history"
          description={`${administratorLabel} and billing owners can access this section.`}
        />
        <SettingsBanner tone="warning">Billing is restricted to {administratorLabel} in the current role model.</SettingsBanner>
      </div>
    )
  }

  if (loading || !subscription) {
    return <SettingsLoadingState label="Loading billing settings…" />
  }

  const planNameByKey = new Map(plans.map((plan) => [plan.key, plan.name]))
  const getPlanLabel = (planKey) => planNameByKey.get(planKey) || planKey || 'Unknown plan'

  async function handlePlanRequest(planKey) {
    try {
      setRequestingPlanKey(planKey)
      setPlanRequestMessage('')
      await requestWorkspacePlanChange({ workspaceId, planKey })
      setPlanRequestTone('success')
      setPlanRequestMessage('Plan change request submitted for review.')
      setReloadToken((value) => value + 1)
    } catch (requestError) {
      setPlanRequestTone('error')
      setPlanRequestMessage(requestError.message || 'Could not submit the plan change request.')
    } finally {
      setRequestingPlanKey('')
    }
  }

  async function handleCancelRequest(requestId) {
    try {
      setCancelingRequestId(requestId)
      setPlanRequestMessage('')
      await cancelWorkspacePlanChange({ requestId })
      setPlanRequestTone('success')
      setPlanRequestMessage('Plan change request canceled.')
      setReloadToken((value) => value + 1)
    } catch (cancelError) {
      setPlanRequestTone('error')
      setPlanRequestMessage(cancelError.message || 'Could not cancel the plan change request.')
    } finally {
      setCancelingRequestId('')
    }
  }

  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="Billing"
        title="Subscription and invoices"
        description="Review plan details, usage, renewal timing, and historic invoices."
      />

      {error ? <SettingsBanner tone="error">{error}</SettingsBanner> : null}
      {planRequestMessage ? <SettingsBanner tone={planRequestTone}>{planRequestMessage}</SettingsBanner> : null}

      <SettingsSectionCard title="Plan" description="Current commercial subscription for this organisation.">
        <dl className="grid gap-x-8 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1">
            <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">Plan</dt>
            <dd className="text-base font-semibold text-[#162334]">{subscription.planName}</dd>
            {subscription.source === 'fallback' ? <dd className="text-xs font-medium text-[#7b8da6]">Default plan until subscription records are seeded.</dd> : null}
          </div>
          <div className="space-y-1">
            <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">Billing</dt>
            <dd className="text-base font-semibold capitalize text-[#162334]">{subscription.billingType}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">Amount</dt>
            <dd className="text-base font-semibold text-[#162334]">{formatCurrency(subscription.monthlyAmount)}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">Renewal</dt>
            <dd className="text-sm font-medium text-[#51657b]">
              {subscription.renewalDate ? new Date(subscription.renewalDate).toLocaleDateString() : 'Not set'}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">Included branches</dt>
            <dd className="text-sm font-medium text-[#51657b]">{formatEntitlementValue(subscription.includedBranches)}</dd>
          </div>
          <div className="space-y-1">
            <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">Included users</dt>
            <dd className="text-sm font-medium text-[#51657b]">{formatEntitlementValue(subscription.includedUsers)}</dd>
          </div>
        </dl>
      </SettingsSectionCard>

      <SettingsSectionCard title="Available plans" description="Plan changes are submitted to billing operations for approval.">
        <div className="grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => {
            const current = plan.key === subscription.planKey
            return (
              <div key={plan.key} className="rounded-lg border border-[#dbe5ef] bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold text-[#162334]">{plan.name}</h3>
                    <p className="text-sm text-[#51657b]">{plan.description}</p>
                  </div>
                  {current ? <span className="rounded-full bg-[#eef6f0] px-3 py-1 text-xs font-semibold text-[#2d7a46]">Current</span> : null}
                </div>
                <div className="mt-4 text-lg font-semibold text-[#162334]">
                  {plan.monthlyAmount === null ? 'Custom' : formatCurrency(plan.monthlyAmount)}
                </div>
                <dl className="mt-4 grid gap-2 text-sm text-[#51657b]">
                  <div className="flex items-center justify-between gap-3">
                    <dt>Users</dt>
                    <dd className="font-semibold text-[#162334]">{formatEntitlementValue(plan.entitlements?.[ENTITLEMENT_KEYS.maxUsers])}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>Branches</dt>
                    <dd className="font-semibold text-[#162334]">{formatEntitlementValue(plan.entitlements?.[ENTITLEMENT_KEYS.maxBranches])}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt>Applications</dt>
                    <dd className="font-semibold text-[#162334]">{formatEntitlementValue(plan.entitlements?.[ENTITLEMENT_KEYS.monthlyBondApplications])}</dd>
                  </div>
                </dl>
                <Button
                  type="button"
                  variant={current ? 'secondary' : 'primary'}
                  className="mt-5 w-full"
                  disabled={current || requestingPlanKey === plan.key}
                  onClick={() => handlePlanRequest(plan.key)}
                >
                  {current ? 'Current plan' : requestingPlanKey === plan.key ? 'Submitting...' : 'Request plan'}
                </Button>
              </div>
            )
          })}
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard title="Plan requests" description="Track requested plan changes and their review status.">
        {!billingRequests.length ? (
          <SettingsEmptyState
            title="No plan requests yet"
            description="Plan change requests submitted from billing settings will appear here."
          />
        ) : (
          <div className={settingsTableClass}>
            <div className="hidden grid-cols-[1fr_0.8fr_0.8fr_0.8fr_auto] gap-4 border-b border-[#e4ebf3] bg-[#f4f8fb] px-5 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7b8da6] md:grid">
              <span>Request</span>
              <span>Status</span>
              <span>Submitted</span>
              <span>Reviewed</span>
              <span>Action</span>
            </div>
            <div className="divide-y divide-[#e9eff5]">
              {billingRequests.map((request) => (
                <div key={request.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_0.8fr_0.8fr_0.8fr_auto] md:items-center md:gap-4">
                  <div className="space-y-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] md:hidden">Request</span>
                    <strong className="text-sm text-[#162334]">
                      {getPlanLabel(request.currentPlanKey)} to {getPlanLabel(request.requestedPlanKey)}
                    </strong>
                    {request.note ? <p className="text-xs text-[#6b7d93]">{request.note}</p> : null}
                  </div>
                  <div className="space-y-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] md:hidden">Status</span>
                    <span className="inline-flex rounded-full border border-[#d7e3ef] bg-white px-3 py-1 text-xs font-semibold capitalize text-[#51657b]">
                      {request.status}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] md:hidden">Submitted</span>
                    <span className="text-sm text-[#51657b]">{formatDateTime(request.createdAt)}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] md:hidden">Reviewed</span>
                    <span className="text-sm text-[#51657b]">{request.reviewedAt ? formatDateTime(request.reviewedAt) : 'Pending'}</span>
                  </div>
                  <div>
                    {request.status === 'pending' ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={cancelingRequestId === request.id}
                        onClick={() => handleCancelRequest(request.id)}
                      >
                        {cancelingRequestId === request.id ? 'Canceling...' : 'Cancel'}
                      </Button>
                    ) : (
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8da0b6]">Closed</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </SettingsSectionCard>

      <SettingsSectionCard title="Billing activity" description="Recent subscription and plan request audit events.">
        {!billingEvents.length ? (
          <SettingsEmptyState
            title="No billing activity yet"
            description="Billing events will appear here after requests are submitted, canceled, approved, or rejected."
          />
        ) : (
          <div className={settingsTableClass}>
            <div className="hidden grid-cols-[1fr_0.9fr_0.9fr] gap-4 border-b border-[#e4ebf3] bg-[#f4f8fb] px-5 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7b8da6] md:grid">
              <span>Event</span>
              <span>Plan change</span>
              <span>When</span>
            </div>
            <div className="divide-y divide-[#e9eff5]">
              {billingEvents.map((event) => (
                <div key={event.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_0.9fr_0.9fr] md:items-center md:gap-4">
                  <div className="space-y-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] md:hidden">Event</span>
                    <strong className="text-sm capitalize text-[#162334]">{formatEventType(event.eventType)}</strong>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] md:hidden">Plan change</span>
                    <span className="text-sm text-[#51657b]">
                      {event.previousPlanKey || event.nextPlanKey
                        ? `${getPlanLabel(event.previousPlanKey)} to ${getPlanLabel(event.nextPlanKey)}`
                        : 'No plan change'}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] md:hidden">When</span>
                    <span className="text-sm text-[#51657b]">{formatDateTime(event.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Usage"
        description="Current workspace usage against your active subscription limits."
        actions={
          <Button type="button" variant="secondary">
            Contact Support
          </Button>
        }
      >
        <dl className="grid gap-x-8 gap-y-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1">
            <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">Active branches</dt>
            <dd className="text-base font-semibold text-[#162334]">
              {subscription.activeBranches} / {formatEntitlementValue(subscription.includedBranches)}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">Users / seats</dt>
            <dd className="text-base font-semibold text-[#162334]">
              {subscription.activeUsers} / {formatEntitlementValue(subscription.includedUsers)}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">Bond applications</dt>
            <dd className="text-base font-semibold text-[#162334]">
              {subscription.monthlyBondApplications} / {formatEntitlementValue(subscription.includedMonthlyBondApplications)}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">Status</dt>
            <dd className="text-sm font-medium capitalize text-[#51657b]">{subscription.status.replace(/_/g, ' ')}</dd>
          </div>
        </dl>
      </SettingsSectionCard>

      <SettingsSectionCard title="Entitlements" description="Feature access is resolved from the workspace plan and any active overrides.">
        <dl className="grid gap-x-8 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            ['Reporting', entitlements[ENTITLEMENT_KEYS.reportingLevel]],
            ['Integrations', entitlements[ENTITLEMENT_KEYS.integrations]],
            ['Custom branding', entitlements[ENTITLEMENT_KEYS.customBranding]],
            ['API access', entitlements[ENTITLEMENT_KEYS.apiAccess]],
            ['White label', entitlements[ENTITLEMENT_KEYS.whiteLabel]],
            ['Support', entitlements[ENTITLEMENT_KEYS.supportLevel]],
          ].map(([label, value]) => (
            <div key={label} className="space-y-1">
              <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8da6]">{label}</dt>
              <dd className="text-sm font-medium capitalize text-[#51657b]">{formatEntitlementValue(value)}</dd>
            </div>
          ))}
        </dl>
      </SettingsSectionCard>

      <SettingsSectionCard title="Billing history" description="Historic invoice list for the current organisation subscription.">
        {!invoices.length ? (
          <SettingsEmptyState
            title="No billing invoices available yet"
            description="Invoices will appear here once billing records are added."
          />
        ) : (
          <div className={settingsTableClass}>
            <div className="hidden grid-cols-[1fr_0.8fr_0.8fr_0.8fr_0.8fr] gap-4 border-b border-[#e4ebf3] bg-[#f4f8fb] px-5 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#7b8da6] md:grid">
              <span>Invoice</span>
              <span>Issued</span>
              <span>Status</span>
              <span>Amount</span>
              <span>Paid</span>
            </div>
            <div className="divide-y divide-[#e9eff5]">
              {invoices.map((invoice) => (
                <div key={invoice.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_0.8fr_0.8fr_0.8fr_0.8fr] md:items-center md:gap-4">
                  <div className="space-y-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] md:hidden">Invoice</span>
                    <strong className="text-sm text-[#162334]">{invoice.invoiceNumber}</strong>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] md:hidden">Issued</span>
                    <span className="text-sm text-[#51657b]">{invoice.issuedAt ? new Date(invoice.issuedAt).toLocaleDateString() : '—'}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] md:hidden">Status</span>
                    <span className="inline-flex rounded-full border border-[#d7e3ef] bg-white px-3 py-1 text-xs font-semibold capitalize text-[#51657b]">
                      {invoice.status}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] md:hidden">Amount</span>
                    <span className="text-sm font-semibold text-[#162334]">{formatCurrency(invoice.amount)}</span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-[#8da0b6] md:hidden">Paid</span>
                    <span className="text-sm text-[#51657b]">{invoice.paidAt ? new Date(invoice.paidAt).toLocaleDateString() : '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </SettingsSectionCard>
    </div>
  )
}
